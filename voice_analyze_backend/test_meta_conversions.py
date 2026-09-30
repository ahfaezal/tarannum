"""Unit checks for consent-safe Meta CAPI payloads."""
import hashlib
import json
import unittest
from unittest.mock import MagicMock, patch

import meta_conversions


class MetaConversionsTests(unittest.TestCase):
    def test_missing_credentials_disables_delivery(self):
        with patch.dict(meta_conversions.os.environ, {}, clear=True):
            self.assertFalse(meta_conversions.send_purchase_event(
                event_id="evt-1", email="person@example.com", phone="0123456789", value=200,
            ))

    def test_purchase_hashes_contact_data(self):
        response = MagicMock()
        response.__enter__.return_value.read.return_value = json.dumps({"events_received": 1}).encode()
        with patch.dict(meta_conversions.os.environ, {
            "META_PIXEL_ID": "123", "META_CONVERSIONS_ACCESS_TOKEN": "token",
        }), patch.object(meta_conversions.request, "urlopen", return_value=response) as urlopen:
            self.assertTrue(meta_conversions.send_purchase_event(
                event_id="evt-2", email="Person@Example.com", phone="0123456789", value=200,
            ))
        body = json.loads(urlopen.call_args.args[0].data.decode())
        event = body["data"][0]
        self.assertEqual(event["event_id"], "evt-2")
        self.assertEqual(event["user_data"]["em"], [hashlib.sha256(b"person@example.com").hexdigest()])
        self.assertNotIn("Person@Example.com", json.dumps(body))


if __name__ == "__main__":
    unittest.main()
