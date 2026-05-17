from __future__ import annotations

import asyncio
import base64
import os
import tempfile
from concurrent.futures import ThreadPoolExecutor

import cv2
from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import AsyncSessionLocal, get_db
from backend.models.camera import Camera, CameraStatus
from backend.routers.events import DetectionPayload, process_detection
from backend.vps_inference.inference_service import run_inference

router = APIRouter()

_executor = ThreadPoolExecutor(max_workers=1)

ALLOWED_EXTENSIONS = {".mp4", ".avi", ".mov", ".mkv", ".webm"}
MAX_FILE_SIZE = 500 * 1024 * 1024  # 500 MB
UPLOAD_FRAME_SKIP = int(os.getenv("UPLOAD_FRAME_SKIP", "5"))
STREAM_FPS = float(os.getenv("UPLOAD_STREAM_FPS", "8"))  # display rate on dashboard

DEMO_CAMERA_NAME = "Demo Camera"
DEMO_CAMERA_PATH = "demo_feed"


async def _get_or_create_demo_camera(db: AsyncSession) -> Camera:
    result = await db.execute(select(Camera).where(Camera.mediamtx_path == DEMO_CAMERA_PATH))
    camera = result.scalar_one_or_none()
    if camera is None:
        camera = Camera(
            name=DEMO_CAMERA_NAME,
            mediamtx_path=DEMO_CAMERA_PATH,
            rtsp_url="",
            status=CameraStatus.online,
            web_enabled=True,
        )
        db.add(camera)
        await db.commit()
        await db.refresh(camera)
    elif not camera.web_enabled:
        camera.web_enabled = True
        camera.status = CameraStatus.online
        await db.commit()
    return camera


def _extract_frame_b64(frame) -> str:
    _, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
    return base64.b64encode(buf.tobytes()).decode()


async def _stream_video_to_dashboard(video_path: str, camera_id: str) -> dict:
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return {"error": "Cannot open video"}

    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    frame_delay = 1.0 / STREAM_FPS

    frame_idx = 0
    loop = asyncio.get_event_loop()

    try:
        while True:  # loop forever
            ret, frame = cap.read()
            if not ret:
                # end of video — rewind and loop
                cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                frame_idx = 0
                continue

            if frame_idx % UPLOAD_FRAME_SKIP == 0:
                frame_b64 = await loop.run_in_executor(_executor, _extract_frame_b64, frame)
                result = await loop.run_in_executor(
                    _executor, run_inference, camera_id, frame_b64, width, height
                )
                async with AsyncSessionLocal() as db:
                    try:
                        payload = DetectionPayload(**result)
                        await process_detection(payload, db)
                    except Exception as exc:
                        print(f"Stream save error: {exc}")
                await asyncio.sleep(frame_delay)

            frame_idx += 1
    finally:
        cap.release()
        try:
            os.unlink(video_path)
        except OSError:
            pass


@router.post("/upload-video")
async def upload_video(
    background_tasks: BackgroundTasks,
    camera_id: str = Form(default="demo"),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Unsupported format. Use: {', '.join(ALLOWED_EXTENSIONS)}")

    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File too large. Max 500 MB.")

    # Resolve camera: "demo" → auto-create Demo Camera
    if camera_id == "demo":
        camera = await _get_or_create_demo_camera(db)
        resolved_camera_id = str(camera.id)
    else:
        resolved_camera_id = camera_id

    # Save to temp file (background task will delete it)
    tmp = tempfile.NamedTemporaryFile(suffix=ext, delete=False)
    tmp.write(contents)
    tmp.close()

    background_tasks.add_task(_stream_video_to_dashboard, tmp.name, resolved_camera_id)

    return {
        "ok": True,
        "filename": file.filename,
        "camera_id": resolved_camera_id,
        "message": "Processing started. Watch the Dashboard for live detections.",
    }
