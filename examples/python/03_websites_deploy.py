"""Queue a website deployment with the mandatory Idempotency-Key header."""
import os
import sys
import uuid

import requests

BASE_URL = os.environ.get("NOVA_BASE_URL", "https://your-domain.example")
API_KEY = os.environ.get("NOVA_API_KEY")

if not API_KEY:
    sys.exit("Set NOVA_API_KEY in the environment.")

session = requests.Session()
session.headers["Authorization"] = f"Bearer {API_KEY}"


def main() -> None:
    websites = session.get(f"{BASE_URL}/api/v1/websites", timeout=10).json()["data"]
    if not websites:
        sys.exit("No hosted websites for this credential's owner.")
    for site in websites:
        print(f"{site['id']}  {site['name']}  ({site['status']})")

    website_id = os.environ.get("NOVA_WEBSITE_ID") or websites[0]["id"]

    # The idempotency key must be stable across retries of the SAME logical
    # request and unique across different requests. Generate once, persist it.
    idempotency_key = os.environ.get("NOVA_IDEMPOTENCY_KEY") or f"deploy-{website_id[:8]}-{uuid.uuid4()}"

    response = session.post(
        f"{BASE_URL}/api/v1/deployments",
        json={"websiteId": website_id},
        headers={"Idempotency-Key": idempotency_key},
        timeout=10,
    )

    if response.status_code == 409:
        print("409: IDEMPOTENCY_CONFLICT (key reused with different payload) or RESOURCE_LOCKED (still in flight).")
    elif response.status_code == 201:
        deployment = response.json()["data"]
        print(f"Queued deployment #{deployment['number']} ({deployment['id']})")
        detail = session.get(f"{BASE_URL}/api/v1/deployments/{deployment['id']}", timeout=10).json()
        print(f"Status now: {detail['data']['status']}")
    else:
        print(response.json())

    # Safe to re-run: the same key replays the stored response for 24 hours.
    replay = session.post(
        f"{BASE_URL}/api/v1/deployments",
        json={"websiteId": website_id},
        headers={"Idempotency-Key": idempotency_key},
        timeout=10,
    )
    print(f"Replay status: {replay.status_code}")


if __name__ == "__main__":
    main()
