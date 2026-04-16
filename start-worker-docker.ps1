# start-worker-docker.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "Starting Python Worker in Docker against local backend..." -ForegroundColor Cyan
docker compose -f (Join-Path $root "docker-compose.yml") --profile worker up -d --build python-worker

Write-Host ""
Write-Host "Worker container requested." -ForegroundColor Green
Write-Host "Backend should stay local at http://127.0.0.1:8001" -ForegroundColor Yellow
Write-Host "Docker worker will use host.docker.internal to reach the backend." -ForegroundColor Yellow
