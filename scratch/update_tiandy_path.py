import asyncio
from sqlalchemy import select, update
import sys
import os

sys.path.append(os.getcwd())

from backend.models.camera import Camera
from backend.database import AsyncSessionLocal

async def update_path():
    async with AsyncSessionLocal() as session:
        # Update camera9 to use camera9_v (the transcoded path)
        q = update(Camera).where(Camera.mediamtx_path == "camera9").values(mediamtx_path="camera9_v")
        await session.execute(q)
        await session.commit()
        print("Updated Tiandy Camera to use transcoded path 'camera9_v'.")

if __name__ == "__main__":
    asyncio.run(update_path())
