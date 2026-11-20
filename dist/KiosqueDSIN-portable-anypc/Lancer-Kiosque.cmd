@echo off
setlocal EnableExtensions
cd /d "%~dp0"

if not exist "runtime\bin\java.exe" (
  echo [ERREUR] Runtime Java introuvable : runtime\bin\java.exe
  pause
  exit /b 1
)

if not exist "app\quarkus-app\quarkus-run.jar" (
  echo [ERREUR] Application introuvable : app\quarkus-app\quarkus-run.jar
  pause
  exit /b 1
)

if not exist "config\application.properties" (
  mkdir "config" >nul 2>&1
  > "config\application.properties" (
    echo # Configuration locale
    echo thecatapi.api-key=
  )
)

set "PORT="
for /f %%P in ('powershell -NoProfile -ExecutionPolicy Bypass -Command "$candidate = $null; foreach ($p in 8080..8090) { if (-not (Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort $p -State Listen -ErrorAction SilentlyContinue)) { $candidate = $p; break } }; if ($candidate) { Write-Output $candidate }"') do set "PORT=%%P"
if "%PORT%"=="" (
  echo [ERREUR] Aucun port libre trouve entre 8080 et 8090.
  pause
  exit /b 1
)

echo [INFO] Demarrage du serveur kiosque...
if not "%PORT%"=="8080" (
  echo [INFO] Port 8080 deja utilise, bascule sur le port %PORT%.
)
echo [INFO] URL locale : http://127.0.0.1:%PORT%
echo [INFO] Arret : Ctrl+C
echo.
start "" "http://127.0.0.1:%PORT%" >nul 2>&1

"runtime\bin\java.exe" ^
  -Djavax.net.ssl.trustStoreType=Windows-ROOT ^
  -Djavax.net.ssl.trustStore=NONE ^
  -Dquarkus.http.host=127.0.0.1 ^
  -Dquarkus.http.port=%PORT% ^
  -Dquarkus.http.host-validation.require-localhost=false ^
  -Dquarkus.config.locations=.\config\application.properties ^
  -jar "app\quarkus-app\quarkus-run.jar"

set "exitCode=%errorlevel%"
if not "%exitCode%"=="0" (
  echo.
  echo [ERREUR] Le serveur s'est arrete avec le code %exitCode%.
  echo Verifiez la configuration dans config\application.properties.
  pause
)
exit /b %exitCode%
