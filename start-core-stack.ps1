# start-core-stack.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "Starting Docker core stack: frontend + backend + redis + mediamtx" -ForegroundColor Cyan
docker compose -f (Join-Path $root "docker-compose.yml") up -d --build redis mediamtx backend frontend

Write-Host ""
Write-Host "Core stack is starting." -ForegroundColor Green
Write-Host "Frontend: http://127.0.0.1:5173/" -ForegroundColor Yellow
Write-Host "Backend:  http://127.0.0.1:8001/" -ForegroundColor Yellow
Write-Host ""
Write-Host "If you also want the worker in Docker later:" -ForegroundColor Cyan
Write-Host "docker compose --profile worker up -d python-worker" -ForegroundColor Gray
