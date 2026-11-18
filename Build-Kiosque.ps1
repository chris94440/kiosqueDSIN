param([switch]$TestOnly)
$ErrorActionPreference = 'Stop'
$previousCa = $env:NODE_EXTRA_CA_CERTS
$previousMaven = $env:MAVEN_OPTS
$caFile = $null

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
            & npm ci --no-audit --no-fund
            if ($LASTEXITCODE -ne 0) { throw 'Installation Angular impossible.' }
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
