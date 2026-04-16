import uuid
import datetime
from sqlalchemy import Column, String, DateTime, ForeignKey, Enum, Boolean
from sqlalchemy import UUID
from sqlalchemy.orm import relationship
from backend.database import Base
import enum

class CameraStatus(str, enum.Enum):
    online = "online"
    offline = "offline"
    error = "error"

class Camera(Base):
    __tablename__ = "cameras"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, index=True)
    zone_id = Column(UUID(as_uuid=True), ForeignKey("zones.id"), nullable=True)
    rtsp_url = Column(String)
    mediamtx_path = Column(String)
    status = Column(Enum(CameraStatus), default=CameraStatus.offline)
    web_enabled = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    # Relationships
    zone = relationship("Zone", back_populates="cameras")
    events = relationship("TrackingEvent", back_populates="camera")
    alerts = relationship("Alert", back_populates="camera")
