from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.models.alert import Alert, AlertSeverity
from backend.schemas.alert import AlertCreate, AlertOut, AlertReview
from backend.services.alert_service import alert_service

router = APIRouter()


@router.get("/alerts", response_model=dict)
async def get_alerts(
    skip: int = 0,
    limit: int = 50,
    severity: Optional[str] = None,
    is_reviewed: Optional[bool] = None,
    start_date: Optional[str] = Query(default=None),
    end_date: Optional[str] = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    query = select(Alert)
    count_query = select(func.count(Alert.id))
    filters = []

    if severity:
        try:
            filters.append(Alert.severity == AlertSeverity(severity))
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid severity.")
    if is_reviewed is not None:
        filters.append(Alert.is_reviewed == is_reviewed)
    if start_date:
        filters.append(Alert.created_at >= datetime.fromisoformat(start_date))
    if end_date:
        filters.append(Alert.created_at <= datetime.fromisoformat(end_date))

    if filters:
        query = query.where(*filters)
        count_query = count_query.where(*filters)

    query = query.order_by(Alert.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    alerts = result.scalars().all()
    total = await db.scalar(count_query)

    return {"total": total or 0, "alerts": alerts}


@router.put("/alerts/{alert_id}/review", response_model=AlertOut)
async def review_alert(alert_id: str, review: AlertReview, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Alert).where(Alert.id == UUID(alert_id)))
    updated_alert = result.scalar_one_or_none()
    if not updated_alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    updated_alert.is_reviewed = True
    updated_alert.reviewed_by = review.reviewed_by
    updated_alert.reviewed_at = datetime.utcnow()
    await db.commit()
    await db.refresh(updated_alert)
    return updated_alert


@router.post("/alerts", response_model=AlertOut)
async def create_alert(alert: AlertCreate, db: AsyncSession = Depends(get_db)):
    return await alert_service.process_alert(db, alert)


@router.get("/alerts/stats")
async def get_alert_stats(db: AsyncSession = Depends(get_db)):
    today = datetime.utcnow().date()
    start = datetime.combine(today, datetime.min.time())
    end = datetime.combine(today, datetime.max.time())

    rows = await db.execute(
        select(Alert.alert_type, func.count(Alert.id))
        .where(Alert.created_at >= start, Alert.created_at <= end)
        .group_by(Alert.alert_type)
    )
    by_type = {
        (row[0].value if hasattr(row[0], "value") else str(row[0])): row[1]
        for row in rows.all()
    }

    unreviewed = await db.scalar(select(func.count(Alert.id)).where(Alert.is_reviewed.is_(False)))
    total_today = await db.scalar(select(func.count(Alert.id)).where(Alert.created_at >= start, Alert.created_at <= end))
    return {
        "today_total": total_today or 0,
        "unreviewed_alerts": unreviewed or 0,
        "by_type": by_type,
    }
