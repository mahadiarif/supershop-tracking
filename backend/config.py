from pydantic_settings import BaseSettings
import os
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
ROOT_DIR = BASE_DIR.parent

load_dotenv(ROOT_DIR / ".env")
load_dotenv(BASE_DIR / ".env")

class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = os.getenv("DATABASE_URL", "postgresql+asyncpg://user:pass@localhost/supershop_db")
    REDIS_URL: str = os.getenv("REDIS_URL", "memory://local")
    
    # MediaMTX
    MEDIAMTX_API_URL: str = os.getenv("MEDIAMTX_API_URL", "http://localhost:9997")
    
    # App
    SNAPSHOT_DIR: str = os.getenv("SNAPSHOT_DIR", "snapshots")
    FRONTEND_URL: str = os.getenv("FRONTEND_URL", "http://localhost:5173")
    
    # Email
    EMAIL_HOST: str = os.getenv("EMAIL_HOST", "smtp.gmail.com")
    EMAIL_PORT: int = int(os.getenv("EMAIL_PORT", 587))
    EMAIL_USER: str = os.getenv("EMAIL_USER", "")
    EMAIL_PASS: str = os.getenv("EMAIL_PASS", "")
    REPORT_EMAIL_TO: str = os.getenv("REPORT_EMAIL_TO", "")
    API_SECRET_KEY: str = os.getenv("API_SECRET_KEY", "change-me")

    # Camera RTSP presets
    CAMERA_1_RTSP: str = os.getenv("CAMERA_1_RTSP", "")
    CAMERA_2_RTSP: str = os.getenv("CAMERA_2_RTSP", "")
    CAMERA_3_RTSP: str = os.getenv("CAMERA_3_RTSP", "")
    CAMERA_4_RTSP: str = os.getenv("CAMERA_4_RTSP", "")
    CAMERA_5_RTSP: str = os.getenv("CAMERA_5_RTSP", "")
    CAMERA_6_RTSP: str = os.getenv("CAMERA_6_RTSP", "")
    CAMERA_7_RTSP: str = os.getenv("CAMERA_7_RTSP", "")
    CAMERA_8_RTSP: str = os.getenv("CAMERA_8_RTSP", "")

    class Config:
        case_sensitive = True

settings = Settings()
