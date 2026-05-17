import os
import re
from typing import List
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import settings
from backend.database import get_db
from backend.models.alert import Alert
from backend.models.camera import Camera, CameraStatus
from backend.models.tracking_event import TrackingEvent
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


def _update_mediamtx_yml(path_name: str, rtsp_url: str):
    yml_path = "/app/mediamtx.yml"
    if not os.path.exists(yml_path):
        yml_path = "mediamtx.yml"
    if not os.path.exists(yml_path):
        return
    try:
        text = open(yml_path).read()
        block = f"  {path_name}:\n    source: {rtsp_url}\n"
        if path_name in text:
            # update existing
            text = re.sub(
                rf"  {re.escape(path_name)}:\n    source: .*\n",
                block,
                text,
            )
        else:
            text = text.replace("paths:\n", f"paths:\n{block}", 1)
        open(yml_path, "w").write(text)
        print(f"[cameras] mediamtx.yml updated: {path_name}")
    except Exception as exc:
        print(f"[cameras] mediamtx.yml update failed: {exc}")


async def _mediamtx_add_path(path_name: str, rtsp_url: str) -> bool:
    if not rtsp_url:
        return False
    try:
        async with httpx.AsyncClient() as client:
            r = await client.post(
                f"{_mediamtx_api_base_url()}/v3/config/paths/add/{path_name}",
                json={"source": rtsp_url, "sourceOnDemand": False},
                timeout=httpx.Timeout(3.0),
            )
            return r.status_code in (200, 201)
    except Exception as exc:
        print(f"MediaMTX add path failed: {exc}")
        return False


async def _mediamtx_remove_path(path_name: str) -> bool:
    try:
        async with httpx.AsyncClient() as client:
            r = await client.delete(
                f"{_mediamtx_api_base_url()}/v3/config/paths/delete/{path_name}",
                timeout=httpx.Timeout(3.0),
            )
            return r.status_code in (200, 204)
    except Exception as exc:
        print(f"MediaMTX remove path failed: {exc}")
        return False


async def sync_camera_statuses(db: AsyncSession) -> int:
    """MediaMTX state অনুযায়ী DB camera status refresh করে।"""
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
    if new_camera.mediamtx_path and new_camera.rtsp_url:
        await _mediamtx_add_path(new_camera.mediamtx_path, new_camera.rtsp_url)
        _update_mediamtx_yml(new_camera.mediamtx_path, new_camera.rtsp_url)
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
    if camera.mediamtx_path and camera.rtsp_url:
        await _mediamtx_add_path(camera.mediamtx_path, camera.rtsp_url)
        _update_mediamtx_yml(camera.mediamtx_path, camera.rtsp_url)
    return camera


@router.delete("/cameras/{camera_id}")
async def delete_camera(camera_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Camera).where(_camera_id_filter(camera_id)))
    camera = result.scalar_one_or_none()
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")

    path_name = camera.mediamtx_path
    camera_uuid = camera.id

    from sqlalchemy import delete as sa_delete
    await db.execute(sa_delete(Alert).where(Alert.camera_id == camera_uuid))
    await db.execute(sa_delete(TrackingEvent).where(TrackingEvent.camera_id == camera_uuid))

    await db.delete(camera)
    await db.commit()
    if path_name:
        await _mediamtx_remove_path(path_name)
    return {"message": "Camera deleted successfully"}
