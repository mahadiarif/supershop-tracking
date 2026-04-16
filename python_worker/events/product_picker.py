from __future__ import annotations

from typing import Any


class ProductPicker:
    def __init__(self):
        self.last_pick_time_by_track: dict[int, float] = {}

    def check_interaction(self, person_bbox, shelf_zone):
        """Person bbox shelf zone এর কাছে এলে product interaction ধরে."""
        if not person_bbox or not shelf_zone:
            return False

        px1, py1, px2, py2 = person_bbox
        sx1, sy1, sx2, sy2 = shelf_zone
        person_center_x = (px1 + px2) / 2
        person_center_y = (py1 + py2) / 2

        return sx1 <= person_center_x <= sx2 and sy1 <= person_center_y <= sy2
