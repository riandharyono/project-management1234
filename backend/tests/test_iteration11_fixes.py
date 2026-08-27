"""Iteration 11 focused checks: team-label creation is admin-only + smoke of core endpoints."""
import os
import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL missing")
BASE_URL = base_url.rstrip("/")

ADMIN = {"email": "admin@northstar.team", "password": "Northstar123!"}
MEMBER = {"email": "member1@northstar.team", "password": "Member123!"}


def login(creds):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=30)
    if r.status_code != 200:
        pytest.fail(f"login failed {creds['email']}: {r.status_code} {r.text[:300]}")
    return s


@pytest.fixture(scope="module")
def admin_client():
    return login(ADMIN)


@pytest.fixture(scope="module")
def member_client():
    return login(MEMBER)


@pytest.fixture(scope="module")
def team_id(admin_client):
    r = admin_client.get(f"{BASE_URL}/api/teams", timeout=30)
    assert r.status_code == 200, r.text
    teams = r.json()
    assert teams, "no teams for admin"
    t = next((x for x in teams if x["name"] == "Tim B"), teams[0])
    return t["id"]


@pytest.fixture(scope="module")
def created_label_ids():
    ids = []
    yield ids


@pytest.fixture(scope="module", autouse=True)
def cleanup(admin_client, created_label_ids):
    yield
    for lid in created_label_ids:
        admin_client.delete(f"{BASE_URL}/api/labels/{lid}", timeout=30)


# --- item 1: POST /api/teams/{id}/labels admin-only ---
class TestLabelPermission:
    def test_member_cannot_create_label(self, member_client, team_id):
        r = member_client.post(f"{BASE_URL}/api/teams/{team_id}/labels",
                               json={"name": "TEST_it11_member", "color": "#ff0000"}, timeout=30)
        assert r.status_code == 403, f"expected 403, got {r.status_code}: {r.text[:300]}"

    def test_member_role_is_member(self, member_client, team_id):
        r = member_client.get(f"{BASE_URL}/api/teams/{team_id}", timeout=30)
        assert r.status_code == 200
        assert r.json().get("my_role") == "member", r.json().get("my_role")

    def test_member_can_read_labels(self, member_client, team_id):
        r = member_client.get(f"{BASE_URL}/api/teams/{team_id}/labels", timeout=30)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_admin_can_create_and_delete_label(self, admin_client, team_id, created_label_ids):
        r = admin_client.post(f"{BASE_URL}/api/teams/{team_id}/labels",
                              json={"name": "TEST_it11_admin", "color": "#2563eb"}, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["name"] == "TEST_it11_admin"
        assert "_id" not in data
        created_label_ids.append(data["id"])
        # verify persistence
        g = admin_client.get(f"{BASE_URL}/api/teams/{team_id}/labels", timeout=30)
        assert any(l["id"] == data["id"] for l in g.json())
        # delete
        d = admin_client.delete(f"{BASE_URL}/api/labels/{data['id']}", timeout=30)
        assert d.status_code in (200, 204), d.text
        created_label_ids.remove(data["id"])
        g2 = admin_client.get(f"{BASE_URL}/api/teams/{team_id}/labels", timeout=30)
        assert not any(l["id"] == data["id"] for l in g2.json())

    def test_unauth_create_label_rejected(self, team_id):
        r = requests.post(f"{BASE_URL}/api/teams/{team_id}/labels",
                          json={"name": "TEST_it11_anon", "color": "#000000"}, timeout=30)
        assert r.status_code in (401, 403), r.status_code


# --- item 5: regression smoke on core read endpoints ---
class TestSmoke:
    @pytest.mark.parametrize("path", [
        "/api/auth/me",
        "/api/teams",
        "/api/notifications",
    ])
    def test_global_endpoints(self, admin_client, path):
        r = admin_client.get(f"{BASE_URL}{path}", timeout=30)
        assert r.status_code == 200, f"{path} -> {r.status_code} {r.text[:200]}"

    @pytest.mark.parametrize("suffix", [
        "lists", "tasks", "labels", "members", "announcements",
        "questions", "documents", "chat",
    ])
    def test_team_endpoints(self, admin_client, team_id, suffix):
        r = admin_client.get(f"{BASE_URL}/api/teams/{team_id}/{suffix}", timeout=30)
        assert r.status_code == 200, f"{suffix} -> {r.status_code} {r.text[:200]}"
        body = r.text
        assert '"_id"' not in body, f"{suffix} leaks _id"

    def test_chat_history_has_unique_ids(self, admin_client, team_id):
        r = admin_client.get(f"{BASE_URL}/api/teams/{team_id}/chat", timeout=30)
        assert r.status_code == 200
        ids = [m["id"] for m in r.json()]
        assert len(ids) == len(set(ids)), "duplicate message ids in chat history"
