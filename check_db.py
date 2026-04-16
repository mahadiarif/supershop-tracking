import asyncio
from backend.database import engine
from sqlalchemy import text

async def check():
    async with engine.connect() as conn:
        res = await conn.execute(text('SELECT count(*) FROM cameras'))
        print(f"Cameras count: {res.scalar()}")
        
        res = await conn.execute(text('SELECT * FROM cameras'))
        rows = res.fetchall()
        for row in rows:
            print(row)

if __name__ == "__main__":
    asyncio.run(check())
