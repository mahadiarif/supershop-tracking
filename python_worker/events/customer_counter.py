from __future__ import annotations

import time


class CustomerCounter:
    def __init__(self):
        self.entry_count = 0
        self.exit_count = 0
        self.track_states: dict[int, dict[str, float | str | None]] = {}

    def process_zone_crossing(self, track_id, previous_zone, current_zone):
        """Zone boundary cross হলে count/state update করে."""
        now = time.time()
        state = self.track_states.setdefault(track_id, {"entered_at": now, "last_zone": previous_zone})

        if previous_zone is None:
            previous_zone = state.get("last_zone")

        if previous_zone != current_zone:
            if current_zone == "entrance":
                self.entry_count += 1
                state["entered_at"] = now
            elif current_zone == "exit":
                self.exit_count += 1

            state["last_zone"] = current_zone
            return True
        return False

    def calculate_dwell_time(self, track_id):
        state = self.track_states.get(track_id)
        if not state:
            return 0
        entered_at = float(state.get("entered_at") or time.time())
        return max(0, int(time.time() - entered_at))
