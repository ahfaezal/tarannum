"""Bounded, thread-safe reference cache with one computation per cold key."""
from collections import OrderedDict
from concurrent.futures import Future
from threading import Lock


class ReferenceAnalysisCache:
    def __init__(self, limit=4):
        self.limit = limit
        self._values = OrderedDict()
        self._pending = {}
        self._lock = Lock()

    def get_or_compute(self, key, compute):
        with self._lock:
            if key in self._values:
                self._values.move_to_end(key)
                return self._values[key], True
            future = self._pending.get(key)
            owner = future is None
            if owner:
                future = Future()
                self._pending[key] = future
        if not owner:
            return future.result(), True
        try:
            value = compute()
        except BaseException as error:
            # Wake every waiter, and allow subsequent jobs to retry this key.
            with self._lock:
                self._pending.pop(key, None)
                future.set_exception(error)
            raise
        with self._lock:
            self._values[key] = value
            self._values.move_to_end(key)
            while len(self._values) > self.limit:
                self._values.popitem(last=False)
            self._pending.pop(key, None)
            future.set_result(value)
        return value, False
