param(
    [switch]$SkipKioskStart,
    [string]$TunnelHost = 'https://loca.lt',
    [string]$Subdomain = 'miaoudernisation',
    [int]$WaitSeconds = 60,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$scriptRoot = Split-Path -Parent $PSCommandPath
$logsDir = Join-Path $scriptRoot 'logs'
$logFile = Join-Path $logsDir ("partager-kiosque-{0}.log" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
$nodeCaFile = $null
$previousNodeExtraCa = $env:NODE_EXTRA_CA_CERTS
$previousNpmCaFile = $env:NPM_CONFIG_CAFILE
$previousNpmStrictSsl = $env:NPM_CONFIG_STRICT_SSL

New-Item -ItemType Directory -Path $logsDir -Force | Out-Null

function Write-Trace([string]$Message, [ConsoleColor]$Color = [ConsoleColor]::Gray) {
    $line = "[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $Message
    Write-Host $line -ForegroundColor $Color
    Add-Content -LiteralPath $logFile -Value $line
}

function Get-KiosqueProcess {
    @(Get-CimInstance Win32_Process -Filter "Name = 'java.exe'" -ErrorAction SilentlyContinue |
            Where-Object { $_.CommandLine -match 'app\\quarkus-app\\quarkus-run.jar' }) |
        Select-Object -First 1
}

function Get-KiosquePortFromProcess([object]$Process) {
    if (-not $Process) { return $null }
    $match = [regex]::Match($Process.CommandLine, '-Dquarkus\.http\.port=(\d+)')
    if ($match.Success) { return [int]$match.Groups[1].Value }
    return $null
}

function Test-KiosqueUp([int]$Port) {
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri ("http://127.0.0.1:{0}/config" -f $Port) -TimeoutSec 3
        return $response.StatusCode -eq 200
    }
    catch {
        return $false
    }
}

function Wait-Kiosque([int]$TimeoutSeconds) {
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    do {
        $process = Get-KiosqueProcess
        $port = Get-KiosquePortFromProcess -Process $process
        if ($port -and (Test-KiosqueUp -Port $port)) {
            return $port
        }
        Start-Sleep -Seconds 1
    } while ((Get-Date) -lt $deadline)
    return $null
}

function Export-WindowsRootToPem {
    $path = Join-Path $env:TEMP ("kiosque-node-extra-ca-{0}.pem" -f $PID)
    $certificates = @(foreach ($location in @(
                [Security.Cryptography.X509Certificates.StoreLocation]::LocalMachine,
                [Security.Cryptography.X509Certificates.StoreLocation]::CurrentUser
            )) {
            $store = [Security.Cryptography.X509Certificates.X509Store]::new('Root', $location)
            try {
                $store.Open([Security.Cryptography.X509Certificates.OpenFlags]::ReadOnly)
                foreach ($certificate in $store.Certificates) { $certificate }
            }
            finally {
                $store.Close()
            }
        })
    $uniqueCertificates = @($certificates | Sort-Object Thumbprint -Unique)
    $pem = foreach ($certificate in $uniqueCertificates) {
        '-----BEGIN CERTIFICATE-----'
        [Convert]::ToBase64String($certificate.RawData, [Base64FormattingOptions]::InsertLineBreaks)
        '-----END CERTIFICATE-----'
    }
    if (-not $pem) {
        throw 'Aucun certificat racine Windows disponible pour npm.'
    }
    [IO.File]::WriteAllText($path, ($pem -join "`n"), [Text.Encoding]::ASCII)
    return $path
}

function Ensure-NpxAvailable {
    $npx = Get-Command npx -ErrorAction SilentlyContinue
    if (-not $npx) {
        throw 'npx introuvable. Installer Node.js (npm/npx) sur ce poste puis relancer.'
    }

    function Invoke-LocalTunnel([string[]]$Arguments) {
        $tunnelUrl = $null
        $subdomainUnavailable = $false

        & npx @Arguments 2>&1 | ForEach-Object {
            $line = [string]$_
            if ([string]::IsNullOrWhiteSpace($line)) { return }
            Write-Host $line
            Add-Content -LiteralPath $logFile -Value ("[{0}] [LT] {1}" -f (Get-Date -Format 'HH:mm:ss'), $line)
            if ($line -match 'your url is:\s*(https?://\S+)') {
                $tunnelUrl = $Matches[1]
                Write-Trace "URL publique detectee : $tunnelUrl" ([ConsoleColor]::Green)
            }
            if ($line -match '(?i)(subdomain|name).*(already in use|in use|taken)' -or
                $line -match '(?i)this subdomain is already in use') {
                $subdomainUnavailable = $true
            }
        }

        return @{
            ExitCode             = $LASTEXITCODE
            TunnelUrl            = $tunnelUrl
            SubdomainUnavailable = $subdomainUnavailable
        }
    }
}

function Start-KiosqueIfNeeded {
    $currentProcess = Get-KiosqueProcess
    $currentPort = Get-KiosquePortFromProcess -Process $currentProcess
    if ($currentPort -and (Test-KiosqueUp -Port $currentPort)) {
        Write-Trace "Kiosque deja actif sur http://127.0.0.1:$currentPort" ([ConsoleColor]::Green)
        return $currentPort
    }

    if ($SkipKioskStart) {
        throw 'Kiosque non detecte et option -SkipKioskStart active.'
    }

    $launcher = Join-Path $scriptRoot 'Lancer-Kiosque.cmd'
    if (-not (Test-Path -LiteralPath $launcher)) {
        throw "Launcher introuvable : $launcher"
    }

    Write-Trace 'Demarrage du kiosque...' ([ConsoleColor]::Cyan)
    $process = Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', "`"$launcher`"" -WorkingDirectory $scriptRoot -PassThru
    Write-Trace "Processus lance (PID $($process.Id)). Attente du serveur..." ([ConsoleColor]::DarkGray)

    $detectedPort = Wait-Kiosque -TimeoutSeconds $WaitSeconds
    if (-not $detectedPort) {
        throw "Le kiosque ne repond pas dans les ${WaitSeconds}s."
    }
    Write-Trace "Kiosque joignable sur http://127.0.0.1:$detectedPort" ([ConsoleColor]::Green)
    return $detectedPort
}

function Start-LocalTunnel([int]$Port) {
    Ensure-NpxAvailable
    $script:nodeCaFile = Export-WindowsRootToPem
    $env:NODE_EXTRA_CA_CERTS = $script:nodeCaFile
    $env:NPM_CONFIG_CAFILE = $script:nodeCaFile
    $env:NPM_CONFIG_STRICT_SSL = 'true'

    $baseArguments = @('--yes', '--package', 'localtunnel', 'lt', '--port', "$Port", '--host', $TunnelHost, '--print-requests')
    $requestedSubdomain = if ($Subdomain) { $Subdomain.Trim() } else { '' }
    $arguments = @($baseArguments)
    if ($requestedSubdomain) {
        $arguments += @('--subdomain', $requestedSubdomain)
    }
    Write-Trace "Commande : npx $($arguments -join ' ')" ([ConsoleColor]::DarkGray)
    Write-Trace "URL locale : http://127.0.0.1:$Port" ([ConsoleColor]::DarkGray)
    if ($requestedSubdomain) {
        Write-Trace "Sous-domaine demande : $requestedSubdomain.loca.lt" ([ConsoleColor]::DarkGray)
    }

    if ($DryRun) {
        Write-Trace 'Dry-run : tunnel non lance.' ([ConsoleColor]::Yellow)
        return
    }

    Write-Trace 'Attendre la ligne "your url is: https://...".' ([ConsoleColor]::Green)
    Write-Trace 'Arret du partage : Ctrl+C' ([ConsoleColor]::Yellow)

    $result = Invoke-LocalTunnel -Arguments $arguments
    if ($result.SubdomainUnavailable) {
        Write-Trace "Sous-domaine '$requestedSubdomain' indisponible. Nouvelle tentative sans sous-domaine fixe..." ([ConsoleColor]::Yellow)
        $fallbackArguments = @($baseArguments)
        Write-Trace "Commande fallback : npx $($fallbackArguments -join ' ')" ([ConsoleColor]::DarkGray)
        $result = Invoke-LocalTunnel -Arguments $fallbackArguments
    }

    if ($result.ExitCode -ne 0) {
        throw "Localtunnel s'est arrete avec le code $($result.ExitCode)."
    }
}

try {
    Write-Trace '=== Partage kiosque (npx localtunnel) ===' ([ConsoleColor]::White)
    Write-Trace "Journal : $logFile" ([ConsoleColor]::DarkGray)
    $port = Start-KiosqueIfNeeded
    Start-LocalTunnel -Port $port
}
catch {
    Write-Trace "ERREUR : $($_.Exception.Message)" ([ConsoleColor]::Red)
    exit 1
}
finally {
    if ($nodeCaFile -and (Test-Path -LiteralPath $nodeCaFile)) {
        Remove-Item -LiteralPath $nodeCaFile -ErrorAction SilentlyContinue
    }
    $env:NODE_EXTRA_CA_CERTS = $previousNodeExtraCa
    $env:NPM_CONFIG_CAFILE = $previousNpmCaFile
    $env:NPM_CONFIG_STRICT_SSL = $previousNpmStrictSsl
}
