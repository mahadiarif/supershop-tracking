from __future__ import annotations

import asyncio
import base64
import os
import tempfile
from concurrent.futures import ThreadPoolExecutor

import cv2
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.routers.events import DetectionPayload, process_detection
from backend.vps_inference.inference_service import run_inference

router = APIRouter()

_executor = ThreadPoolExecutor(max_workers=1)

ALLOWED_EXTENSIONS = {".mp4", ".avi", ".mov", ".mkv", ".webm"}
MAX_FILE_SIZE = 500 * 1024 * 1024  # 500 MB
PROCESS_EVERY_NTH_FRAME = int(os.getenv("UPLOAD_FRAME_SKIP", "10"))


def _process_video_sync(video_path: str, camera_id: str) -> dict:
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise ValueError("Cannot open video file")

    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 25
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    results = []
    frame_idx = 0

    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                break

            if frame_idx % PROCESS_EVERY_NTH_FRAME == 0:
                _, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
                frame_b64 = base64.b64encode(buf.tobytes()).decode()
                result = run_inference(camera_id, frame_b64, width, height)
                results.append(result)

            frame_idx += 1
    finally:
        cap.release()

    total_detections = sum(len(r.get("detections", [])) for r in results)
    total_persons = sum(r.get("total_persons", 0) for r in results)

    return {
        "frames_total": total_frames,
        "frames_processed": len(results),
        "fps": fps,
        "resolution": f"{width}x{height}",
        "total_detections": total_detections,
        "total_persons": total_persons,
        "frame_results": results,
    }


@router.post("/upload-video")
async def upload_video(
    camera_id: str = Form(...),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Unsupported format. Use: {', '.join(ALLOWED_EXTENSIONS)}")

    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File too large. Max 500 MB.")

    with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
        tmp.write(contents)
        tmp_path = tmp.name

    try:
        loop = asyncio.get_event_loop()
        video_result = await loop.run_in_executor(
            _executor, _process_video_sync, tmp_path, camera_id
        )

        saved = 0
        for frame_result in video_result["frame_results"]:
            if frame_result.get("detections"):
                try:
                    payload = DetectionPayload(**frame_result)
                    await process_detection(payload, db)
                    saved += 1
                except Exception as exc:
                    print(f"Failed to save frame detections: {exc}")

        return {
            "ok": True,
            "filename": file.filename,
            "camera_id": camera_id,
            "frames_total": video_result["frames_total"],
            "frames_processed": video_result["frames_processed"],
            "frames_saved": saved,
            "fps": video_result["fps"],
            "resolution": video_result["resolution"],
            "total_detections": video_result["total_detections"],
            "total_persons": video_result["total_persons"],
        }
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
