from datetime import datetime, timezone
import unittest

from kids_access_service import access_window, daily_access_response


class KidsAccessServiceTests(unittest.TestCase):
    def test_grants_access_after_60_minutes_during_daily_window(self):
        window = access_window(datetime(2026, 9, 24, 4, 0, tzinfo=timezone.utc))  # 12:00 MYT
        result = daily_access_response(3600.9, window)
        self.assertTrue(result["unlockGranted"])
        self.assertEqual(result["creditedSeconds"], 3600)
        self.assertTrue(result["unlockExpiresAt"].endswith("+08:00"))

    def test_denies_access_before_target_and_after_bedtime(self):
        daytime = access_window(datetime(2026, 9, 24, 4, 0, tzinfo=timezone.utc))
        bedtime = access_window(datetime(2026, 9, 24, 16, 0, tzinfo=timezone.utc))  # 00:00 MYT
        self.assertFalse(daily_access_response(3599, daytime)["unlockGranted"])
        self.assertFalse(daily_access_response(7200, bedtime)["unlockGranted"])


if __name__ == "__main__":
    unittest.main()
