from __future__ import annotations

import math


class CartTracker:
    def __init__(self):
        self.last_associations: dict[int, int] = {}

    def associate_cart_with_person(self, cart_bbox, person_bbox):
        """সবচেয়ে কাছের cart-person জোড়া বের করে association দেয়."""
        if not cart_bbox or not person_bbox:
            return False

        cx = (cart_bbox[0] + cart_bbox[2]) / 2
        cy = (cart_bbox[1] + cart_bbox[3]) / 2
        px = (person_bbox[0] + person_bbox[2]) / 2
        py = (person_bbox[1] + person_bbox[3]) / 2
        distance = math.hypot(cx - px, cy - py)
        return distance < 150
