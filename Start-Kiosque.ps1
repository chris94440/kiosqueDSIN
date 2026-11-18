param([switch]$Restart)
$ErrorActionPreference = 'Stop'
$appDir = Join-Path $PSScriptRoot 'backend\target\quarkus-app'
$jar = Join-Path $appDir 'quarkus-run.jar'
$appModel = Join-Path $appDir 'quarkus\quarkus-application.dat'
$requiredArtifacts = @($jar, $appModel)
$openApiSource = Join-Path $PSScriptRoot 'openapi.yaml'
$openApiPackaged = Join-Path $PSScriptRoot 'backend\target\classes\META-INF\resources\openapi.yaml'
$needsBuild = $false
$buildReason = ''
$missingArtifacts = @($requiredArtifacts | Where-Object { -not (Test-Path -LiteralPath $_) })
if ($missingArtifacts.Count -gt 0) {
    $needsBuild = $true
    $buildReason = 'artefacts applicatifs manquants'
}
elseif (Test-Path -LiteralPath $openApiSource) {
    if (-not (Test-Path -LiteralPath $openApiPackaged)) {
        $needsBuild = $true
        $buildReason = 'contrat OAS non empaqueté'
    }
    elseif ((Get-Item -LiteralPath $openApiSource).LastWriteTimeUtc -gt (Get-Item -LiteralPath $openApiPackaged).LastWriteTimeUtc) {
        $needsBuild = $true
        $buildReason = 'openapi.yaml plus récent que la copie servie'
    }
}
if ($needsBuild) {
    Write-Host "Rebuild du kiosque ($buildReason)..."
    & (Join-Path $PSScriptRoot 'Build-Kiosque.ps1')
}
$missingArtifacts = @($requiredArtifacts | Where-Object { -not (Test-Path -LiteralPath $_) })
if ($missingArtifacts.Count -gt 0) {
    throw ("Application non compilee ou incomplete. Relancer Build-Kiosque.ps1. Fichiers manquants : " +
            (($missingArtifacts | ForEach-Object { $_.Replace($PSScriptRoot + '\', '') }) -join ', '))
}

if ($Restart) {
    $listeners = @(Get-NetTCPConnection -LocalAddress '127.0.0.1' -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue)
    $processIds = @($listeners | Select-Object -ExpandProperty OwningProcess -Unique)
    foreach ($serverProcessId in $processIds) {
        $process = Get-CimInstance Win32_Process -Filter "ProcessId = $serverProcessId"
        if (-not $process -or $process.Name -ne 'java.exe' -or $process.CommandLine -notmatch [regex]::Escape($jar)) {
            throw 'Le port 8080 appartient a un autre processus ou mode de lancement. Aucun processus ne sera arrete.'
        }
    }
    foreach ($serverProcessId in $processIds) {
        $process = Get-Process -Id $serverProcessId
        Write-Host "Arret du serveur du kiosque (PID $serverProcessId)..."
        Stop-Process -Id $serverProcessId -ErrorAction Stop
        if (-not $process.WaitForExit(10000)) { throw 'Le serveur precedent ne s''arrete pas.' }
    }
}

Push-Location (Join-Path $PSScriptRoot 'backend')
try {
    $trustOptions = @()
    if ($env:JAVA_TOOL_OPTIONS -notmatch 'javax\.net\.ssl\.trustStore') {
        $trustOptions = @('-Djavax.net.ssl.trustStoreType=Windows-ROOT', '-Djavax.net.ssl.trustStore=NONE')
    }
    Write-Host 'Kiosque Angular + BFF Quarkus : http://127.0.0.1:8080'
    Write-Host 'Cle serveur : backend\config\application.properties (pre-remplie dans le champ "Cle API", modifiable).'
    Write-Host 'Contrat Swagger Editor : openapi.yaml (racine du projet), servi via /openapi.yaml.'
    & java @trustOptions '-jar' $jar
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Le serveur Quarkus s'est arrete (code $LASTEXITCODE)." -ForegroundColor Yellow
        exit 1
    }
}
finally { Pop-Location }
