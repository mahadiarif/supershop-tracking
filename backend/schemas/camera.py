from pydantic import BaseModel
from uuid import UUID
from datetime import datetime
from typing import Optional
from backend.models.camera import CameraStatus

class CameraBase(BaseModel):
    name: str
    zone_id: Optional[UUID] = None
    rtsp_url: str
    mediamtx_path: str
    web_enabled: bool = True

class CameraCreate(CameraBase):
    pass

class CameraUpdate(BaseModel):
    name: Optional[str] = None
    zone_id: Optional[UUID] = None
    rtsp_url: Optional[str] = None
    mediamtx_path: Optional[str] = None
    status: Optional[CameraStatus] = None
    web_enabled: Optional[bool] = None

class CameraOut(CameraBase):
    id: UUID
    status: CameraStatus
    web_enabled: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
