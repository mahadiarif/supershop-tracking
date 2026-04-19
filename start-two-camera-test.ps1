# start-two-camera-test.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$workerDir = Join-Path $root "python_worker"
$pythonExe = Join-Path $workerDir "venv\Scripts\python.exe"
$workerScript = Join-Path $workerDir "main.py"
$logDir = Join-Path $root "service_logs"

if (!(Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir | Out-Null
}

$workers = @(
    @{
        CameraId = "camera2"
        Confidence = "0.45"
        ProcessEveryNthFrame = "3"
        InferenceImgSize = "640"
        JpegQuality = "50"
    },
    @{
        CameraId = "camera4"
        Confidence = "0.45"
        ProcessEveryNthFrame = "3"
        InferenceImgSize = "640"
        JpegQuality = "50"
    }
)

foreach ($item in $workers) {
    $cameraId = $item.CameraId
    $outLog = Join-Path $logDir "$cameraId.two-camera.out.log"
    $errLog = Join-Path $logDir "$cameraId.two-camera.err.log"

    $command = @"
`$env:FASTAPI_URL='http://127.0.0.1:8001'
`$env:CAMERA_SOURCE='AUTO'
`$env:CAMERA_ID='$cameraId'
`$env:YOLO_MODEL='yolo26n.pt'
`$env:CONFIDENCE='$($item.Confidence)'
`$env:YOLO_TRACKER='bytetrack.yaml'
`$env:HEARTBEAT_INTERVAL='5'
`$env:FRAME_FLUSH_COUNT='1'
`$env:INFERENCE_IMG_SIZE='$($item.InferenceImgSize)'
`$env:PROCESS_EVERY_NTH_FRAME='$($item.ProcessEveryNthFrame)'
`$env:JPEG_QUALITY='$($item.JpegQuality)'
`$env:ALLOWED_CLASSES='ALL'
& '$pythonExe' '$workerScript'
"@

    Start-Process `
        -FilePath "powershell.exe" `
        -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $command) `
        -WorkingDirectory $root `
        -RedirectStandardOutput $outLog `
        -RedirectStandardError $errLog
}

Write-Host ""
Write-Host "Two-camera test workers started." -ForegroundColor Green
Write-Host "Cameras: camera2, camera4" -ForegroundColor Cyan
Write-Host "Mode: person-only, confidence 0.45, process every 3rd frame" -ForegroundColor Yellow
Write-Host ""
Write-Host "Logs:" -ForegroundColor Cyan
Write-Host "  service_logs\camera2.two-camera.out.log"
Write-Host "  service_logs\camera4.two-camera.out.log"
