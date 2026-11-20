@echo off
setlocal EnableExtensions
cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$procId = Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty OwningProcess; if (-not $procId) { Write-Host 'Aucun serveur kiosque detecte sur 127.0.0.1:8080.'; exit 0 }; $p = Get-CimInstance Win32_Process -Filter \"ProcessId = $procId\"; if (-not $p -or $p.Name -ne 'java.exe' -or $p.CommandLine -notmatch 'miaoudernisation-bff-1.0.0-SNAPSHOT-runner.jar') { Write-Host 'Le port 8080 est occupe par un autre processus. Arret annule.'; exit 1 }; Stop-Process -Id $procId -ErrorAction Stop; Write-Host ('Serveur kiosque arrete (PID {0}).' -f $procId)"

set "exitCode=%errorlevel%"
if not "%exitCode%"=="0" pause
exit /b %exitCode%
