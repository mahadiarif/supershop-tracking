"""
VPS-side RTSP frame puller.
Pulls frames directly from MediaMTX RTSP output for a camera,
runs YOLO inference, and broadcasts to dashboard — no external python worker needed.
"""
from __future__ import annotations

import asyncio
import base64
import os
from concurrent.futures import ThreadPoolExecutor

import cv2
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import AsyncSessionLocal, get_db
from backend.models.camera import Camera
from backend.routers.events import DetectionPayload, process_detection
from backend.vps_inference.inference_service import run_inference

router = APIRouter()

_executor = ThreadPoolExecutor(max_workers=2)

FRAME_SKIP = int(os.getenv("TRACKER_FRAME_SKIP", "5"))
STREAM_FPS = float(os.getenv("TRACKER_STREAM_FPS", "8"))
MEDIAMTX_RTSP = os.getenv("MEDIAMTX_RTSP_URL", "rtsp://mediamtx:8554")

# camera_id → asyncio.Task
_running: dict[str, asyncio.Task] = {}


def _pull_and_infer(rtsp_url: str, camera_id: str, width: int, height: int) -> dict | None:
    cap = cv2.VideoCapture(rtsp_url)
    if not cap.isOpened():
        return None
    ret, frame = cap.read()
    cap.release()
    if not ret or frame is None:
        return None
    _, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
    frame_b64 = base64.b64encode(buf.tobytes()).decode()
    return run_inference(camera_id, frame_b64, width, height)


async def _track_loop(camera_id: str, mediamtx_path: str):
    rtsp_url = f"{MEDIAMTX_RTSP}/{mediamtx_path}"
    frame_delay = 1.0 / STREAM_FPS
    loop = asyncio.get_running_loop()
    frame_idx = 0

    # Probe resolution once
    cap = cv2.VideoCapture(rtsp_url)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)) or 640
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)) or 480
    cap.release()

    print(f"[tracker] Started — camera={camera_id} path={mediamtx_path} {width}x{height}")

    try:
        while True:
            if frame_idx % FRAME_SKIP == 0:
                try:
                    result = await loop.run_in_executor(
                        _executor, _pull_and_infer, rtsp_url, camera_id, width, height
                    )
                    if result:
                        async with AsyncSessionLocal() as db:
                            payload = DetectionPayload(**result)
                            await process_detection(payload, db)
                except asyncio.CancelledError:
                    raise
                except Exception as exc:
                    print(f"[tracker] Frame error: {type(exc).__name__}: {exc}")

                await asyncio.sleep(frame_delay)
            frame_idx += 1
    except asyncio.CancelledError:
        print(f"[tracker] Stopped — camera={camera_id}")
    finally:
        _running.pop(camera_id, None)


async def auto_start_all(db: AsyncSession):
    """Called on startup — auto-start tracking for all cameras with RTSP URL."""
    result = await db.execute(select(Camera))
    all_cameras = result.scalars().all()
    started = 0
    for cam in all_cameras:
        if cam.rtsp_url and cam.mediamtx_path and cam.mediamtx_path != "demo_feed":
            task = asyncio.create_task(_track_loop(str(cam.id), cam.mediamtx_path))
            _running[str(cam.id)] = task
            started += 1
    print(f"[tracker] Auto-started {started} camera tracker(s)")


@router.post("/cameras/{camera_id}/track/start")
async def start_tracking(camera_id: str, db: AsyncSession = Depends(get_db)):
    from uuid import UUID
    result = await db.execute(select(Camera).where(Camera.id == UUID(camera_id)))
    camera = result.scalar_one_or_none()
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")
    if not camera.mediamtx_path:
        raise HTTPException(status_code=400, detail="Camera has no MediaMTX path")

    existing = _running.get(camera_id)
    if existing and not existing.done():
        return {"ok": True, "message": "Already tracking", "camera_id": camera_id}

    task = asyncio.create_task(_track_loop(camera_id, camera.mediamtx_path))
    _running[camera_id] = task
    return {"ok": True, "message": "Tracking started", "camera_id": camera_id}


@router.post("/cameras/{camera_id}/track/stop")
async def stop_tracking(camera_id: str):
    task = _running.get(camera_id)
    if not task or task.done():
        raise HTTPException(status_code=404, detail="No active tracker for this camera")
    task.cancel()
    return {"ok": True, "message": "Tracking stopped", "camera_id": camera_id}


@router.get("/tracker/status")
async def tracking_status():
    return {
        "trackers": [
            {"camera_id": cid, "running": not t.done()}
            for cid, t in _running.items()
        ]
    }
