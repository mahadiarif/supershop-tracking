from __future__ import annotations

import asyncio
import base64
import os
import tempfile
from concurrent.futures import ThreadPoolExecutor

import cv2
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
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
STREAM_FPS = float(os.getenv("UPLOAD_STREAM_FPS", "8"))
UPLOAD_DIR = os.getenv("UPLOAD_DIR", "/app/uploads")

DEMO_CAMERA_NAME = "Demo Camera"
DEMO_CAMERA_PATH = "demo_feed"
DEMO_VIDEO_FILE = os.path.join(UPLOAD_DIR, "demo_video")  # no ext, find by glob

# camera_id → asyncio.Task
_active_streams: dict[str, asyncio.Task] = {}


def _find_saved_demo() -> str | None:
    """Return path of saved demo video if exists."""
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    for ext in ALLOWED_EXTENSIONS:
        p = DEMO_VIDEO_FILE + ext
        if os.path.exists(p):
            return p
    return None


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


async def _stream_loop(video_path: str, camera_id: str, persistent: bool = False):
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        print(f"[upload] Cannot open video: {video_path}")
        return

    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    frame_delay = 1.0 / STREAM_FPS
    frame_idx = 0
    loop = asyncio.get_running_loop()

    print(f"[upload] Stream started — camera={camera_id} size={width}x{height} fps={STREAM_FPS} skip={UPLOAD_FRAME_SKIP}")

    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                frame_idx = 0
                continue

            if frame_idx % UPLOAD_FRAME_SKIP == 0:
                try:
                    frame_b64 = await loop.run_in_executor(_executor, _extract_frame_b64, frame)
                    result = await loop.run_in_executor(
                        _executor, run_inference, camera_id, frame_b64, width, height
                    )
                    async with AsyncSessionLocal() as db:
                        payload = DetectionPayload(**result)
                        await process_detection(payload, db)
                except asyncio.CancelledError:
                    raise
                except Exception as exc:
                    print(f"[upload] Frame error (frame={frame_idx}): {type(exc).__name__}: {exc}")

                await asyncio.sleep(frame_delay)

            frame_idx += 1
    except asyncio.CancelledError:
        print(f"[upload] Stream stopped — camera={camera_id}")
    except Exception as exc:
        print(f"[upload] Stream crashed — camera={camera_id}: {type(exc).__name__}: {exc}")
    finally:
        cap.release()
        _active_streams.pop(camera_id, None)
        if not persistent:
            try:
                os.unlink(video_path)
            except OSError:
                pass


async def auto_resume_demo():
    """Called on startup — resume demo video stream if saved file exists."""
    saved = _find_saved_demo()
    if not saved:
        return
    async with AsyncSessionLocal() as db:
        camera = await _get_or_create_demo_camera(db)
        camera_id = str(camera.id)
    task = asyncio.create_task(_stream_loop(saved, camera_id, persistent=True))
    _active_streams[camera_id] = task
    print(f"[upload] Auto-resumed demo video: {saved}")


@router.post("/upload-video")
async def upload_video(
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

    if camera_id == "demo":
        camera = await _get_or_create_demo_camera(db)
        resolved_camera_id = str(camera.id)
    else:
        resolved_camera_id = camera_id

    # Stop existing stream for this camera
    existing = _active_streams.get(resolved_camera_id)
    if existing and not existing.done():
        existing.cancel()
        await asyncio.sleep(0.1)

    # Save persistently for demo camera, temp for others
    is_demo = camera_id == "demo"
    if is_demo:
        os.makedirs(UPLOAD_DIR, exist_ok=True)
        # Remove old demo video if different extension
        for old_ext in ALLOWED_EXTENSIONS:
            old = DEMO_VIDEO_FILE + old_ext
            if os.path.exists(old):
                os.unlink(old)
        save_path = DEMO_VIDEO_FILE + ext
        with open(save_path, "wb") as f:
            f.write(contents)
    else:
        tmp = tempfile.NamedTemporaryFile(suffix=ext, delete=False)
        tmp.write(contents)
        tmp.close()
        save_path = tmp.name

    task = asyncio.create_task(_stream_loop(save_path, resolved_camera_id, persistent=is_demo))
    _active_streams[resolved_camera_id] = task

    return {
        "ok": True,
        "filename": file.filename,
        "camera_id": resolved_camera_id,
        "message": "Stream started.",
    }


@router.post("/upload-video/stop")
async def stop_stream(camera_id: str = Form(...)):
    task = _active_streams.get(camera_id)
    if not task or task.done():
        raise HTTPException(status_code=404, detail="No active stream for this camera.")
    task.cancel()
    return {"ok": True, "message": "Stream stopped."}


@router.get("/upload-video/status")
async def stream_status():
    return {
        "active_streams": [
            {"camera_id": cid, "running": not t.done()}
            for cid, t in _active_streams.items()
        ]
    }
