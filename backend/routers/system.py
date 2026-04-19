from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

import httpx

try:
    import redis.asyncio as redis
except Exception:  # pragma: no cover - redis optional
    redis = None

from backend.config import settings
from backend.database import get_db
from backend.routers.events import WORKER_IDLE_TIMEOUT, _load_worker_status
from backend.services.service_manager import service_manager

_active_tracking_camera_id: str | None = None

router = APIRouter()

SERVICE_META = {
    "database": {
        "service": "Database (SQL)",
        "detail": "Stores all camera records, event detections, and dashboard settings.",
        "controllable": False,
    },
    "redis": {
        "service": "Redis Cache",
        "detail": "Caches worker heartbeat, live state, and fast tracking metadata.",
        "controllable": False,
    },
    "mediamtx": {
        "service": "Stream Server (MediaMTX)",
        "detail": "Converts NVR RTSP feeds to ultra-low latency WebRTC browser streams.",
        "controllable": True,
    },
    "python_worker": {
        "service": "Python Worker",
        "detail": "Processes camera feeds and pushes detections back to the backend.",
        "controllable": True,
    },
    "backend_api": {
        "service": "Backend API",
        "detail": "Core processing application. Manages API requests.",
        "controllable": False,
    },
}


def _service_payload(key: str, status: str, message: str):
    meta = SERVICE_META[key]
    return {
        "key": key,
        "service": meta["service"],
        "status": status,
        "detail": meta["detail"],
        "message": message,
        "controllable": meta["controllable"],
        "running": status == "online",
    }


async def _check_redis_health() -> tuple[str, str]:
    redis_url = (settings.REDIS_URL or "").strip().lower()
    if redis_url in {"", "memory://local", "memory://"}:
        return "online", "Local memory cache is active. Redis is disabled in local mode."

    if redis is None:
        return "online", "Redis client not installed. Local memory cache fallback is active."

    try:
        client = redis.from_url(settings.REDIS_URL, decode_responses=True)
        await client.ping()
        await client.close()
        return "online", "Redis cache is reachable."
    except Exception as exc:
        return "online", f"Redis unavailable, local memory cache fallback active: {exc}"


@router.get("/health")
async def get_system_health(db: AsyncSession = Depends(get_db)):
    health_status = []

    try:
        await db.execute(text("SELECT 1"))
        health_status.append(
            _service_payload("database", "online", "Connected to database successfully.")
        )
    except Exception as exc:
        health_status.append(_service_payload("database", "offline", str(exc)))

    redis_status, redis_message = await _check_redis_health()
    health_status.append(_service_payload("redis", redis_status, redis_message))

    try:
        async with httpx.AsyncClient() as client:
            res = await client.get(f"{settings.MEDIAMTX_API_URL}/v3/paths/list", timeout=2.0)
            if res.status_code in {200, 401}:
                health_status.append(
                    _service_payload(
                        "mediamtx",
                        "online",
                        "MediaMTX WebRTC proxy is running."
                        if res.status_code == 200
                        else "MediaMTX is reachable, but API returned auth-required status.",
                    )
                )
            else:
                health_status.append(
                    _service_payload("mediamtx", "offline", f"Bad status code: {res.status_code}")
                )
    except Exception:
        health_status.append(
            _service_payload("mediamtx", "offline", "Cannot connect to MediaMTX. Video streams will fail!")
        )

    worker_state, worker_last_heartbeat = await _load_worker_status()
    worker_running = False
    if worker_last_heartbeat is not None:
        age_seconds = (datetime.utcnow() - worker_last_heartbeat).total_seconds()
        worker_running = age_seconds <= WORKER_IDLE_TIMEOUT and worker_state in {"active", "idle", "error"}
    worker_status = "online" if worker_running else "offline"
    if worker_running:
        worker_message = "Python worker heartbeat is active."
    else:
        worker_message = "Python worker heartbeat is not active. Start it locally from this machine."
    health_status.append(_service_payload("python_worker", worker_status, worker_message))

    health_status.append(_service_payload("backend_api", "online", "Serving requests normally."))

    overall_status = "ok" if all(s["status"] == "online" for s in health_status) else "error"
    return {"status": overall_status, "services": health_status}


@router.get("/services")
async def get_services():
    services = []
    for key in service_manager.list_supported():
        meta = SERVICE_META[key]
        running = service_manager.is_running(key)
        services.append(
            {
                "key": key,
                "service": meta["service"],
                "controllable": meta["controllable"],
                "running": running,
            }
        )
    return {"services": services}


@router.post("/services/{service_key}/start")
async def start_service(service_key: str):
    if service_key not in service_manager.list_supported():
        raise HTTPException(status_code=404, detail="Service not found.")

    ok, message = service_manager.start(service_key)
    if not ok:
        raise HTTPException(status_code=400, detail=message)
    return {"ok": True, "service": service_key, "message": message}


@router.post("/services/{service_key}/stop")
async def stop_service(service_key: str):
    if service_key not in service_manager.list_supported():
        raise HTTPException(status_code=404, detail="Service not found.")

    ok, message = service_manager.stop(service_key)
    if not ok:
        raise HTTPException(status_code=400, detail=message)
    return {"ok": True, "service": service_key, "message": message}


@router.get("/active-tracking")
async def get_active_tracking_camera():
    return {"camera_id": _active_tracking_camera_id}


@router.post("/active-tracking/{camera_id}")
async def set_active_tracking_camera(camera_id: str):
    global _active_tracking_camera_id
    if camera_id.upper() in {"AUTO", "NONE", "NULL"}:
        _active_tracking_camera_id = None
    else:
        _active_tracking_camera_id = camera_id
    return {"ok": True, "active_camera_id": _active_tracking_camera_id}
