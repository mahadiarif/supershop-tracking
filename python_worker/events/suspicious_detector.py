from __future__ import annotations


class SuspiciousDetector:
    def __init__(self):
        self.track_history: dict[int, dict[str, object]] = {}

    def check_loitering(self, track_id, zone_id, time_spent):
        if time_spent > 60:  # 60+ seconds
            return True
        return False

    def check_concealment(self, track_id, bboxes):
        """এক track এর bbox history বদল drastic হলে concealment suspect."""
        history = self.track_history.setdefault(track_id, {"bboxes": []})
        items = history.setdefault("bboxes", [])
        items.append(bboxes)
        if len(items) < 3:
            return False
        return items[-1] != items[-2]

    def check_unbilled_exit(self, track_id, path):
        """Exit path checkout zone bypass করলে suspicious ধরা."""
        if not path:
            return False
        return "checkout" not in path and path[-1] == "exit"
