import unittest
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier, Event, Lock
from reference_analysis_cache import ReferenceAnalysisCache


class CacheTests(unittest.TestCase):
    def test_same_key_computes_once(self):
        cache = ReferenceAnalysisCache()
        barrier = Barrier(10)
        calls = []
        lock = Lock()
        value = object()
        def compute():
            with lock:
                calls.append(1)
            return value
        def run(_):
            barrier.wait(timeout=5)
            return cache.get_or_compute('qari', compute)
        with ThreadPoolExecutor(10) as pool:
            results = list(pool.map(run, range(10)))
        self.assertEqual(len(calls), 1)
        self.assertEqual(sum(not hit for _, hit in results), 1)
        self.assertTrue(all(result is value for result, _ in results))

    def test_different_keys_not_serialized(self):
        cache = ReferenceAnalysisCache()
        barrier = Barrier(2)
        def run(key):
            def compute():
                barrier.wait(timeout=5)
                return key
            return cache.get_or_compute(key, compute)
        with ThreadPoolExecutor(2) as pool:
            self.assertEqual(list(pool.map(run, ['a', 'b'])), [('a', False), ('b', False)])

    def test_failure_wakes_waiter_and_allows_retry(self):
        cache = ReferenceAnalysisCache()
        started, release, waiting = Event(), Event(), Event()
        def fail():
            started.set()
            release.wait(timeout=5)
            raise ValueError('failed extraction')
        with ThreadPoolExecutor(2) as pool:
            owner = pool.submit(cache.get_or_compute, 'a', fail)
            self.assertTrue(started.wait(timeout=5))
            # Observe the waiter joining the existing future deterministically.
            future = cache._pending['a']
            original = future.result
            def result():
                waiting.set()
                return original()
            future.result = result
            waiter = pool.submit(cache.get_or_compute, 'a', lambda: 'unexpected')
            self.assertTrue(waiting.wait(timeout=5))
            release.set()
            for job in (owner, waiter):
                with self.assertRaises(ValueError):
                    job.result(timeout=5)
        self.assertEqual(cache.get_or_compute('a', lambda: 'retry'), ('retry', False))

    def test_lru_bounds_memory(self):
        cache = ReferenceAnalysisCache(2)
        for key in ['a', 'b', 'a', 'c']:
            cache.get_or_compute(key, lambda: key)
        self.assertEqual(list(cache._values), ['a', 'c'])
        self.assertEqual(cache.get_or_compute('b', lambda: 'b'), ('b', False))


if __name__ == '__main__':
    unittest.main()
