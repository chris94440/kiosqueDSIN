param([switch]$TestOnly)
$ErrorActionPreference = 'Stop'
$previousCa = $env:NODE_EXTRA_CA_CERTS
$previousMaven = $env:MAVEN_OPTS
$caFile = $null

function Get-NpmLatestLogFile {
    try {
        $npmCache = (& npm config get cache 2>$null).Trim()
        if ([string]::IsNullOrWhiteSpace($npmCache) -or $npmCache -eq 'undefined') { return $null }
        $logsDir = Join-Path $npmCache '_logs'
        if (-not (Test-Path -LiteralPath $logsDir)) { return $null }
        return (Get-ChildItem -LiteralPath $logsDir -File | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1 -ExpandProperty FullName)
    }
    catch {
        return $null
    }
}

function Test-NpmRegistryReachable([string]$RegistryUrl, [int]$TimeoutSeconds = 8) {
    if ([string]::IsNullOrWhiteSpace($RegistryUrl) -or $RegistryUrl -eq 'undefined' -or $RegistryUrl -eq '(non defini)') {
        return $true
    }

    try {
        $base = [Uri]$RegistryUrl
        $probe = [Uri]::new($base, '-/ping?write=true')
        Invoke-WebRequest -UseBasicParsing -Uri $probe.AbsoluteUri -Method Get -TimeoutSec $TimeoutSeconds -MaximumRedirection 0 -ErrorAction Stop | Out-Null
        return $true
    }
    catch {
        $httpResponse = $_.Exception.Response
        if ($httpResponse) {
            # 401/403/etc. signifient que le serveur est joignable.
            return $true
        }
        return $false
    }
}

function Install-AngularDependencies {
    $previousNpmRegistry = $env:NPM_CONFIG_REGISTRY
    try {
        $publicRegistry = 'https://registry.npmjs.org/'
        $lockFile = Join-Path (Get-Location) 'package-lock.json'
        $npmInstallMode = if (Test-Path -LiteralPath $lockFile) { 'ci' } else { 'install' }
        $npmInstallArgs = @($npmInstallMode, '--no-audit', '--no-fund')

        $currentRegistry = (& npm config get registry 2>$null).Trim()
        if ([string]::IsNullOrWhiteSpace($currentRegistry) -or $currentRegistry -eq 'undefined') {
            $currentRegistry = '(non defini)'
        }
        $registryForInstall = $currentRegistry
        if ($npmInstallMode -eq 'install') {
            Write-Host 'package-lock.json absent : bascule vers "npm install".' -ForegroundColor Yellow
        }
        Write-Host "Installation des dependances Angular (npm $npmInstallMode)..."
        Write-Host "Registry npm courant : $currentRegistry"

        if ($currentRegistry -ne '(non defini)' -and $currentRegistry -ne $publicRegistry) {
            if (-not (Test-NpmRegistryReachable -RegistryUrl $currentRegistry -TimeoutSeconds 8)) {
                Write-Host "Registry npm courant injoignable rapidement. Bascule immediate vers $publicRegistry." -ForegroundColor Yellow
                $env:NPM_CONFIG_REGISTRY = $publicRegistry
                $registryForInstall = $publicRegistry
            }
        }

        & npm @npmInstallArgs
        if ($LASTEXITCODE -eq 0) { return }

        $exitCodes = @($LASTEXITCODE)
        Write-Host "npm $npmInstallMode en echec (code $LASTEXITCODE)." -ForegroundColor Yellow
        if ($registryForInstall -ne $publicRegistry) {
            Write-Host "Nouvelle tentative via $publicRegistry..." -ForegroundColor Yellow
            $env:NPM_CONFIG_REGISTRY = $publicRegistry
            & npm @npmInstallArgs
            $exitCodes += $LASTEXITCODE
            if ($LASTEXITCODE -eq 0) { return }
            Write-Host "Deuxieme tentative en echec (code $LASTEXITCODE)." -ForegroundColor Yellow
        }

        $latestNpmLog = Get-NpmLatestLogFile
        if ($latestNpmLog) {
            throw "Installation Angular impossible (codes: $($exitCodes -join ', ')). Voir le journal npm : $latestNpmLog"
        }
        throw "Installation Angular impossible (codes: $($exitCodes -join ', ')). Verifier le proxy/certificat et la registry npm."
    }
    finally {
        if ($null -eq $previousNpmRegistry) {
            Remove-Item Env:\NPM_CONFIG_REGISTRY -ErrorAction SilentlyContinue
        }
        else {
            $env:NPM_CONFIG_REGISTRY = $previousNpmRegistry
        }
    }
}

try {
    if (-not $previousCa) {
        $certificates = @(foreach ($location in @(
            [Security.Cryptography.X509Certificates.StoreLocation]::LocalMachine,
            [Security.Cryptography.X509Certificates.StoreLocation]::CurrentUser
        )) {
            $store = [Security.Cryptography.X509Certificates.X509Store]::new('Root', $location)
            try {
                $store.Open([Security.Cryptography.X509Certificates.OpenFlags]::ReadOnly)
                foreach ($certificate in $store.Certificates) { $certificate }
            }
            finally { $store.Close() }
        })
        $pem = foreach ($certificate in ($certificates | Sort-Object Thumbprint -Unique)) {
            '-----BEGIN CERTIFICATE-----'
            [Convert]::ToBase64String($certificate.RawData, [Base64FormattingOptions]::InsertLineBreaks)
            '-----END CERTIFICATE-----'
        }
        if (-not $pem) { throw 'Aucune racine Windows disponible. Configurer NODE_EXTRA_CA_CERTS avec un PEM approuve.' }
        $caFile = [IO.Path]::GetTempFileName()
        [IO.File]::WriteAllText($caFile, ($pem -join "`n"), [Text.Encoding]::ASCII)
        $env:NODE_EXTRA_CA_CERTS = $caFile
    }
    if ($previousMaven -notmatch 'javax\.net\.ssl\.trustStore') {
        $env:MAVEN_OPTS = "$previousMaven -Djavax.net.ssl.trustStoreType=Windows-ROOT -Djavax.net.ssl.trustStore=NONE"
    }
    Push-Location (Join-Path $PSScriptRoot 'frontend')
    try {
        if (-not (Test-Path '.\node_modules\@angular\cli\bin\ng.js')) {
            Install-AngularDependencies
        }
        if (-not $TestOnly -or -not (Test-Path '.\dist\browser\index.html')) {
            & npm run build
            if ($LASTEXITCODE -ne 0) { throw 'Build Angular en echec.' }
        }
        if ($TestOnly) {
            & npm test
            if ($LASTEXITCODE -ne 0) { throw 'Tests Angular en echec.' }
        }
    }
    finally { Pop-Location }

    Push-Location (Join-Path $PSScriptRoot 'backend')
    try {
        $goal = if ($TestOnly) { 'test' } else { 'package' }
        & '.\mvnw.cmd' '-B' '-q' $goal
        if ($LASTEXITCODE -ne 0) { throw "Maven $goal en echec." }
    }
    finally { Pop-Location }
}
finally {
    $env:NODE_EXTRA_CA_CERTS = $previousCa
    $env:MAVEN_OPTS = $previousMaven
    if ($caFile -and (Test-Path -LiteralPath $caFile)) { Remove-Item -LiteralPath $caFile }
}
