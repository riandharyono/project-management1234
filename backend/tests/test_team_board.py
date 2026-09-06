"""GET /api/teams/{id}/board — single-request team bootstrap."""
import os
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


def test_board_shape(admin):
    teams = admin.get(f"{BASE_URL}/api/teams").json()
    assert teams, "need at least one team"
    team = teams[0]
    r = admin.get(f"{BASE_URL}/api/teams/{team['id']}/board")
    assert r.status_code == 200, r.text
    body = r.json()
    for key in ("lists", "tasks", "members", "labels"):
        assert key in body
        assert isinstance(body[key], list)
    assert any(not l.get("archived") for l in body["lists"])
    lists = admin.get(f"{BASE_URL}/api/teams/{team['id']}/lists").json()
    tasks = admin.get(f"{BASE_URL}/api/teams/{team['id']}/tasks").json()
    members = admin.get(f"{BASE_URL}/api/teams/{team['id']}/members").json()
    labels = admin.get(f"{BASE_URL}/api/teams/{team['id']}/labels").json()
    assert len(body["lists"]) == len(lists)
    assert len(body["tasks"]) == len(tasks)
    assert len(body["members"]) == len(members)
    assert len(body["labels"]) == len(labels)


def test_board_requires_auth():
    if not BASE_URL:
        pytest.skip("REACT_APP_BACKEND_URL not set")
    r = requests.get(f"{BASE_URL}/api/teams/nope/board")
    assert r.status_code in (401, 403)
