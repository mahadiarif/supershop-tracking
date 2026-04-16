from __future__ import annotations

import math
from dataclasses import dataclass


@dataclass
class TrackState:
    track_id: int
    bbox: list[float]
    hits: int = 1
    age: int = 0


class ByteTrackerWrapper:
    def __init__(self, max_age: int = 30, iou_threshold: float = 0.2, distance_threshold: float = 80.0):
        self._tracks: dict[int, TrackState] = {}
        self._next_id = 1
        self.max_age = max_age
        self.iou_threshold = iou_threshold
        self.distance_threshold = distance_threshold

    def _center_distance(self, a: list[float], b: list[float]) -> float:
        ax = (a[0] + a[2]) / 2
        ay = (a[1] + a[3]) / 2
        bx = (b[0] + b[2]) / 2
        by = (b[1] + b[3]) / 2
        return math.hypot(ax - bx, ay - by)

    def _iou(self, a: list[float], b: list[float]) -> float:
        ax1, ay1, ax2, ay2 = a
        bx1, by1, bx2, by2 = b

        inter_x1 = max(ax1, bx1)
        inter_y1 = max(ay1, by1)
        inter_x2 = min(ax2, bx2)
        inter_y2 = min(ay2, by2)

        inter_w = max(0.0, inter_x2 - inter_x1)
        inter_h = max(0.0, inter_y2 - inter_y1)
        inter_area = inter_w * inter_h

        a_area = max(0.0, ax2 - ax1) * max(0.0, ay2 - ay1)
        b_area = max(0.0, bx2 - bx1) * max(0.0, by2 - by1)
        union = a_area + b_area - inter_area
        if union <= 0:
            return 0.0
        return inter_area / union

    def _best_match(self, bbox: list[float], used_track_ids: set[int]) -> TrackState | None:
        best_track = None
        best_score = 0.0

        for track_id, track in self._tracks.items():
            if track_id in used_track_ids:
                continue

            iou = self._iou(track.bbox, bbox)
            distance = self._center_distance(track.bbox, bbox)
            if iou >= self.iou_threshold and iou > best_score:
                best_score = iou
                best_track = track
            elif best_track is None and distance < self.distance_threshold and distance < 999999:
                best_score = 0.0
                best_track = track

        return best_track

    def update(self, detections, frame=None):
        """Fallback tracker that keeps IDs stable when ByteTrack output is unavailable."""
        updated = []
        used_track_ids: set[int] = set()

        for det in detections:
            bbox = det.get("bbox") or []
            if len(bbox) != 4:
                continue

            existing_track_id = det.get("track_id")
            if existing_track_id is not None:
                try:
                    track_id = int(existing_track_id)
                except Exception:
                    track_id = None
                if track_id is not None:
                    track = self._tracks.get(track_id)
                    if track is None:
                        track = TrackState(track_id=track_id, bbox=bbox)
                        self._tracks[track_id] = track
                    else:
                        track.bbox = bbox
                        track.hits += 1
                        track.age = 0
                    used_track_ids.add(track.track_id)
                    det["track_id"] = track.track_id
                    updated.append(det)
                    continue

            best_track = self._best_match(bbox, used_track_ids)
            if best_track is None:
                track_id = self._next_id
                self._next_id += 1
                best_track = TrackState(track_id=track_id, bbox=bbox)
                self._tracks[track_id] = best_track
            else:
                best_track.hits += 1
                best_track.bbox = bbox
                best_track.age = 0

            used_track_ids.add(best_track.track_id)
            det["track_id"] = best_track.track_id
            updated.append(det)

        for track_id, track in list(self._tracks.items()):
            if track_id not in used_track_ids:
                track.age += 1
                if track.age > self.max_age:
                    self._tracks.pop(track_id, None)

        return updated
