from typing import List
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import settings
from backend.database import get_db
from backend.models.camera import Camera, CameraStatus
from backend.schemas.camera import CameraCreate, CameraOut, CameraUpdate

router = APIRouter()


def _mediamtx_api_base_url() -> str:
    return settings.MEDIAMTX_API_URL.replace("://localhost", "://127.0.0.1")


async def _fetch_mediamtx_paths() -> dict:
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{_mediamtx_api_base_url()}/v3/paths/list",
                timeout=httpx.Timeout(1.0, connect=0.4),
            )
            if response.status_code != 200:
                return {}
            data = response.json()
            return {item.get("name"): item.get("ready", False) for item in data.get("items", [])}
    except Exception:
        return {}


def _camera_id_filter(camera_id: str):
    try:
        return Camera.id == UUID(camera_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid camera ID")


async def sync_camera_statuses(db: AsyncSession) -> int:
    """MediaMTX state অনুযায়ী DB camera status refresh করে."""
    paths = await _fetch_mediamtx_paths()
    result = await db.execute(select(Camera))
    cameras = result.scalars().all()
    updated = 0

    for camera in cameras:
        new_status = CameraStatus.online if paths.get(camera.mediamtx_path, False) else CameraStatus.offline
        if camera.status != new_status:
            camera.status = new_status
            updated += 1

    if updated:
        await db.commit()
    return updated


@router.get("/cameras", response_model=List[CameraOut])
async def get_cameras(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Camera))
    cameras = result.scalars().all()
    paths = await _fetch_mediamtx_paths()

    result_list = []
    for cam in cameras:
        cam_out = CameraOut.model_validate(cam)
        is_ready = paths.get(cam.mediamtx_path, False)
        cam_out.status = CameraStatus.online if is_ready else CameraStatus.offline
        result_list.append(cam_out)

    return result_list


@router.post("/cameras", response_model=CameraOut)
async def create_camera(camera: CameraCreate, db: AsyncSession = Depends(get_db)):
    new_camera = Camera(**camera.dict())
    db.add(new_camera)
    await db.commit()
    await db.refresh(new_camera)
    return new_camera


@router.get("/cameras/{camera_id}/status")
async def check_camera_status(camera_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Camera).where(_camera_id_filter(camera_id)))
    camera = result.scalar_one_or_none()
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")

    paths = await _fetch_mediamtx_paths()
    is_online = bool(paths.get(camera.mediamtx_path, False))
    return {"status": "online" if is_online else "offline"}


@router.put("/cameras/{camera_id}", response_model=CameraOut)
async def update_camera(camera_id: str, camera_update: CameraUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Camera).where(_camera_id_filter(camera_id)))
    camera = result.scalar_one_or_none()
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")

    for key, value in camera_update.dict(exclude_unset=True).items():
        setattr(camera, key, value)

    await db.commit()
    await db.refresh(camera)
    return camera


@router.delete("/cameras/{camera_id}")
async def delete_camera(camera_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Camera).where(_camera_id_filter(camera_id)))
    camera = result.scalar_one_or_none()
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")

    await db.delete(camera)
    await db.commit()
    return {"message": "Camera deleted successfully"}
