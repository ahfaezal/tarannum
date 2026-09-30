"""Minimal, consent-aware Meta Conversions API client."""
from __future__ import annotations

import hashlib
import json
import logging
import os
import time
from urllib import error, parse, request


logger = logging.getLogger(__name__)


def _sha256(value: str) -> str:
    return hashlib.sha256(value.strip().lower().encode("utf-8")).hexdigest()


def send_purchase_event(*, event_id: str, email: str, phone: str, value: float) -> bool:
    """Send one paid conversion when CAPI is configured; never block payment processing."""
    pixel_id = os.getenv("META_PIXEL_ID", "").strip()
    access_token = os.getenv("META_CONVERSIONS_ACCESS_TOKEN", "").strip()
    if not pixel_id or not access_token:
        logger.info("Meta CAPI is not configured; Purchase %s was not sent", event_id)
        return False

    graph_version = os.getenv("META_GRAPH_API_VERSION", "v23.0").strip()
    endpoint = f"https://graph.facebook.com/{graph_version}/{pixel_id}/events"
    payload = {
        "data": [{
            "event_name": "Purchase",
            "event_time": int(time.time()),
            "event_id": event_id,
            "action_source": "website",
            "event_source_url": "https://tarannum.ai/kursus-profesional-azan/pembayaran",
            "user_data": {
                "em": [_sha256(email)],
                "ph": [_sha256(phone)],
            },
            "custom_data": {
                "currency": "MYR",
                "value": round(float(value), 2),
                "content_name": "Kursus Profesional Azan Maqam Hijjaz",
                "content_type": "product",
            },
        }],
        "access_token": access_token,
    }
    test_event_code = os.getenv("META_TEST_EVENT_CODE", "").strip()
    if test_event_code:
        payload["test_event_code"] = test_event_code

    req = request.Request(
        endpoint,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", "User-Agent": "Tarannum.ai/1.0"},
        method="POST",
    )
    try:
        with request.urlopen(req, timeout=8) as response:
            result = json.loads(response.read().decode("utf-8"))
        accepted = int(result.get("events_received", 0)) > 0
        if not accepted:
            logger.warning("Meta CAPI did not accept Purchase %s: %s", event_id, result)
        return accepted
    except (error.URLError, TimeoutError, ValueError, json.JSONDecodeError) as exc:
        logger.warning("Meta CAPI Purchase %s failed: %s", event_id, exc)
        return False
