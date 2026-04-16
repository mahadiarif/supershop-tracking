from pydantic import BaseModel
from uuid import UUID
from datetime import datetime
from typing import Optional, Any
from backend.models.tracking_event import EventType

class EventBase(BaseModel):
    camera_id: UUID
    zone_id: Optional[UUID] = None
    track_id: int
    event_type: EventType
    object_class: str
    confidence: float
    bbox: Any
    snapshot_path: Optional[str] = None
    event_metadata: Optional[Any] = None

class EventCreate(EventBase):
    pass

class EventOut(EventBase):
    id: UUID
    created_at: datetime

    class Config:
        from_attributes = True
