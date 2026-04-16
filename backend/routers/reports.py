from __future__ import annotations

from datetime import date, datetime, timedelta
from io import BytesIO
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.models.alert import Alert
from backend.models.daily_summary import DailySummary
from backend.models.tracking_event import TrackingEvent
from backend.models.zone import Zone
from backend.services.email_service import email_service
from backend.services.report_service import report_service

router = APIRouter()


class ExportRequest(BaseModel):
    type: str
    format: str
    date_range: dict


def _to_stream(filename: str, payload: BytesIO) -> StreamingResponse:
    return StreamingResponse(
        payload,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/reports/daily")
async def get_daily_report(date: str, db: AsyncSession = Depends(get_db)):
    target_date = datetime.fromisoformat(date).date()
    summary = await db.scalar(select(DailySummary).where(DailySummary.date == target_date))
    events = await db.execute(
        select(TrackingEvent)
        .where(func.date(TrackingEvent.created_at) == target_date)
        .order_by(TrackingEvent.created_at.desc())
    )
    rows = events.scalars().all()
    hourly = {}
    for item in rows:
        hourly[item.created_at.hour] = hourly.get(item.created_at.hour, 0) + 1

    return {
        "date": target_date.isoformat(),
        "summary": {
            "total_customers": summary.total_customers if summary else 0,
            "unique_customers": summary.unique_customers if summary else 0,
            "peak_hour": summary.peak_hour if summary else None,
            "peak_hour_count": summary.peak_hour_count if summary else 0,
            "product_picks": summary.product_picks if summary else 0,
            "cart_detections": summary.cart_detections if summary else 0,
            "suspicious_count": summary.suspicious_count if summary else 0,
            "total_alerts": summary.total_alerts if summary else 0,
        },
        "hourly_breakdown": [{"hour": f"{h:02d}:00", "count": count} for h, count in sorted(hourly.items())],
    }


@router.get("/reports/weekly")
async def get_weekly_report(start: str, db: AsyncSession = Depends(get_db)):
    start_date = datetime.fromisoformat(start).date()
    end_date = start_date + timedelta(days=6)
    summaries = await db.execute(
        select(DailySummary).where(DailySummary.date >= start_date, DailySummary.date <= end_date).order_by(DailySummary.date.asc())
    )
    rows = summaries.scalars().all()
    return {
        "start": start_date.isoformat(),
        "end": end_date.isoformat(),
        "daily_breakdown": [{"date": row.date.isoformat(), "value": row.total_customers} for row in rows],
    }


@router.get("/reports/monthly")
async def get_monthly_report(month: str, db: AsyncSession = Depends(get_db)):
    year, month_num = [int(part) for part in month.split("-")]
    start_date = date(year, month_num, 1)
    if month_num == 12:
        end_date = date(year + 1, 1, 1) - timedelta(days=1)
    else:
        end_date = date(year, month_num + 1, 1) - timedelta(days=1)

    summaries = await db.execute(
        select(DailySummary).where(DailySummary.date >= start_date, DailySummary.date <= end_date).order_by(DailySummary.date.asc())
    )
    rows = summaries.scalars().all()
    alert_rows = await db.execute(
        select(Alert.alert_type, func.count(Alert.id))
        .where(func.date(Alert.created_at) >= start_date, func.date(Alert.created_at) <= end_date)
        .group_by(Alert.alert_type)
    )
    return {
        "month": month,
        "daily_breakdown": [{"date": row.date.isoformat(), "value": row.total_customers} for row in rows],
        "alert_types": {
            (item[0].value if hasattr(item[0], "value") else str(item[0])): item[1]
            for item in alert_rows.all()
        },
    }


@router.get("/reports/zone")
async def get_zone_report(zone_id: str, date: str, db: AsyncSession = Depends(get_db)):
    target_date = datetime.fromisoformat(date).date()
    zone = await db.scalar(select(Zone).where(Zone.id == UUID(zone_id)))
    if not zone:
        raise HTTPException(status_code=404, detail="Zone not found")

    summary = await db.scalar(
        select(DailySummary).where(DailySummary.date == target_date, DailySummary.zone_id == UUID(zone_id))
    )
    return {
        "zone_id": zone_id,
        "zone_name": zone.name,
        "date": target_date.isoformat(),
        "summary": {
            "total_customers": summary.total_customers if summary else 0,
            "product_picks": summary.product_picks if summary else 0,
            "cart_detections": summary.cart_detections if summary else 0,
            "suspicious_count": summary.suspicious_count if summary else 0,
        },
    }


@router.get("/reports/incidents")
async def get_incident_report(start: str, end: str, db: AsyncSession = Depends(get_db)):
    start_dt = datetime.fromisoformat(start)
    end_dt = datetime.fromisoformat(end)
    rows = await db.execute(
        select(Alert)
        .where(Alert.created_at >= start_dt, Alert.created_at <= end_dt)
        .order_by(Alert.created_at.desc())
    )
    alerts = rows.scalars().all()
    return {
        "incidents": [
            {
                "id": str(item.id),
                "alert_type": item.alert_type.value if hasattr(item.alert_type, "value") else str(item.alert_type),
                "severity": item.severity.value if hasattr(item.severity, "value") else str(item.severity),
                "created_at": item.created_at.isoformat(),
                "is_reviewed": item.is_reviewed,
            }
            for item in alerts
        ]
    }


@router.post("/reports/export")
async def export_report(req: ExportRequest, db: AsyncSession = Depends(get_db)):
    report_type = req.type.lower()
    if report_type == "daily":
        target_date = datetime.fromisoformat(req.date_range.get("date")).date()
        report = await get_daily_report(target_date.isoformat(), db)
        payload = await report_service.generate_daily_excel(report, target_date)
        return _to_stream(f"daily_report_{target_date.isoformat()}.xlsx", payload)

    if report_type == "weekly":
        start_date = datetime.fromisoformat(req.date_range.get("start")).date()
        report = await get_weekly_report(start_date.isoformat(), db)
        payload = await report_service.generate_weekly_excel(report, start_date)
        return _to_stream(f"weekly_report_{start_date.isoformat()}.xlsx", payload)

    if report_type == "monthly":
        month = req.date_range.get("month")
        report = await get_monthly_report(month, db)
        payload = await report_service.generate_monthly_excel(report, month)
        return _to_stream(f"monthly_report_{month}.xlsx", payload)

    if report_type == "incidents":
        start = datetime.fromisoformat(req.date_range.get("start"))
        end = datetime.fromisoformat(req.date_range.get("end"))
        report = await get_incident_report(start.isoformat(), end.isoformat(), db)
        payload = await report_service.generate_incidents_excel(report["incidents"], start, end)
        return _to_stream(f"incident_report_{start.date().isoformat()}_{end.date().isoformat()}.xlsx", payload)

    raise HTTPException(status_code=400, detail="Unsupported report type.")


@router.post("/reports/send-email")
async def send_report_email(req: ExportRequest, db: AsyncSession = Depends(get_db)):
    report_type = req.type.lower()
    export_response = await export_report(req, db)
    if not hasattr(export_response, "body_iterator"):
        raise HTTPException(status_code=400, detail="Failed to prepare report.")

    filename = export_response.headers.get("content-disposition", "report.xlsx").split("filename=")[-1].strip('"')
    content = b""
    async for chunk in export_response.body_iterator:
        content += chunk

    if report_type == "daily":
        await email_service.send_daily_report(req.date_range.get("date"), content, filename)
    elif report_type == "weekly":
        await email_service.send_weekly_report(req.date_range.get("start"), content, filename)
    elif report_type == "monthly":
        await email_service.send_monthly_report(req.date_range.get("month"), content, filename)
    else:
        await email_service.send_report_email(
            subject=f"Report - {report_type}",
            body="Attached is the requested report.",
            attachment=content,
            filename=filename,
        )

    return {"ok": True, "message": "Email sent or queued successfully."}
