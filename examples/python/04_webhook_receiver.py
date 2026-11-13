"""A tiny NOVA webhook receiver (stdlib only) that verifies signatures.

Verification recipe:
  nova-signature = HMAC_SHA256(secret, "{nova-timestamp}.{nova-event-id}.{rawBody}")
  Reject anything whose timestamp is older/newer than 5 minutes, then compare
  digests in constant time. Make your handler idempotent on nova-event-id:
  deliveries are at-least-once.

Run:  NOVA_WEBHOOK_SECRET=whsec_... python 04_webhook_receiver.py
"""
import hashlib
import hmac
import json
import os
import time
from http.server import BaseHTTPRequestHandler, HTTPServer

SECRET = os.environ.get("NOVA_WEBHOOK_SECRET", "")
TOLERANCE_SECONDS = 300
PORT = int(os.environ.get("NOVA_WEBHOOK_PORT", "8787"))

SEEN_EVENT_IDS: dict[str, float] = {}


def verify(timestamp: str, event_id: str, raw_body: bytes, signature: str) -> bool:
    try:
        ts = int(timestamp)
    except (TypeError, ValueError):
        return False
    if abs(time.time() - ts) > TOLERANCE_SECONDS:
        return False
    expected = hmac.new(
        SECRET.encode(),
        f"{timestamp}.{event_id}.".encode() + raw_body,
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, signature or "")


class Handler(BaseHTTPRequestHandler):
    def do_POST(self) -> None:
        length = int(self.headers.get("content-length", "0"))
        raw_body = self.rfile.read(length)
        ok = verify(
            self.headers.get("nova-timestamp", ""),
            self.headers.get("nova-event-id", ""),
            raw_body,
            self.headers.get("nova-signature", ""),
        )
        if not ok:
            self.send_response(400)
            self.end_headers()
            return

        event = json.loads(raw_body)
        event_id = event.get("id", "")

        # At-least-once delivery: deduplicate by event id.
        if event_id in SEEN_EVENT_IDS:
            self.send_response(200)
            self.end_headers()
            return
        SEEN_EVENT_IDS[event_id] = time.time()

        print(f"event {event.get('type')} version={event.get('version')} "
              f"simulated={event.get('simulated')} data={event.get('data')}")
        self.send_response(200)
        self.end_headers()

    def log_message(self, *args) -> None:  # keep the console readable
        pass


if __name__ == "__main__":
    if not SECRET:
        raise SystemExit("Set NOVA_WEBHOOK_SECRET (whsec_...) in the environment.")
    # Local HTTP is fine for the example; production endpoints must be HTTPS on 443/8443.
    HTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
