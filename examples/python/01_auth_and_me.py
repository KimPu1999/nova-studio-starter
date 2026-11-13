"""First authenticated NOVA API request: GET /api/v1/me."""
import os
import sys

import requests

BASE_URL = os.environ.get("NOVA_BASE_URL", "https://your-domain.example")
API_KEY = os.environ.get("NOVA_API_KEY")

if not API_KEY:
    sys.exit("Set NOVA_API_KEY (nova_sk_...) in the environment.")


def call(path: str, **kwargs) -> dict:
    response = requests.get(f"{BASE_URL}{path}", headers={"Authorization": f"Bearer {API_KEY}"}, timeout=10, **kwargs)
    # Every response carries an x-request-id header — include it in bug reports.
    request_id = response.headers.get("x-request-id", "-")
    if response.status_code == 429:
        retry_after = response.headers.get("Retry-After", "60")
        sys.exit(f"Rate limited. Retry after {retry_after}s (request {request_id}).")
    if not response.ok:
        error = response.json().get("error", {})
        sys.exit(f"{response.status_code} {error.get('code')}: {error.get('message')} (request {request_id})")
    return response.json()


if __name__ == "__main__":
    body = call("/api/v1/me")
    print(f"data:       {body['data']}")
    print(f"requestId:  {body['requestId']}")
