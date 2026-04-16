import asyncio
from sqlalchemy import select
import uuid
import sys
import os

# Add backend to path to import models
sys.path.append(os.getcwd())

from backend.models.camera import Camera, CameraStatus
from backend.database import AsyncSessionLocal
from backend.config import settings

async def add_camera():
    async with AsyncSessionLocal() as session:
        # Check if camera9 already exists in DB
        result = await session.execute(select(Camera).where(Camera.mediamtx_path == "camera9"))
        existing = result.scalar_one_or_none()
        
        if existing:
            print("Camera with path 'camera9' already exists in database.")
            return

        new_cam = Camera(
            id=uuid.uuid4(),
            name="Tiandy Camera",
            rtsp_url="rtsp://admin:admin123@192.168.1.2:554/live/main",
            mediamtx_path="camera9",
            status=CameraStatus.offline,
            web_enabled=True
        )
        session.add(new_cam)
        await session.commit()
        print(f"Successfully added 'Tiandy Camera' (camera9) to the database.")

if __name__ == "__main__":
    asyncio.run(add_camera())
