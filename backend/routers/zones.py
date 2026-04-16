from __future__ import annotations

from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.models.zone import Zone
from backend.schemas.zone import ZoneCreate, ZoneOut, ZoneUpdate

router = APIRouter()


@router.get("/zones", response_model=List[ZoneOut])
async def get_zones(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Zone))
    return result.scalars().all()


@router.post("/zones", response_model=ZoneOut)
async def create_zone(zone: ZoneCreate, db: AsyncSession = Depends(get_db)):
    new_zone = Zone(**zone.model_dump())
    db.add(new_zone)
    await db.commit()
    await db.refresh(new_zone)
    return new_zone


@router.put("/zones/{zone_id}", response_model=ZoneOut)
async def update_zone(zone_id: str, zone_update: ZoneUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Zone).where(Zone.id == UUID(zone_id)))
    zone = result.scalar_one_or_none()
    if not zone:
        raise HTTPException(status_code=404, detail="Zone not found")

    for key, value in zone_update.model_dump(exclude_unset=True).items():
        setattr(zone, key, value)

    await db.commit()
    await db.refresh(zone)
    return zone


@router.delete("/zones/{zone_id}")
async def delete_zone(zone_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Zone).where(Zone.id == UUID(zone_id)))
    zone = result.scalar_one_or_none()
    if not zone:
        raise HTTPException(status_code=404, detail="Zone not found")

    await db.delete(zone)
    await db.commit()
    return {"message": "Zone deleted successfully"}
