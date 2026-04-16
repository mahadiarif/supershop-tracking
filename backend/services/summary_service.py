from __future__ import annotations

import datetime
from collections import Counter

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models.daily_summary import DailySummary
from backend.models.tracking_event import EventType, TrackingEvent
from backend.models.zone import Zone


class SummaryService:
    """Daily summary তৈরি ও update করার helper."""

    @staticmethod
    async def generate_daily_summary(db: AsyncSession, target_date: datetime.date):
        start = datetime.datetime.combine(target_date, datetime.time.min)
        end = datetime.datetime.combine(target_date, datetime.time.max)

        events_query = select(TrackingEvent).where(
            TrackingEvent.created_at >= start,
            TrackingEvent.created_at <= end,
        )
        result = await db.execute(events_query)
        events = result.scalars().all()

        total_customers = sum(1 for event in events if event.event_type == EventType.person_enter)
        unique_customers = len({event.track_id for event in events if event.track_id is not None})
        peak_hour_counter = Counter(event.created_at.hour for event in events)
        peak_hour, peak_hour_count = (None, 0)
        if peak_hour_counter:
            peak_hour, peak_hour_count = peak_hour_counter.most_common(1)[0]

        product_picks = sum(1 for event in events if event.event_type == EventType.product_pick)
        cart_detections = sum(1 for event in events if event.event_type == EventType.cart_detected)
        suspicious_count = 0
        total_alerts = 0

        existing = await db.execute(select(DailySummary).where(DailySummary.date == target_date))
        summary = existing.scalar_one_or_none()
        if summary is None:
            summary = DailySummary(date=target_date)
            db.add(summary)

        summary.total_customers = total_customers
        summary.unique_customers = unique_customers
        summary.peak_hour = peak_hour
        summary.peak_hour_count = peak_hour_count
        summary.product_picks = product_picks
        summary.cart_detections = cart_detections
        summary.suspicious_count = suspicious_count
        summary.total_alerts = total_alerts

        await db.commit()
        await db.refresh(summary)
        return summary


summary_service = SummaryService()
