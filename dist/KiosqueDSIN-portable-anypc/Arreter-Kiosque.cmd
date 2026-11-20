@echo off
setlocal EnableExtensions

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$procs = @(Get-CimInstance Win32_Process -Filter \"Name = 'java.exe'\" | Where-Object { $_.CommandLine -match 'app\\quarkus-app\\quarkus-run.jar' }); if ($procs.Count -eq 0) { Write-Host 'Aucun serveur kiosque detecte.'; exit 0 }; foreach ($p in $procs) { Stop-Process -Id $p.ProcessId -ErrorAction Stop; Write-Host ('Serveur kiosque arrete (PID {0}).' -f $p.ProcessId) }"

set "exitCode=%errorlevel%"
if not "%exitCode%"=="0" pause
exit /b %exitCode%
