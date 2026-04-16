import asyncio
import uuid
from backend.database import AsyncSessionLocal
from backend.models.camera import Camera
from sqlalchemy import select

async def seed():
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Camera))
        existing_cams = result.scalars().all()
        if len(existing_cams) > 0:
            print(f"Deleting {len(existing_cams)} existing cameras.")
            for c in existing_cams:
                await db.delete(c)
            await db.commit()

        for i in range(1, 9):
            cam = Camera(
                id=uuid.uuid4(),
                name=f"Camera {i}",
                rtsp_url=f"rtsp://admin:mnbl09612@172.17.15.220:554/Streaming/Channels/{i}01",
                mediamtx_path=f"camera{i}",
                status="online"
            )
            db.add(cam)
        await db.commit()
        print("Successfully seeded 8 cameras!")

if __name__ == "__main__":
    asyncio.run(seed())
