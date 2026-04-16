import asyncio
from sqlalchemy import select, update
import sys
import os

sys.path.append(os.getcwd())

from backend.models.camera import Camera
from backend.database import AsyncSessionLocal

async def revert_path():
    async with AsyncSessionLocal() as session:
        # Revert camera9_v back to camera9
        q = update(Camera).where(Camera.mediamtx_path == "camera9_v").values(mediamtx_path="camera9")
        await session.execute(q)
        await session.commit()
        print("Reverted Tiandy Camera to original path 'camera9'.")

if __name__ == "__main__":
    asyncio.run(revert_path())
