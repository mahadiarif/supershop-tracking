# backend/routers/events.py
from __future__ import annotations

import base64
import binascii
import datetime as dt
import time
from pathlib import Path
from typing import Any, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import settings
from backend.database import get_db
from backend.models.alert import Alert
from backend.models.camera import Camera
from backend.models.tracking_event import EventType, TrackingEvent
from backend.models.zone import Zone
from backend.schemas.event import EventCreate, EventOut
from backend.services.alert_service import alert_service
from backend.websocket.manager import manager

try:
    import redis.asyncio as redis
except Exception:  # pragma: no cover - redis is optional at runtime
    redis = None

import asyncio
from concurrent.futures import ThreadPoolExecutor
from backend.vps_inference.inference_service import run_inference

_executor = ThreadPoolExecutor(max_workers=2)

router = APIRouter()

WORKER_HEARTBEAT_KEY = "worker:last_heartbeat"
WORKER_STATUS_KEY = "worker:last_status"
WORKER_HEARTBEAT_TTL = 60
WORKER_IDLE_TIMEOUT = 15

_worker_last_heartbeat: float | None = None
_worker_last_status: str = "idle"
_redis_client = None
_redis_disabled = False


def _memory_cache_only() -> bool:
    redis_url = (settings.REDIS_URL or "").strip().lower()
    return redis_url in {"", "memory://local", "memory://"}


class DetectionBox(BaseModel):
    track_id: int | None = None
    class_name: str = "object"
    confidence: float = 0.0
    bbox: dict[str, float] | list[float] | None = None
    frame_width: int | None = None
    frame_height: int | None = None
    snapshot: str | None = None
    carried_by_track_id: int | None = None
    is_carried: bool = False
    is_carrying: bool = False
    carrying_objects: list[str] = Field(default_factory=list)
    carry_summary: str | None = None


class DetectionPayload(BaseModel):
    camera_id: str
    frame: str | None = None
    detections: list[DetectionBox] = Field(default_factory=list)
    total_persons: int = 0
    total_objects: int = 0
    worker_status: str = "active"


class WorkerHeartbeatPayload(BaseModel):
    status: str = "active"
    camera_id: str | None = None


class FramePayload(BaseModel):
    camera_id: str
    frame: str  # base64 JPEG
    frame_width: int = 640
    frame_height: int = 480


def _parse_date_range(start_date: Optional[str], end_date: Optional[str]) -> tuple[dt.datetime | None, dt.datetime | None]:
    start = dt.datetime.fromisoformat(start_date) if start_date else None
    end = dt.datetime.fromisoformat(end_date) if end_date else None
    return start, end


def _normalize_bbox(value: dict[str, float] | list[float] | None) -> dict[str, float] | None:
    if value is None:
        return None
    if isinstance(value, list) and len(value) >= 4:
        try:
            x1, y1, x2, y2 = map(float, value[:4])
            return {"x1": x1, "y1": y1, "x2": x2, "y2": y2}
        except Exception:
            return None
    if isinstance(value, dict):
        try:
            return {
                "x1": float(value.get("x1", 0)),
                "y1": float(value.get("y1", 0)),
                "x2": float(value.get("x2", 0)),
                "y2": float(value.get("y2", 0)),
            }
        except Exception:
            return None
    return None


async def _get_redis_client():
    global _redis_client, _redis_disabled
    if redis is None or _redis_disabled or _memory_cache_only():
        return None
    if _redis_client is None:
        try:
            _redis_client = redis.from_url(settings.REDIS_URL, decode_responses=True)
            await _redis_client.ping()
        except Exception as exc:
            print(f"Redis heartbeat cache unavailable, using memory fallback: {exc}")
            _redis_disabled = True
            _redis_client = None
    return _redis_client


async def _store_worker_status(status: str):
    global _worker_last_heartbeat, _worker_last_status, _redis_disabled
    now_ts = time.time()
    _worker_last_heartbeat = now_ts
    _worker_last_status = status

    client = await _get_redis_client()
    if client is None:
        return

    try:
        await client.set(WORKER_HEARTBEAT_KEY, str(now_ts), ex=WORKER_HEARTBEAT_TTL)
        await client.set(WORKER_STATUS_KEY, status, ex=WORKER_HEARTBEAT_TTL)
    except Exception as exc:
        print(f"Failed to persist worker heartbeat: {exc}")
        _redis_disabled = True


