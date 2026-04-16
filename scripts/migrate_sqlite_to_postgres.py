import asyncio
import json
import os
import sqlite3
import sys
import uuid
from datetime import date, datetime
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import Boolean, Date, DateTime, JSON, MetaData, Table, text
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.sql.sqltypes import Enum as SqlEnum
from sqlalchemy.sql.sqltypes import UUID as SqlUuid

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))
load_dotenv(ROOT_DIR / ".env")

SQLITE_PATH = ROOT_DIR / "supershop_db.sqlite"
POSTGRES_URL = os.getenv("POSTGRES_DOCKER_URL", "postgresql+asyncpg://supershop:supershop123@127.0.0.1:5432/supershop_db")

# Importing models registers every table on Base.metadata.
from backend.database import Base  # noqa: E402
from backend.models import Alert, Camera, DailySummary, TrackingEvent, Zone  # noqa: F401,E402


def normalize_value(column, value):
    if value is None:
        return None

    column_type = column.type

    if isinstance(column_type, SqlUuid):
        return value if isinstance(value, uuid.UUID) else uuid.UUID(str(value))

    if isinstance(column_type, Boolean):
        return bool(value)

    if isinstance(column_type, JSON):
        if isinstance(value, str):
            try:
                return json.loads(value)
            except json.JSONDecodeError:
                return value
        return value

    if isinstance(column_type, DateTime):
        if isinstance(value, datetime):
            return value
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))

    if isinstance(column_type, Date):
        if isinstance(value, date):
            return value
        return date.fromisoformat(str(value))

    if isinstance(column_type, SqlEnum):
        return str(value)

    return value


def collect_valid_ids(sqlite_conn, table_name):
    rows = sqlite_conn.execute(f'SELECT id FROM "{table_name}"').fetchall()
    return {str(row["id"]) for row in rows if row["id"] is not None}


async def migrate() -> None:
    if not SQLITE_PATH.exists():
        raise FileNotFoundError(f"SQLite database not found: {SQLITE_PATH}")

    sqlite_conn = sqlite3.connect(SQLITE_PATH)
    sqlite_conn.row_factory = sqlite3.Row
    valid_camera_ids = collect_valid_ids(sqlite_conn, "cameras")
    valid_zone_ids = collect_valid_ids(sqlite_conn, "zones")

    engine = create_async_engine(POSTGRES_URL, future=True, echo=False)

    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

            # Clear existing data so reruns stay predictable.
            for table in reversed(Base.metadata.sorted_tables):
                await conn.execute(text(f'TRUNCATE TABLE "{table.name}" RESTART IDENTITY CASCADE'))

            for table in Base.metadata.sorted_tables:
                rows = sqlite_conn.execute(f'SELECT * FROM "{table.name}"').fetchall()
                if not rows:
                    continue

                payload = []
                for row in rows:
                    if table.name in {"alerts", "tracking_events"} and row["camera_id"] is not None:
                        if str(row["camera_id"]) not in valid_camera_ids:
                            continue

                    item = {}
                    for column in table.columns:
                        raw_value = row[column.name]
                        if column.name == "zone_id" and raw_value is not None and str(raw_value) not in valid_zone_ids:
                            raw_value = None
                        if table.name == "cameras" and column.name == "zone_id" and raw_value is not None and str(raw_value) not in valid_zone_ids:
                            raw_value = None
                        item[column.name] = normalize_value(column, raw_value)
                    payload.append(item)

                await conn.execute(table.insert(), payload)
                print(f"Migrated {len(payload)} row(s) into {table.name}")
    finally:
        sqlite_conn.close()
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(migrate())
