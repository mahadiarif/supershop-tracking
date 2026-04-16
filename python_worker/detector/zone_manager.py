from __future__ import annotations

from typing import Any

import cv2
import numpy as np


class ZoneManager:
    def __init__(self, zones: dict[str, list[list[float]]]):
        self.zones = zones

    def is_in_zone(self, bbox, zone_polygon):
        x_center = (bbox[0] + bbox[2]) / 2
        y_center = (bbox[1] + bbox[3]) / 2

        polygon = np.array(zone_polygon, np.int32)
        poly_path = cv2.pointPolygonTest(polygon, (x_center, y_center), False)
        return poly_path >= 0

    def get_zone_for_bbox(self, bbox):
        for zone_id, polygon in self.zones.items():
            if self.is_in_zone(bbox, polygon):
                return zone_id
        return None

    def crossed_line(self, previous_point, current_point, line_points):
        """Simple line crossing check for entry/exit line logic."""
        if not previous_point or not current_point or not line_points:
            return False

        (x1, y1), (x2, y2) = line_points
        prev_side = (x2 - x1) * (previous_point[1] - y1) - (y2 - y1) * (previous_point[0] - x1)
        curr_side = (x2 - x1) * (current_point[1] - y1) - (y2 - y1) * (current_point[0] - x1)
        return prev_side == 0 or curr_side == 0 or (prev_side < 0 < curr_side) or (curr_side < 0 < prev_side)