async def _load_worker_status() -> tuple[str, dt.datetime | None]:
    client = await _get_redis_client()
    heartbeat_ts: float | None = None
    status = "idle"

    if client is not None:
        try:
            raw_heartbeat = await client.get(WORKER_HEARTBEAT_KEY)
            raw_status = await client.get(WORKER_STATUS_KEY)
            if raw_heartbeat:
                heartbeat_ts = float(raw_heartbeat)
            if raw_status:
                status = raw_status
        except Exception as exc:
            print(f"Failed to read worker heartbeat cache: {exc}")

    if heartbeat_ts is None and _worker_last_heartbeat is not None:
        heartbeat_ts = _worker_last_heartbeat
        status = _worker_last_status

    heartbeat_dt = dt.datetime.fromtimestamp(heartbeat_ts) if heartbeat_ts else None
    return status, heartbeat_dt


async def _resolve_camera(db: AsyncSession, camera_identifier: str) -> Camera:
    try:
        camera_uuid = UUID(camera_identifier)
        query = select(Camera).where(Camera.id == camera_uuid)
    except ValueError:
        normalized_identifier = camera_identifier.replace("_", "")
        humanized_identifier = camera_identifier.replace("_", " ")
        query = select(Camera).where(
            or_(
                Camera.mediamtx_path == camera_identifier,
                Camera.mediamtx_path == normalized_identifier,
                Camera.name == camera_identifier,
                Camera.name == humanized_identifier,
            )
        )

    result = await db.execute(query)
    camera = result.scalar_one_or_none()
    if camera is None:
        raise HTTPException(status_code=404, detail="Camera not found.")
    return camera


def _save_annotated_frame(frame_b64: str | None, camera_key: str) -> str | None:
    if not frame_b64:
        return None

    payload = frame_b64.split(",", 1)[1] if frame_b64.startswith("data:image") and "," in frame_b64 else frame_b64
    try:
        frame_bytes = base64.b64decode(payload)
    except (binascii.Error, ValueError):
        return None

    snapshots_dir = Path(settings.SNAPSHOT_DIR)
    snapshots_dir.mkdir(parents=True, exist_ok=True)
    filename = f"detection_{camera_key}_{int(time.time())}.jpg"
    path = snapshots_dir / filename
    try:
        path.write_bytes(frame_bytes)
        return str(path).replace("\\", "/")
    except Exception as exc:
        print(f"Failed to save detection frame: {exc}")
        return None


@router.post("/events", response_model=EventOut)
async def create_event(event: EventCreate, db: AsyncSession = Depends(get_db)):
    # Python worker থেকে আসা event database-এ save করা হচ্ছে
    new_event = TrackingEvent(**event.model_dump())
    db.add(new_event)
    await db.commit()
    await db.refresh(new_event)

    await manager.broadcast(
        "dashboard",
        {
            "type": "new_event",
            "data": {
                "id": str(new_event.id),
                "event_type": new_event.event_type.value if hasattr(new_event.event_type, "value") else str(new_event.event_type),
                "track_id": new_event.track_id,
                "camera_id": str(new_event.camera_id),
            },
        },
    )

    try:
        await alert_service.check_and_create_alert(db, new_event)
    except Exception as exc:
        print(f"Alert check failed: {type(exc).__name__} - {exc}")

    return new_event


async def process_detection(payload: DetectionPayload, db: AsyncSession):
    camera = await _resolve_camera(db, payload.camera_id)
    if camera.web_enabled is False:
        await _store_worker_status(payload.worker_status or "idle")
        return {"ok": True, "saved": False, "count": 0, "ignored": True, "reason": "camera_disabled"}

    detection_items = payload.detections or []
    saved_snapshot = _save_annotated_frame(payload.frame, str(camera.id))

    batch_track_id = (
        detection_items[0].track_id if detection_items and detection_items[0].track_id is not None else 0
    )
    batch_class_name = detection_items[0].class_name if detection_items else "detection_batch"
    batch_confidence = detection_items[0].confidence if detection_items else 0.0
    first_bbox = (
        _normalize_bbox(detection_items[0].bbox) if detection_items and detection_items[0].bbox is not None else None
    )

    if detection_items:
        detection_event = TrackingEvent(
            camera_id=camera.id,
            zone_id=camera.zone_id,
            track_id=batch_track_id or 0,
            event_type=EventType.zone_dwell,
            object_class=batch_class_name,
            confidence=batch_confidence,
            bbox=first_bbox,
            snapshot_path=saved_snapshot,
            event_metadata={
                "source": "worker",
                "camera_id": payload.camera_id,
                "total_persons": payload.total_persons,
                "total_objects": payload.total_objects,
                "worker_status": payload.worker_status,
                "detections": [
                    {
                        "track_id": item.track_id,
                        "class_name": item.class_name,
                        "confidence": item.confidence,
                        "bbox": _normalize_bbox(item.bbox),
                        "frame_width": item.frame_width,
                        "frame_height": item.frame_height,
                        "snapshot": item.snapshot,
                        "carried_by_track_id": item.carried_by_track_id,
                        "is_carried": item.is_carried,
                        "is_carrying": item.is_carrying,
                        "carrying_objects": item.carrying_objects,
                        "carry_summary": item.carry_summary,
                    }
                    for item in detection_items
                ],
            },
        )
        db.add(detection_event)
        await db.commit()

        dashboard_data = {
            "camera_id": str(camera.id),
            "camera_key": payload.camera_id,
            "frame": payload.frame,
            "frame_width": detection_items[0].frame_width if detection_items and detection_items[0].frame_width is not None else None,
            "frame_height": detection_items[0].frame_height if detection_items and detection_items[0].frame_height is not None else None,
            "detections": [
                {
                    "track_id": item.track_id,
                    "class_name": item.class_name,
                    "confidence": item.confidence,
                    "bbox": _normalize_bbox(item.bbox),
                    "frame_width": item.frame_width,
                    "frame_height": item.frame_height,
                    "snapshot": item.snapshot,
                    "carried_by_track_id": item.carried_by_track_id,
                    "is_carried": item.is_carried,
                    "is_carrying": item.is_carrying,
                    "carrying_objects": item.carrying_objects,
                    "carry_summary": item.carry_summary,
                }
                for item in detection_items
            ],
            "total_persons": payload.total_persons,
            "total_objects": payload.total_objects,
            "worker_status": payload.worker_status,
            "snapshot_path": saved_snapshot,
        }

        await manager.broadcast("dashboard", {"type": "detection", "data": dashboard_data})
        await manager.broadcast(f"camera_{camera.id}", {"type": "detection", "data": dashboard_data})

    await _store_worker_status(payload.worker_status or "active")
    return {"ok": True, "saved": bool(detection_items), "count": len(detection_items)}


