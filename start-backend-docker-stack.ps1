# start-backend-docker-stack.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "Starting Docker backend stack: postgres + redis + mediamtx + backend + python-worker" -ForegroundColor Cyan
docker compose -f (Join-Path $root "docker-compose.yml") --profile worker up -d --build postgres redis mediamtx backend python-worker

Write-Host ""
Write-Host "Frontend should remain local at http://127.0.0.1:5173/" -ForegroundColor Yellow
Write-Host "Backend API should be available at http://127.0.0.1:8001/" -ForegroundColor Yellow
