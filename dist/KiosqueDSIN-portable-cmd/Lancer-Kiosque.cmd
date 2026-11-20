@echo off
setlocal EnableExtensions
cd /d "%~dp0"

if not exist "runtime\bin\java.exe" (
  echo [ERREUR] Runtime Java introuvable : runtime\bin\java.exe
  pause
  exit /b 1
)

if not exist "app\miaoudernisation-bff-1.0.0-SNAPSHOT-runner.jar" (
  echo [ERREUR] JAR applicatif introuvable : app\miaoudernisation-bff-1.0.0-SNAPSHOT-runner.jar
  pause
  exit /b 1
)

if not exist "config\application.properties" (
  mkdir "config" >nul 2>&1
  > "config\application.properties" echo thecatapi.api-key=
)

echo [INFO] Demarrage du serveur kiosque...
echo [INFO] URL locale : http://127.0.0.1:8080
echo [INFO] Arret : Ctrl+C
echo.

"runtime\bin\java.exe" ^
  -Djavax.net.ssl.trustStoreType=Windows-ROOT ^
  -Djavax.net.ssl.trustStore=NONE ^
  -Dquarkus.http.host=0.0.0.0 ^
  -Dquarkus.http.port=8080 ^
  -jar "app\miaoudernisation-bff-1.0.0-SNAPSHOT-runner.jar"

set "exitCode=%errorlevel%"
if not "%exitCode%"=="0" (
  echo.
  echo [ERREUR] Le serveur s'est arrete avec le code %exitCode%.
  echo Verifiez le port 8080 et la configuration dans config\application.properties.
  pause
)
exit /b %exitCode%
