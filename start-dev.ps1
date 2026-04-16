# start-dev.ps1
$ErrorActionPreference = "Stop"

$root = $PSScriptRoot
$env:PYTHONPATH = $root

Write-Host "Stopping any running instances (Backend, Frontend, MediaMTX)..." -ForegroundColor Yellow
Stop-Process -Name "uvicorn" -Force -ErrorAction SilentlyContinue
Stop-Process -Name "node" -Force -ErrorAction SilentlyContinue
Stop-Process -Name "mediamtx" -Force -ErrorAction SilentlyContinue

Write-Host "Starting MediaMTX..." -ForegroundColor Cyan
Start-Process -FilePath "$root\mediamtx_bin\mediamtx.exe" -ArgumentList "mediamtx.yml" -WorkingDirectory $root -RedirectStandardOutput "$root\mediamtx-dev.log" -RedirectStandardError "$root\mediamtx-dev.err.log" -WindowStyle Hidden

Write-Host "Starting Backend on port 8001..." -ForegroundColor Cyan
# Run Python directly, using -m uvicorn which avoids issues finding the script and does not use reload so it doesn't spawn child processes that could drop out
Start-Process -FilePath "$root\backend\venv\Scripts\python.exe" -ArgumentList "-m", "uvicorn", "backend.main:app", "--port", "8001", "--host", "127.0.0.1" -WorkingDirectory $root -RedirectStandardOutput "$root\backend-dev.log" -RedirectStandardError "$root\backend-dev.err.log" -WindowStyle Hidden

Write-Host "Starting Frontend..." -ForegroundColor Cyan
Start-Process -FilePath "npm.cmd" -ArgumentList "run", "dev" -WorkingDirectory "$root\frontend" -RedirectStandardOutput "$root\frontend-dev.log" -RedirectStandardError "$root\frontend-dev.err.log" -WindowStyle Hidden

Write-Host "All development services started." -ForegroundColor Green
Write-Host "Wait a moment for them to bind to ports."
Write-Host "Backend API is at http://127.0.0.1:8001"
Write-Host "Frontend is at http://localhost:5173"
Write-Host "You can check logs at:"
Write-Host " - backend-dev.log / backend-dev.err.log"
Write-Host " - frontend-dev.log / frontend-dev.err.log"
