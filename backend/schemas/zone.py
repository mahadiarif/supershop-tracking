from pydantic import BaseModel
from uuid import UUID
from datetime import datetime
from typing import Optional, List, Any
from backend.models.zone import ZoneType

class ZoneBase(BaseModel):
    name: str
    description: Optional[str] = None
    coordinates: Any # List of coordinates
    zone_type: ZoneType

class ZoneCreate(ZoneBase):
    pass

class ZoneUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    coordinates: Optional[Any] = None
    zone_type: Optional[ZoneType] = None

class ZoneOut(ZoneBase):
    id: UUID
    created_at: datetime

    class Config:
        from_attributes = True
