from __future__ import annotations

from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from backend.models.alert import Alert, AlertSeverity, AlertType
from backend.models.tracking_event import EventType
from backend.schemas.alert import AlertCreate
from backend.websocket.manager import manager


class AlertService:
    """Alert create/store করার জন্য helper."""

    @staticmethod
    async def process_alert(db: AsyncSession, alert_data: AlertCreate):
        new_alert = Alert(**alert_data.model_dump())
        db.add(new_alert)
        await db.commit()
        await db.refresh(new_alert)

        await manager.broadcast(
            "dashboard",
            {
                "type": "new_alert",
                "data": {
                    "id": str(new_alert.id),
                    "alert_type": new_alert.alert_type.value if hasattr(new_alert.alert_type, "value") else str(new_alert.alert_type),
                    "severity": new_alert.severity.value if hasattr(new_alert.severity, "value") else str(new_alert.severity),
                    "camera_id": str(new_alert.camera_id),
                    "created_at": new_alert.created_at.isoformat(),
                    "is_reviewed": new_alert.is_reviewed,
                },
            },
        )
        return new_alert

    @staticmethod
    async def check_and_create_alert(db: AsyncSession, event) -> Alert | None:
        """Event heuristic দেখে possible alert তৈরি করে."""
        event_type_value = event.event_type.value if hasattr(event.event_type, "value") else str(event.event_type)
        if event_type_value not in {EventType.product_pick.value, EventType.zone_dwell.value}:
            return None

        alert = Alert(
            camera_id=event.camera_id,
            zone_id=event.zone_id,
            track_id=event.track_id,
            alert_type=AlertType.suspicious_behavior,
            severity=AlertSeverity.medium,
            snapshot_before=event.snapshot_path,
            snapshot_during=event.snapshot_path,
            snapshot_after=event.snapshot_path,
        )
        db.add(alert)
        await db.commit()
        await db.refresh(alert)
        await manager.broadcast(
            "dashboard",
            {
                "type": "new_alert",
                "data": {
                    "id": str(alert.id),
                    "alert_type": alert.alert_type.value,
                    "severity": alert.severity.value,
                    "camera_id": str(alert.camera_id),
                    "created_at": alert.created_at.isoformat(),
                    "is_reviewed": alert.is_reviewed,
                },
            },
        )
        return alert


alert_service = AlertService()
