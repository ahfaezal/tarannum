"""Lightweight assessment helpers; these do not change scoring policy."""
from bisect import bisect_left


def numeric_score(breakdown, key, fallback):
    value = breakdown.get(key)
    return round(value if isinstance(value, (int, float)) else fallback, 2)


class NearestPitchTime:
    """Indexed equivalent of min(keys, key=distance), including tie order."""

    def __init__(self, keys):
        self.order = {value: index for index, value in enumerate(keys)}
        self.times = sorted(self.order)

    def nearest(self, target):
        index = bisect_left(self.times, target)
        candidates = self.times[max(0, index - 1):index + 1]
        return min(candidates, key=lambda value: (abs(value - target), self.order[value])) if candidates else None
