import uuid
import datetime
from sqlalchemy import Column, String, DateTime, Enum
from sqlalchemy import UUID, JSON
from sqlalchemy.orm import relationship
from backend.database import Base
import enum

class ZoneType(str, enum.Enum):
    entrance = "entrance"
    shelf = "shelf"
    checkout = "checkout"
    exit = "exit"

class Zone(Base):
    __tablename__ = "zones"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, index=True)
    description = Column(String, nullable=True)
    coordinates = Column(JSON) # polygon points for ROI
    zone_type = Column(Enum(ZoneType))
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Relationships
    cameras = relationship("Camera", back_populates="zone")
    events = relationship("TrackingEvent", back_populates="zone")
    alerts = relationship("Alert", back_populates="zone")
    summaries = relationship("DailySummary", back_populates="zone")
