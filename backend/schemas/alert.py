from pydantic import BaseModel
from uuid import UUID
from datetime import datetime
from typing import Optional
from backend.models.alert import AlertType, AlertSeverity

class AlertBase(BaseModel):
    camera_id: UUID
    zone_id: Optional[UUID] = None
    track_id: Optional[int] = None
    alert_type: AlertType
    severity: AlertSeverity
    snapshot_before: Optional[str] = None
    snapshot_during: Optional[str] = None
    snapshot_after: Optional[str] = None

class AlertCreate(AlertBase):
    pass

class AlertReview(BaseModel):
    reviewed_by: str

class AlertOut(AlertBase):
    id: UUID
    is_reviewed: bool
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True
