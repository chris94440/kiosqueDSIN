param(
    [int]$Port = 8080,
    [switch]$SkipKioskStart,
    [string]$TunnelHost = 'https://loca.lt',
    [switch]$TunnelDebug = $true
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSCommandPath
$kiosqueUrl = "http://127.0.0.1:$Port"
$nodeCaFile = $null
$logsDir = Join-Path $projectRoot 'logs'
New-Item -ItemType Directory -Force -Path $logsDir | Out-Null
$logFile = Join-Path $logsDir ("partager-kiosque-{0}.log" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))

function Write-Trace([string]$Message, [ConsoleColor]$Color = [ConsoleColor]::Gray) {
    $line = "[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $Message
    Write-Host $line -ForegroundColor $Color
    Add-Content -LiteralPath $logFile -Value $line
}

function Write-Step([string]$Message) {
    Write-Trace "==> $Message" ([ConsoleColor]::Cyan)
}

function Wait-Kiosque([int]$TimeoutSeconds = 45) {
    Write-Step "Attente du kiosque sur $kiosqueUrl (max ${TimeoutSeconds}s)"
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    $started = Get-Date
    $attempt = 0
    do {
        $attempt++
        try {
            Invoke-WebRequest -UseBasicParsing -Uri $kiosqueUrl -TimeoutSec 3 | Out-Null
            Write-Trace "Kiosque joignable (tentative $attempt)." ([ConsoleColor]::Green)
            return $true
        }
        catch {
            if (($attempt % 5) -eq 0) {
                $elapsed = [int]((Get-Date) - $started).TotalSeconds
                Write-Trace "Toujours en attente... ${elapsed}s" ([ConsoleColor]::DarkYellow)
            }
        }
        Start-Sleep -Seconds 1
    } while ((Get-Date) -lt $deadline)
    Write-Trace "Kiosque non joignable apres ${TimeoutSeconds}s." ([ConsoleColor]::Red)
    return $false
}

function Test-KiosqueListening {
    try {
        return [bool](Get-NetTCPConnection -LocalAddress '127.0.0.1' -LocalPort $Port -State Listen -ErrorAction Stop | Select-Object -First 1)
    }
    catch {
        return $false
    }
}

function Start-KiosqueIfNeeded {
    if (Test-KiosqueListening) {
        Write-Step "Kiosque deja en ecoute sur $kiosqueUrl"
        return
    }

    $startScript = Join-Path $projectRoot 'Start-Kiosque.ps1'
    if (-not (Test-Path -LiteralPath $startScript)) {
        throw "Script introuvable : $startScript"
    }

    Write-Step "Demarrage du kiosque dans une nouvelle fenetre..."
    $process = Start-Process -FilePath 'powershell.exe' -ArgumentList @(
        '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$startScript`""
    ) -WorkingDirectory $projectRoot -PassThru
    Write-Trace "Fenetre kiosk lancee (PID $($process.Id))." ([ConsoleColor]::DarkGray)
}

function Export-WindowsRootToPem {
    Write-Step "Export des certificats Windows pour npm..."
    $path = Join-Path $env:TEMP "kiosque-node-extra-ca-$PID.pem"
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

    $unique = @($certificates | Sort-Object Thumbprint -Unique)
    $pem = foreach ($certificate in $unique) {
        '-----BEGIN CERTIFICATE-----'
        [Convert]::ToBase64String($certificate.RawData, [Base64FormattingOptions]::InsertLineBreaks)
        '-----END CERTIFICATE-----'
    }
    if (-not $pem) {
        throw 'Aucune racine Windows disponible pour npm.'
    }

    [IO.File]::WriteAllText($path, ($pem -join "`n"), [Text.Encoding]::ASCII)
    Write-Trace "Certificats racine exportes : $($unique.Count)" ([ConsoleColor]::DarkGray)
    Write-Trace "Fichier CA temporaire : $path" ([ConsoleColor]::DarkGray)
    return $path
}

function Invoke-LocalTunnelCommand([string[]]$Arguments) {
    $tunnelUrl = $null
    $remoteErrors = @()
    $watch = [Diagnostics.Stopwatch]::StartNew()

    & npx @Arguments 2>&1 | ForEach-Object {
        $line = [string]$_
        if ([string]::IsNullOrWhiteSpace($line)) {
            return
        }

        Write-Host $line
        Add-Content -LiteralPath $logFile -Value ("[{0}] [LT] {1}" -f (Get-Date -Format 'HH:mm:ss'), $line)

        if ($line -match 'your url is:\s*(https?://\S+)') {
            $tunnelUrl = $Matches[1]
            Write-Trace "URL publique detectee : $tunnelUrl" ([ConsoleColor]::Green)
        }
        if ($line -match 'remote connection error\s+(.+)$') {
            $remoteErrors += $Matches[1].Trim()
        }
    }

    $watch.Stop()
    return @{
        ExitCode        = $LASTEXITCODE
        DurationSeconds = [int][Math]::Round($watch.Elapsed.TotalSeconds)
        TunnelUrl       = $tunnelUrl
        RemoteErrors    = @($remoteErrors | Select-Object -Unique)
    }
}

