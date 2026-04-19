import asyncio
import os
import sys

# Add root to path
sys.path.append(os.getcwd())

from backend.database import AsyncSessionLocal
from backend.models.camera import Camera
from sqlalchemy import select

async def check():
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(Camera))
        cameras = res.scalars().all()
        print("ID | Name | Web Enabled | RTSP URL")
        for c in cameras:
            print(f"{c.id} | {c.name} | {c.web_enabled} | {c.rtsp_url}")

if __name__ == "__main__":
    asyncio.run(check())
