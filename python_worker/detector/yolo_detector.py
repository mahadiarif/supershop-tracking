from __future__ import annotations

import os
from pathlib import Path
from typing import Any

try:
    import cv2
except Exception:  # pragma: no cover - environment dependent
    cv2 = None

try:
    import torch
except Exception:
    torch = None


class YoloDetector:
    def __init__(self, model_path: str, conf_threshold: float = 0.6, class_ids: list[int] | None = None):
        self.conf = conf_threshold
        self.device = "cuda" if torch is not None and torch.cuda.is_available() else "cpu"
        self.model = None
        self.model_path = self._resolve_model_path(model_path)
        self.allowed_classes = class_ids or [0, 24, 25, 26, 28]
        self.motion_background = cv2.createBackgroundSubtractorMOG2(history=300, varThreshold=32, detectShadows=False) if cv2 is not None else None
        self.enable_ultralytics = os.getenv("WORKER_ENABLE_ULTRALYTICS", "false").lower() in {"1", "true", "yes", "on"}

        if self.enable_ultralytics:
            try:
                from ultralytics import YOLO as UltralyticsYOLO

                self.model = UltralyticsYOLO(self.model_path)
                print(f"YOLO model loaded from {self.model_path} on {self.device}")
            except Exception as exc:
                print(f"YOLO model load failed for {self.model_path}: {exc}")
                self.model = None
        else:
            print("Ultralytics disabled. Falling back to motion-based / visual-test live detection.")

    def _resolve_model_path(self, model_path: str) -> str:
        candidate = Path(model_path)
        if candidate.is_file():
            return str(candidate)

        worker_dir = Path(__file__).resolve().parent.parent
        search_paths = [
            worker_dir / model_path,
            worker_dir / "models" / candidate.name,
            worker_dir.parent / "models" / candidate.name,
            Path.cwd() / model_path,
        ]

        for path in search_paths:
            if path.is_file():
                return str(path)

        return "yolo26n.pt"

    def _extract_detections(self, results) -> list[dict[str, Any]]:
        detections: list[dict[str, Any]] = []

        for result in results or []:
            boxes = getattr(result, "boxes", None)
            if boxes is None:
                continue

            names = getattr(result, "names", {}) or {}
            box_ids = getattr(boxes, "id", None)

            for index, box in enumerate(boxes):
                try:
                    bbox = box.xyxy[0].tolist()
                    class_id = int(box.cls[0])
                    confidence = float(box.conf[0])
                except Exception:
                    continue

                detection: dict[str, Any] = {
                    "bbox": bbox,
                    "class": class_id,
                    "confidence": confidence,
                    "object_class": names.get(class_id, "object"),
                }

                if box_ids is not None:
                    try:
                        raw_track_id = box_ids[index]
                        if raw_track_id is not None:
                            detection["track_id"] = int(raw_track_id.item() if hasattr(raw_track_id, "item") else raw_track_id)
                    except Exception:
                        pass

                detections.append(detection)

        return detections

    def _motion_detect(self, frame) -> list[dict[str, Any]]:
        if cv2 is None or self.motion_background is None:
            return []

        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        blurred = cv2.GaussianBlur(gray, (7, 7), 0)
        mask = self.motion_background.apply(blurred)
        mask = cv2.erode(mask, None, iterations=1)
        mask = cv2.dilate(mask, None, iterations=2)

        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        detections: list[dict[str, Any]] = []

        for contour in contours:
            area = cv2.contourArea(contour)
            if area < 1500:
                continue
            x, y, w, h = cv2.boundingRect(contour)
            detections.append(
                {
                    "bbox": [float(x), float(y), float(x + w), float(y + h)],
                    "class": 0,
                    "confidence": min(0.99, 0.5 + min(0.49, area / 50000.0)),
                    "object_class": "motion",
                }
            )

        return detections[:10]

    def detect(self, frame) -> list[dict[str, Any]]:
        if self.model is not None:
            try:
                results = self.model.predict(
                    source=frame,
                    conf=self.conf,
                    classes=self.allowed_classes or None,
                    verbose=False,
                    device=self.device,
                )
                detections = self._extract_detections(results)
                if detections:
                    return detections
            except Exception as exc:
                print(f"YOLO detection failed: {exc}")

        fallback = self._motion_detect(frame)
        if fallback:
            return fallback
        return []

    def track(self, frame, tracker_cfg: str = "bytetrack.yaml") -> list[dict[str, Any]]:
        if self.model is not None and hasattr(self.model, "track"):
            try:
                results = self.model.track(
                    source=frame,
                    conf=self.conf,
                    classes=self.allowed_classes or None,
                    verbose=False,
                    device=self.device,
                    persist=True,
                    tracker=tracker_cfg,
                )
                tracked = self._extract_detections(results)
                if tracked:
                    return tracked
            except Exception as exc:
                print(f"YOLO tracking failed, falling back to detection: {exc}")

        fallback = self.detect(frame)
        return fallback
