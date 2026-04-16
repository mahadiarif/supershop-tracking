from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
from apscheduler.schedulers.asyncio import AsyncIOScheduler
import asyncio
import datetime

from backend.database import engine, Base, AsyncSessionLocal, ensure_camera_web_enabled_column
from backend.routers import events, alerts, cameras, zones, dashboard, reports, system
from backend.websocket.manager import manager
from backend.config import settings
from backend.services.summary_service import summary_service
from backend.services.email_service import email_service
from backend.services.report_service import report_service

scheduler = AsyncIOScheduler()


async def _run_daily_summary():
    async with AsyncSessionLocal() as db:
        await summary_service.generate_daily_summary(db, datetime.datetime.utcnow().date())


async def _sync_camera_statuses():
    async with AsyncSessionLocal() as db:
        await cameras.sync_camera_statuses(db)


async def _send_weekly_report():
    async with AsyncSessionLocal() as db:
        start = (datetime.datetime.utcnow().date() - datetime.timedelta(days=7)).isoformat()
        payload = {"type": "weekly", "format": "excel", "date_range": {"start": start}}
        report = await reports.get_weekly_report(start, db)
        excel = await report_service.generate_weekly_excel(report, datetime.datetime.fromisoformat(start).date())
        await email_service.send_weekly_report(start, excel.getvalue(), f"weekly_report_{start}.xlsx")


async def _send_monthly_report():
    async with AsyncSessionLocal() as db:
        month = datetime.datetime.utcnow().strftime("%Y-%m")
        report = await reports.get_monthly_report(month, db)
        excel = await report_service.generate_monthly_excel(report, month)
        await email_service.send_monthly_report(month, excel.getvalue(), f"monthly_report_{month}.xlsx")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Create tables if not exist (In production use Alembic)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await ensure_camera_web_enabled_column()
    
    # Start APScheduler tasks
    scheduler.add_job(_run_daily_summary, "cron", hour=23, minute=59)
    scheduler.add_job(_send_weekly_report, "cron", day_of_week="sun", hour=8, minute=0)
    scheduler.add_job(_send_monthly_report, "cron", day=1, hour=8, minute=0)
    scheduler.add_job(_sync_camera_statuses, "interval", seconds=30)
    scheduler.start()
    print("Application and Scheduler Started")
    yield
    # Shutdown
    scheduler.shutdown()
    print("Application Shutdown")

# FastAPI App setup
app = FastAPI(title="Supershop AI Tracking System", lifespan=lifespan)

# CORS middleware React frontend এর জন্য
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL, "http://127.0.0.1:5173", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Snapshots serve
import os
os.makedirs(settings.SNAPSHOT_DIR, exist_ok=True)
app.mount("/snapshots", StaticFiles(directory=settings.SNAPSHOT_DIR), name="snapshots")

# Include all routers
app.include_router(events.router, prefix="/api", tags=["Events"])
app.include_router(alerts.router, prefix="/api", tags=["Alerts"])
app.include_router(cameras.router, prefix="/api", tags=["Cameras"])
app.include_router(zones.router, prefix="/api", tags=["Zones"])
app.include_router(dashboard.router, prefix="/api", tags=["Dashboard"])
app.include_router(reports.router, prefix="/api", tags=["Reports"])
app.include_router(system.router, prefix="/api/system", tags=["System"])

# WebSocket endpoint for dashboard
@app.websocket("/ws/dashboard")
async def websocket_dashboard(websocket: WebSocket):
    await manager.connect("dashboard", websocket)
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        print(f"Dashboard websocket error: {exc}")
    finally:
        manager.disconnect("dashboard", websocket)

# WebSocket endpoint per camera
@app.websocket("/ws/camera/{camera_id}")
async def websocket_camera(websocket: WebSocket, camera_id: str):
    room_name = f"camera_{camera_id}"
    await manager.connect(room_name, websocket)
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        print(f"Camera websocket error for {camera_id}: {exc}")
    finally:
        manager.disconnect(room_name, websocket)

@app.get("/")
async def root():
    return {"message": "Supershop Tracking API is running."}
