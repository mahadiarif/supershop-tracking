# Supershop AI Tracking System

This is a comprehensive FastAPI + React + Python Worker based Real-Time surveillance project for Supershops.

## Components
1. **backend**: FastAPI backend using Async SQLAlchemy, PostgreSQL, Redis, APScheduler, and WebSockets.
2. **python_worker**: Multithreaded Python worker that captures RTSP feeds, processes them via a configurable YOLO model plus ByteTrack, and streams events/alerts to the backend.
3. **frontend**: React 18, Vite, TailwindCSS dashboard to monitor live streams, metrics, and handle alerts.
4. **MediaMTX**: Ultra-low latency camera stream management.

## Setup Instructions

### 1. Requirements
- Docker and Docker Compose
- Python 3.11+
- Node.js 18+

### 2. Environment Setup
```bash
cp .env.example .env
nano .env # Configure your database, camera urls, and email
```

### 3. Docker Services (DB, Redis, MediaMTX, Backend, Worker, Frontend)
```bash
docker-compose up -d
```
This will bring up Postgres, Redis, MediaMTX, the FastAPI backend, the Python worker, and the React frontend.

### 4. Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
uvicorn main:app --reload --port 8000
```

### 5. Python Worker
```bash
cd python_worker
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python main.py
```

### 6. Frontend
```bash
cd frontend
npm install
npm run dev
```

Visit the dashboard at `http://localhost:5173`.

## Notes
- Existing camera records are preserved in the SQLite/PostgreSQL database file and are not reset by these steps.
- If you use Docker, the frontend will still work with the backend on `http://localhost:8000`.
- The worker defaults to `models/yolov26.pt` if you provide a custom model file. If that file is missing, it falls back to Ultralytics model resolution or the configured class list.
- For Docker, place your custom YOLO weight file in `models/` at the repo root so the worker can mount and load it.
