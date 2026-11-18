@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -File "%~dp0Start-Kiosque.ps1" -Restart
if errorlevel 1 (
    echo.
    echo Le kiosque s'est arrete ou n'a pas pu demarrer. Voir le message ci-dessus.
    echo Si vous venez de le relancer depuis une autre fenetre, c'est normal : fermez celle-ci.
    pause
    exit /b 1
)
endlocal
