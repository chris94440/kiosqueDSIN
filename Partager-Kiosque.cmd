@echo off
setlocal
cd /d "%~dp0"
echo [INFO] Lancement du partage kiosque (npx localtunnel)...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Partager-Kiosque.ps1"
set "exitCode=%errorlevel%"
if not "%exitCode%"=="0" (
    echo.
    echo Le partage du kiosque a echoue. Voir le message ci-dessus.
    pause
)
exit /b %exitCode%
