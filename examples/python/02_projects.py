"""Cursor pagination and project creation via the NOVA API."""
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


def get(path: str, params=None) -> dict:
    response = session.get(f"{BASE_URL}{path}", params=params, timeout=10)
    response.raise_for_status()
    return response.json()


def list_all_projects():
    """Walk every page with the cursor protocol (at-least-once)."""
    cursor = None
    while True:
        params = {"limit": 50}
        if cursor:
            params["cursor"] = cursor
        page = get("/api/v1/projects", params)["data"]
        yield from page["items"]
        cursor = page.get("nextCursor")
        if not cursor:
            return


if __name__ == "__main__":
    for project in list_all_projects():
        print(project)

    # Share one of your AI projects with a workspace (projects:write scope).
    workspace_id = os.environ.get("NOVA_WORKSPACE_ID")
    ai_project_id = os.environ.get("NOVA_AI_PROJECT_ID")
    if workspace_id and ai_project_id:
        response = session.post(
            f"{BASE_URL}/api/v1/projects",
            json={"workspaceId": workspace_id, "aiProjectId": ai_project_id},
            timeout=10,
        )
        if response.status_code == 201:
            print(f"Shared: {response.json()['data']}")
        else:
            print(f"Rejected: {response.json()}")
    else:
        print("(set NOVA_WORKSPACE_ID and NOVA_AI_PROJECT_ID to create one)")

    # workspaces:read
    print(get("/api/v1/workspaces")["data"])
    _ = uuid.uuid4  # silence unused import in minimal installs
