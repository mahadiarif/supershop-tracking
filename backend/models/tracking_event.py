import uuid
import datetime
from sqlalchemy import Column, String, DateTime, ForeignKey, Enum, Float, Integer
from sqlalchemy import UUID, JSON
from sqlalchemy.orm import relationship
from backend.database import Base
import enum

class EventType(str, enum.Enum):
    person_enter = "person_enter"
    person_exit = "person_exit"
    product_pick = "product_pick"
    cart_detected = "cart_detected"
    zone_dwell = "zone_dwell"

class TrackingEvent(Base):
    __tablename__ = "tracking_events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    camera_id = Column(UUID(as_uuid=True), ForeignKey("cameras.id"))
    zone_id = Column(UUID(as_uuid=True), ForeignKey("zones.id"), nullable=True)
    track_id = Column(Integer, index=True) # ByteTrack ID
    event_type = Column(Enum(EventType))
    object_class = Column(String) # person, cart, basket, etc.
    confidence = Column(Float)
    bbox = Column(JSON) # {x1, y1, x2, y2}
    snapshot_path = Column(String, nullable=True)
    event_metadata = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, index=True)

    # Relationships
    camera = relationship("Camera", back_populates="events")
    zone = relationship("Zone", back_populates="events")
