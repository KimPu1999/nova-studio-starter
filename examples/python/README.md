# NOVA API v1 — Python examples

Minimal, dependency-light examples for the NOVA Studio public API. Everything
reads configuration from environment variables — **never hard-code keys**.

```bash
export NOVA_BASE_URL="https://your-domain.example"
export NOVA_API_KEY="nova_sk_..."        # personal/workspace API key
# or, for sandbox-only scripts:
export NOVA_SANDBOX_KEY="nova_sb_..."
export NOVA_WEBHOOK_SECRET="whsec_..."   # for the webhook receiver
pip install -r requirements.txt
```

## Scripts

| Script | What it shows |
| --- | --- |
| `01_auth_and_me.py` | First authenticated call (`GET /api/v1/me`) and the response envelope. |
| `02_projects.py` | Cursor pagination (`limit`/`cursor`) and creating (sharing) a project. |
| `03_websites_deploy.py` | Listing websites and queueing a deployment with a required `Idempotency-Key`. |
| `04_webhook_receiver.py` | A tiny stdlib HTTP receiver that verifies `nova-signature` (HMAC-SHA256) and the 5-minute replay window. |

## Notes

- Sandbox keys (`nova_sb_…`) may only call `/api/v1/sandbox/*` endpoints.
- 429 responses carry a `Retry-After` header — honor it.
- The `Idempotency-Key` on `POST /api/v1/deployments` is bound to the request
  payload; reuse it freely on retries, never across different requests.
- Webhook deliveries are at-least-once: make handlers idempotent by `nova-event-id`.