function Start-LocalTunnel {
    Write-Step "Ouverture du tunnel localtunnel (npx)..."
    $script:nodeCaFile = Export-WindowsRootToPem
    $env:NODE_EXTRA_CA_CERTS = $script:nodeCaFile
    $env:NPM_CONFIG_CAFILE = $script:nodeCaFile
    $env:NPM_CONFIG_STRICT_SSL = 'true'
    if ($TunnelDebug) {
        $env:DEBUG = 'localtunnel*'
        Write-Trace "DEBUG localtunnel active (localtunnel*)." ([ConsoleColor]::DarkGray)
    }
    else {
        Remove-Item Env:\DEBUG -ErrorAction SilentlyContinue
    }
    Write-Trace "NODE_EXTRA_CA_CERTS et NPM_CONFIG_CAFILE renseignes." ([ConsoleColor]::DarkGray)

    Write-Trace "Partage ensuite l'URL HTTPS affichee ci-dessous." ([ConsoleColor]::Green)
    Write-Trace "Arret du tunnel : Ctrl+C" ([ConsoleColor]::Yellow)
    Write-Trace "Host tunnel : $TunnelHost" ([ConsoleColor]::DarkGray)
    $ltArgs = @('--yes', '--package', 'localtunnel', 'lt', '--port', "$Port", '--host', $TunnelHost, '--print-requests')
    $minimumStableSeconds = 90
    $attempts = @(
        @{ Label = 'registre npm configure localement'; Registry = $null },
        @{ Label = 'registry.npmjs.org'; Registry = 'https://registry.npmjs.org/' },
        @{ Label = 'registry.npmjs.org (relance)'; Registry = 'https://registry.npmjs.org/' }
    )

    Write-Trace "Commande : npx $($ltArgs -join ' ')" ([ConsoleColor]::DarkGray)
    Write-Trace "Si l'URL apparait puis disparait vite, le script relance automatiquement." ([ConsoleColor]::DarkYellow)
    Write-Trace "Seuil de stabilite : ${minimumStableSeconds}s." ([ConsoleColor]::DarkGray)

    $attemptIndex = 0
    foreach ($attempt in $attempts) {
        $attemptIndex++
        if ($attempt.Registry) {
            $env:NPM_CONFIG_REGISTRY = $attempt.Registry
        }
        else {
            Remove-Item Env:\NPM_CONFIG_REGISTRY -ErrorAction SilentlyContinue
        }

        Write-Trace "Tentative $attemptIndex : $($attempt.Label)." ([ConsoleColor]::Cyan)
        $result = Invoke-LocalTunnelCommand -Arguments $ltArgs
        $exitCode = [int]$result.ExitCode
        $duration = [int]$result.DurationSeconds
        $tunnelUrl = [string]$result.TunnelUrl
        $remoteErrors = @($result.RemoteErrors)
        Write-Trace "Processus localtunnel termine (code $exitCode, duree ${duration}s)." ([ConsoleColor]::DarkGray)
        if ($remoteErrors.Count -gt 0) {
            Write-Trace "Erreur distante : $($remoteErrors -join ' | ')" ([ConsoleColor]::DarkYellow)
        }

        if ($tunnelUrl -and $duration -ge $minimumStableSeconds) {
            Write-Trace "Tunnel arrete apres ${duration}s (fin volontaire probable)." ([ConsoleColor]::DarkGray)
            return
        }

        if ($tunnelUrl -and $duration -lt $minimumStableSeconds) {
            Write-Trace "Tunnel instable : URL detectee puis fermeture apres ${duration}s (Bad Gateway probable)." ([ConsoleColor]::Yellow)
        }
        elseif (-not $tunnelUrl) {
            Write-Trace "Aucune URL tunnel detectee dans la sortie npx." ([ConsoleColor]::Yellow)
        }
        if ($remoteErrors -match 'ETIMEDOUT') {
            Write-Trace "Diagnostic reseau : timeout vers un port distant localtunnel => flux sortant probablement bloque par le proxy/firewall." ([ConsoleColor]::Yellow)
        }

        if ($attemptIndex -lt $attempts.Count) {
            Write-Trace "Nouvelle tentative dans 3s..." ([ConsoleColor]::DarkYellow)
            Start-Sleep -Seconds 3
        }
    }

    throw "Localtunnel ne reste pas actif. Verifie le proxy/reseau DSIN puis relance ce script."
}

try {
    Write-Trace "=== Partage kiosque DSIN ===" ([ConsoleColor]::White)
    Write-Trace "Journal : $logFile" ([ConsoleColor]::DarkGray)
    Write-Trace "Port cible : $Port" ([ConsoleColor]::DarkGray)
    Write-Trace "Host tunnel : $TunnelHost" ([ConsoleColor]::DarkGray)

    if (-not $SkipKioskStart) {
        Start-KiosqueIfNeeded
    }

    if (-not (Wait-Kiosque -TimeoutSeconds 45)) {
        throw "Le kiosque ne repond pas sur $kiosqueUrl. Lance Start-Kiosque.ps1 puis relance ce script."
    }

    Start-LocalTunnel
}
catch {
    Write-Trace "ERREUR : $($_.Exception.Message)" ([ConsoleColor]::Red)
    if ($_.ScriptStackTrace) {
        Write-Trace "Stack : $($_.ScriptStackTrace)" ([ConsoleColor]::DarkRed)
    }
    Write-Trace "Journal complet : $logFile" ([ConsoleColor]::Yellow)
    exit 1
}
finally {
    if ($nodeCaFile -and (Test-Path -LiteralPath $nodeCaFile)) {
        Remove-Item -LiteralPath $nodeCaFile -ErrorAction SilentlyContinue
        Write-Trace "Fichier CA temporaire supprime." ([ConsoleColor]::DarkGray)
    }
}
