import uuid
import datetime
from sqlalchemy import Column, String, DateTime, ForeignKey, Enum, Integer, Boolean
from sqlalchemy import UUID
from sqlalchemy.orm import relationship
from backend.database import Base
import enum

class AlertType(str, enum.Enum):
    concealment = "concealment"
    unbilled_exit = "unbilled_exit"
    loitering = "loitering"
    product_not_in_cart = "product_not_in_cart"
    suspicious_behavior = "suspicious_behavior"

class AlertSeverity(str, enum.Enum):
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"

class Alert(Base):
    __tablename__ = "alerts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    camera_id = Column(UUID(as_uuid=True), ForeignKey("cameras.id"))
    zone_id = Column(UUID(as_uuid=True), ForeignKey("zones.id"), nullable=True)
    track_id = Column(Integer, nullable=True)
    alert_type = Column(Enum(AlertType))
    severity = Column(Enum(AlertSeverity))
    
    snapshot_before = Column(String, nullable=True)
    snapshot_during = Column(String, nullable=True)
    snapshot_after = Column(String, nullable=True)
    
    is_reviewed = Column(Boolean, default=False)
    reviewed_by = Column(String, nullable=True)
    reviewed_at = Column(DateTime, nullable=True)
    
    created_at = Column(DateTime, default=datetime.datetime.utcnow, index=True)

    # Relationships
    camera = relationship("Camera", back_populates="alerts")
    zone = relationship("Zone", back_populates="alerts")
