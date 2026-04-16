import os
from pathlib import Path

from dotenv import load_dotenv

WORKER_DIR = Path(__file__).resolve().parent
ROOT_DIR = WORKER_DIR.parent

load_dotenv(ROOT_DIR / ".env")
load_dotenv(WORKER_DIR / ".env")


def _parse_int_list(value: str | None) -> list[int]:
    if not value:
        return []
    items: list[int] = []
    for raw_item in value.split(","):
        item = raw_item.strip()
        if not item:
            continue
        try:
            items.append(int(item))
        except ValueError:
            print(f"Skipping invalid class id in YOLO_CLASS_IDS: {item}")
    return items


class WorkerConfig:
    API_URL = os.getenv("API_URL", "http://localhost:8000/api")
    MEDIAMTX_URL = os.getenv("MEDIAMTX_URL", "rtsp://localhost:8554")
    SNAPSHOT_DIR = os.getenv("SNAPSHOT_DIR", "snapshots")
    
    # YOLO and tracking parameters
    YOLO_MODEL_PATH = os.getenv("YOLO_MODEL_PATH", "models/yolo26n.pt")
    YOLO_TRACKER_CONFIG = os.getenv("YOLO_TRACKER_CONFIG", "bytetrack.yaml")
    TRACKING_ENABLED = os.getenv("TRACKING_ENABLED", "true").lower() in {"1", "true", "yes", "on"}
    CONFIDENCE_THRESHOLD = float(os.getenv("CONFIDENCE_THRESHOLD", 0.6))
    YOLO_CLASS_IDS = _parse_int_list(os.getenv("YOLO_CLASS_IDS", "0,24,25,26,28"))
    DEBUG_CAMERA_INDEX = int(os.getenv("WORKER_DEBUG_CAMERA", "4") or "4")
    DEBUG_FORCE_VISIBLE_TRACKS = os.getenv("WORKER_DEBUG_FORCE_VISIBLE_TRACKS", "true").lower() in {"1", "true", "yes", "on"}
    
    # Setup Camera Streams
    CAMERAS = []
    for i in range(1, 9):
        stream = os.getenv(f"CAMERA_{i}_RTSP")
        if stream:
            CAMERAS.append({
                "id": str(i),
                "camera_index": i,
                "mediamtx_path": f"camera{i}",
                "url": stream,
            })

config = WorkerConfig()