@router.post("/detection")
async def receive_detection(payload: DetectionPayload, db: AsyncSession = Depends(get_db)):
    return await process_detection(payload, db)


@router.post("/worker/frame")
async def receive_frame(payload: FramePayload, db: AsyncSession = Depends(get_db)):
    """
    Receive raw frame from laptop frame_sender.py
    Run YOLO inference on VPS
    Forward result to process_detection logic
    """
    try:
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            _executor,
            run_inference,
            payload.camera_id,
            payload.frame,
            payload.frame_width,
            payload.frame_height,
        )

        detection_payload = DetectionPayload(**result)
        db_result = await process_detection(detection_payload, db)

        return {"success": True, "detections": len(result.get("detections", [])), "db": db_result}
    except Exception as e:
        print(f"Error in receive_frame: {e}")
        return {"success": False, "error": str(e)}


@router.post("/worker/heartbeat")
async def worker_heartbeat(payload: WorkerHeartbeatPayload):
    status = (payload.status or "active").strip().lower()
    if status not in {"active", "idle", "error"}:
        status = "active"

    await _store_worker_status(status)
    await manager.broadcast(
        "dashboard",
        {
            "type": "worker_status",
            "status": status,
            "last_heartbeat": dt.datetime.utcnow().isoformat(),
        },
    )
    return {"ok": True, "status": status}


@router.get("/worker/status")
async def worker_status():
    status, heartbeat_dt = await _load_worker_status()
    if heartbeat_dt is None:
        return {"status": "idle", "last_heartbeat": None}

    age = (dt.datetime.utcnow() - heartbeat_dt).total_seconds()
    if status == "error" and age <= WORKER_IDLE_TIMEOUT:
        resolved = "error"
    elif age <= WORKER_IDLE_TIMEOUT:
        resolved = "active"
    else:
        resolved = "idle"

    return {
        "status": resolved,
        "last_heartbeat": heartbeat_dt.isoformat(),
    }


@router.get("/events", response_model=dict)
async def get_events(
    skip: int = 0,
    limit: int = 50,
    camera_id: Optional[str] = None,
    zone_id: Optional[str] = None,
    event_type: Optional[str] = None,
    start_date: Optional[str] = Query(default=None),
    end_date: Optional[str] = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    query = select(TrackingEvent)
    count_query = select(func.count(TrackingEvent.id))

    filters = []
    if camera_id:
        filters.append(TrackingEvent.camera_id == UUID(camera_id))
    if zone_id:
        filters.append(TrackingEvent.zone_id == UUID(zone_id))
    if event_type:
        try:
            filters.append(TrackingEvent.event_type == EventType(event_type))
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid event_type.")

    start_dt, end_dt = _parse_date_range(start_date, end_date)
    if start_dt:
        filters.append(TrackingEvent.created_at >= start_dt)
    if end_dt:
        filters.append(TrackingEvent.created_at <= end_dt)

    if filters:
        query = query.where(*filters)
        count_query = count_query.where(*filters)

    query = query.order_by(TrackingEvent.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    events = result.scalars().all()
    total = await db.scalar(count_query)

    return {"total": total or 0, "events": events}
