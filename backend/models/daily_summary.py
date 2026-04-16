import uuid
import datetime
from sqlalchemy import Column, Date, Integer, ForeignKey
from sqlalchemy import UUID
from sqlalchemy.orm import relationship
from backend.database import Base

class DailySummary(Base):
    __tablename__ = "daily_summaries"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    date = Column(Date, unique=True, index=True)
    zone_id = Column(UUID(as_uuid=True), ForeignKey("zones.id"), nullable=True)
    
    total_customers = Column(Integer, default=0)
    unique_customers = Column(Integer, default=0)
    peak_hour = Column(Integer, nullable=True) # 0-23 hours
    peak_hour_count = Column(Integer, default=0)
    product_picks = Column(Integer, default=0)
    cart_detections = Column(Integer, default=0)
    suspicious_count = Column(Integer, default=0)
    total_alerts = Column(Integer, default=0)
    
    created_at = Column(Date, default=datetime.date.today)

    # Relationships
    zone = relationship("Zone", back_populates="summaries")
