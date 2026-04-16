from __future__ import annotations

import asyncio
import json
import urllib.error
import urllib.request
import uuid
from pathlib import Path
from typing import Any, Optional


class FastAPIClient:
    def __init__(self, base_url: str, snapshot_dir: str = "snapshots"):
        self.base_url = base_url.rstrip("/")
        self.snapshot_dir = Path(snapshot_dir)
        self.snapshot_dir.mkdir(parents=True, exist_ok=True)

    async def post_event(self, event_data: dict[str, Any]):
        return await self._request_json("POST", "/events", json=event_data)

    async def post_alert(self, alert_data: dict[str, Any]):
        return await self._request_json("POST", "/alerts", json=alert_data)

    async def post_live_detections(self, live_data: dict[str, Any]):
        return await self._request_json("POST", "/dashboard/live-detections", json=live_data)

    async def get_zones(self) -> list[dict[str, Any]]:
        data = await self._request_json("GET", "/zones")
        return data if isinstance(data, list) else data.get("zones", [])

    async def get_cameras(self) -> list[dict[str, Any]]:
        data = await self._request_json("GET", "/cameras")
        return data if isinstance(data, list) else data.get("value", data.get("cameras", []))

    async def _request_json(self, method: str, path: str, **kwargs) -> Optional[dict[str, Any] | list[Any]]:
        url = f"{self.base_url}{path}"
        last_error: Exception | None = None

        for attempt in range(3):
            try:
                return await asyncio.to_thread(self._request_json_sync, method, url, **kwargs)
            except Exception as exc:
                last_error = exc
                await asyncio.sleep(1 + attempt)

        print(f"FastAPI request failed for {path}: {last_error}")
        return None

    def _request_json_sync(self, method: str, url: str, **kwargs) -> Optional[dict[str, Any] | list[Any]]:
        payload = kwargs.get("json")
        headers = {"Content-Type": "application/json"}
        data = json.dumps(payload).encode("utf-8") if payload is not None else None
        request = urllib.request.Request(url, data=data, method=method.upper(), headers=headers)

        try:
            with urllib.request.urlopen(request, timeout=10) as response:
                raw = response.read()
                if not raw:
                    return None
                return json.loads(raw.decode("utf-8"))
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="ignore") if exc.fp else str(exc)
            raise RuntimeError(f"HTTP {exc.code} for {url}: {detail}") from exc

    def post_event_sync(self, event_data: dict[str, Any]):
        return asyncio.run(self.post_event(event_data))

    def post_alert_sync(self, alert_data: dict[str, Any]):
        return asyncio.run(self.post_alert(alert_data))

    def post_live_detections_sync(self, live_data: dict[str, Any]):
        return asyncio.run(self.post_live_detections(live_data))

    def save_snapshot(self, frame, type_str: str) -> str:
        filename = f"{type_str}_{uuid.uuid4().hex}.jpg"
        path = self.snapshot_dir / filename

        try:
            import cv2

            cv2.imwrite(str(path), frame)
        except Exception as exc:
            print(f"Failed to save snapshot {filename}: {exc}")
            return ""

        return str(path).replace("\\", "/")
