# start-dynamic-worker.ps1
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$workerDir = Join-Path $root "python_worker"
$pythonExe = Join-Path $workerDir "venv\Scripts\python.exe"
$workerScript = Join-Path $workerDir "main.py"
$logDir = Join-Path $root "service_logs"

if (!(Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir | Out-Null
}

$outLog = Join-Path $logDir "dynamic-worker.out.log"
$errLog = Join-Path $logDir "dynamic-worker.err.log"

$command = @"
& '$pythonExe' '$workerScript'
"@

Write-Host "Starting Dynamic Tracking Worker..." -ForegroundColor Cyan
Write-Host "This worker will automatically switch to the camera you select on the Dashboard." -ForegroundColor Yellow

Start-Process `
    -FilePath "powershell.exe" `
    -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $command) `
    -WorkingDirectory $root `
    -RedirectStandardOutput $outLog `
    -RedirectStandardError $errLog `
    -WindowStyle Minimized

Write-Host "Dynamic worker started. Logs: service_logs\dynamic-worker.out.log" -ForegroundColor Green
