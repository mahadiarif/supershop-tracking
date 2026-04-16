from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any
from uuid import UUID

from pydantic import BaseModel

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.models.alert import Alert
from backend.models.camera import Camera, CameraStatus
from backend.models.tracking_event import EventType, TrackingEvent
from backend.models.zone import Zone
from backend.websocket.manager import manager

router = APIRouter()


class LiveDetectionsPayload(BaseModel):
    camera_id: UUID
    detections: list[dict[str, Any]]
    frame_width: int | None = None
    frame_height: int | None = None
    timestamp: datetime | None = None


@router.get("/dashboard/live-detections")
async def get_dashboard_live_detections(
    camera_id: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    fresh_cutoff = datetime.utcnow() - timedelta(seconds=20)
    query = (
        select(TrackingEvent)
        .join(Camera, TrackingEvent.camera_id == Camera.id)
        .where(TrackingEvent.created_at >= fresh_cutoff, Camera.web_enabled == True)  # noqa: E712
        .order_by(TrackingEvent.created_at.desc())
    )
    if camera_id:
        try:
            camera_uuid = UUID(camera_id)
            query = query.where(TrackingEvent.camera_id == camera_uuid)
        except ValueError:
            query = query.join(Camera, TrackingEvent.camera_id == Camera.id).where(
                ((Camera.mediamtx_path == camera_id) | (Camera.name == camera_id)) & (Camera.web_enabled == True)  # noqa: E712
            )

    result = await db.execute(query)
    events = result.scalars().all()

    latest_by_camera: dict[str, dict[str, Any]] = {}
    for event in events:
        camera_key = str(event.camera_id)
        if camera_key in latest_by_camera:
            continue
        payload = event.event_metadata or {}
        detections = payload.get("detections") or []
        detections = [
            item for item in detections
            if str((item or {}).get("class_name") or (item or {}).get("object_class") or "").lower()
            in {"person", "cart", "basket", "backpack", "handbag", "suitcase"}
        ]
        latest_by_camera[camera_key] = {
            "camera_id": camera_key,
            "camera_key": payload.get("camera_id") or camera_key,
            "detections": detections,
            "frame_width": detections[0].get("frame_width") if detections and isinstance(detections[0], dict) else None,
            "frame_height": detections[0].get("frame_height") if detections and isinstance(detections[0], dict) else None,
            "total_persons": payload.get("total_persons", 0),
            "total_objects": payload.get("total_objects", len(detections)),
            "worker_status": payload.get("worker_status", "active"),
            "timestamp": event.created_at.isoformat() if event.created_at else datetime.utcnow().isoformat(),
            "snapshot_path": event.snapshot_path,
            "event_type": event.event_type.value if getattr(event.event_type, "value", None) else str(event.event_type),
        }

    return {"items": list(latest_by_camera.values())}


@router.get("/dashboard/stats")
async def get_dashboard_stats(db: AsyncSession = Depends(get_db)):
    today = datetime.utcnow().date()
    start = datetime.combine(today, datetime.min.time())
    end = datetime.combine(today, datetime.max.time())

    active_cameras = await db.scalar(
        select(func.count(Camera.id)).where(Camera.status == CameraStatus.online, Camera.web_enabled == True)  # noqa: E712
    )
    alerts_today = await db.scalar(select(func.count(Alert.id)).where(Alert.created_at >= start, Alert.created_at <= end))
    enters = await db.scalar(select(func.count(TrackingEvent.id)).where(TrackingEvent.event_type == EventType.person_enter))
    exits = await db.scalar(select(func.count(TrackingEvent.id)).where(TrackingEvent.event_type == EventType.person_exit))
    unique_persons_today = await db.scalar(
        select(func.count(func.distinct(TrackingEvent.track_id))).where(
            TrackingEvent.created_at >= start,
            TrackingEvent.created_at <= end,
            TrackingEvent.object_class == "person",
            TrackingEvent.track_id.is_not(None),
        )
    )

    zone_rows = await db.execute(
        select(Zone.name, func.count(TrackingEvent.id).label("count"))
        .join(TrackingEvent, TrackingEvent.zone_id == Zone.id)
        .where(TrackingEvent.created_at >= start, TrackingEvent.created_at <= end)
        .group_by(Zone.name)
        .order_by(func.count(TrackingEvent.id).desc())
        .limit(1)
    )
    busiest_zone_row = zone_rows.first()

    return {
        "total_customers_today": enters or 0,
        "unique_persons_today": unique_persons_today or 0,
        "currently_inside": max(0, (enters or 0) - (exits or 0)),
        "total_alerts": alerts_today or 0,
        "active_cameras": active_cameras or 0,
        "busiest_zone": busiest_zone_row[0] if busiest_zone_row else "N/A",
    }


@router.get("/dashboard/live")
async def get_dashboard_live(db: AsyncSession = Depends(get_db)):
    five_mins_ago = datetime.utcnow() - timedelta(minutes=5)
    query = select(TrackingEvent).join(Camera, TrackingEvent.camera_id == Camera.id).where(
        TrackingEvent.created_at >= five_mins_ago,
        Camera.web_enabled == True,  # noqa: E712
    )
    result = await db.execute(query)
    recent_events = result.scalars().all()

    zone_counts = await db.execute(
        select(Zone.name, func.count(TrackingEvent.id))
        .join(TrackingEvent, TrackingEvent.zone_id == Zone.id)
        .join(Camera, TrackingEvent.camera_id == Camera.id)
        .where(TrackingEvent.created_at >= five_mins_ago, Camera.web_enabled == True)  # noqa: E712
        .group_by(Zone.name)
    )

    return {
        "recent_events": len(recent_events),
        "active_track_ids": list({event.track_id for event in recent_events if event.track_id is not None}),
        "zone_counts": {row[0]: row[1] for row in zone_counts.all()},
    }


@router.post("/dashboard/live-detections")
async def ingest_live_detections(payload: LiveDetectionsPayload):
    message = {
        "type": "live_detections",
        "data": {
            "camera_id": str(payload.camera_id),
            "detections": payload.detections,
            "frame_width": payload.frame_width,
            "frame_height": payload.frame_height,
            "timestamp": (payload.timestamp or datetime.utcnow()).isoformat(),
        },
    }
    await manager.broadcast("dashboard", message)
    await manager.broadcast(f"camera_{payload.camera_id}", message)
    return {"ok": True, "count": len(payload.detections)}
