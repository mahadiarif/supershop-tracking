from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base
from backend.config import settings

# Database engine তৈরি করছি (Async support সহ)
engine_kwargs = {
    "echo": False,
    "future": True,
}
if settings.DATABASE_URL.startswith("sqlite"):
    engine_kwargs["connect_args"] = {"check_same_thread": False}

engine = create_async_engine(settings.DATABASE_URL, **engine_kwargs)

# Async session factory
AsyncSessionLocal = async_sessionmaker(
    bind=engine, 
    class_=AsyncSession, 
    expire_on_commit=False
)

Base = declarative_base()

# Dependency function database session পাওয়ার জন্য
async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


async def ensure_camera_web_enabled_column() -> None:
    if not settings.DATABASE_URL.startswith("sqlite"):
        return

    async with engine.begin() as conn:
        def _has_column(sync_conn) -> bool:
            rows = sync_conn.exec_driver_sql("PRAGMA table_info(cameras)").fetchall()
            return any(row[1] == "web_enabled" for row in rows)

        has_column = await conn.run_sync(_has_column)
        if not has_column:
            await conn.execute(text("ALTER TABLE cameras ADD COLUMN web_enabled BOOLEAN NOT NULL DEFAULT 1"))
