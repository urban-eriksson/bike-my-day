"""A sliding-window rate limiter, in memory (from snicksnack).

In memory is the right size here: the deployment is a single uvicorn process,
so there is nothing to share state with.
"""

from __future__ import annotations

import time
from collections import defaultdict, deque


class Limiter:
    def __init__(self, limit: int, window_seconds: float) -> None:
        self.limit = limit
        self.window = window_seconds
        self._hits: defaultdict[str, deque[float]] = defaultdict(deque)

    def allow(self, key: str) -> bool:
        """Record an attempt against `key` and say whether it is within budget."""
        now = time.monotonic()
        hits = self._hits[key]
        cutoff = now - self.window
        while hits and hits[0] < cutoff:
            hits.popleft()
        if len(hits) >= self.limit:
            return False
        hits.append(now)
        self._prune(now)
        return True

    def _prune(self, now: float) -> None:
        """Drop keys whose whole window has aged out, so an attacker cycling
        addresses cannot grow the map without bound."""
        if len(self._hits) < 1000:
            return
        cutoff = now - self.window
        for key in [k for k, v in self._hits.items() if not v or v[-1] < cutoff]:
            del self._hits[key]

    def reset(self) -> None:
        self._hits.clear()
