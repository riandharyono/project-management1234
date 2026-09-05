"""GET /api/me/tasks — assigned work across teams, grouped by due date."""
import os
from datetime import datetime, timezone, timedelta

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@northstar.team")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "Northstar123!")


@pytest.fixture
def admin():
    if not BASE_URL:
        pytest.skip("REACT_APP_BACKEND_URL not set")
    session = requests.Session()
    response = session.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    if response.status_code != 200:
        pytest.skip(f"admin login failed: {response.status_code}")
    return session


def test_me_tasks_shape_and_assignment(admin):
    me = admin.get(f"{BASE_URL}/api/auth/me").json()
    teams = admin.get(f"{BASE_URL}/api/teams").json()
    assert teams, "need at least one team"
    team = teams[0]
    lists = admin.get(f"{BASE_URL}/api/teams/{team['id']}/lists").json()
    todo = next(l for l in lists if not l.get("is_done") and not l.get("is_cancelled"))
    yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).date().isoformat()
    created = admin.post(f"{BASE_URL}/api/teams/{team['id']}/tasks", json={
        "title": "TEST_me_tasks_overdue",
        "list_id": todo["id"],
        "priority": "High",
        "due_date": yesterday,
        "assignees": [me["id"]],
    })
    assert created.status_code == 200, created.text
    task_id = created.json()["id"]
    try:
        mine = admin.get(f"{BASE_URL}/api/me/tasks")
        assert mine.status_code == 200, mine.text
        body = mine.json()
        for key in ("overdue", "today", "upcoming", "unscheduled", "mentions"):
            assert key in body
        assert any(t["id"] == task_id for t in body["overdue"])
        item = next(t for t in body["overdue"] if t["id"] == task_id)
        assert item["team_name"] == team["name"]
        assert item["list_name"] == todo["name"]
        assert item["is_done"] is False
    finally:
        admin.delete(f"{BASE_URL}/api/tasks/{task_id}")
