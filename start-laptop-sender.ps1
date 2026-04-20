# start-laptop-sender.ps1
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$workerDir = Join-Path $root "python_worker"
$pythonExe = Join-Path $workerDir "venv\Scripts\python.exe"
if (!(Test-Path $pythonExe)) {
    $pythonExe = "python" # Fallback if venv not found
}
$workerScript = Join-Path $workerDir "frame_sender.py"

Write-Host "========================================" -ForegroundColor Green
Write-Host "   METRONET FRAME SENDER (LAPTOP)       " -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host "Reading from: .env" -ForegroundColor Gray

# Run the sender
& $pythonExe $workerScript
