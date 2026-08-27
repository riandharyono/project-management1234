"""Iteration 10 fix-verification tests.

Covers:
- GET /api/notifications skip/limit validation bounds (422)
- GET /api/teams/{id}/chat limit query param bounds
- lists is_done field present / migration
- member1 team_role == 'member' and 403 on admin-only actions
- task complete toggle bidirectional via PATCH list_id
"""
import os
import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL missing")
BASE_URL = base_url.rstrip("/") + "/api"

ADMIN = {"email": "admin@northstar.team", "password": "Northstar123!"}
MEMBER = {"email": "member1@northstar.team", "password": "Member123!"}


def make_client(creds):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/auth/login", json=creds, timeout=30)
    if r.status_code != 200:
        pytest.fail(f"Login failed for {creds['email']}: {r.status_code} {r.text[:300]}")
    return s


@pytest.fixture(scope="module")
def admin_client():
    return make_client(ADMIN)


@pytest.fixture(scope="module")
def member_client():
    return make_client(MEMBER)


@pytest.fixture(scope="module")
def team(admin_client):
    r = admin_client.get(f"{BASE_URL}/teams", timeout=30)
    assert r.status_code == 200
    teams = r.json()
    assert teams, "No teams found"
    return teams[0]


# ---------- item 4: notifications validation ----------
class TestNotificationValidation:
    def test_default_ok(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/notifications", timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert "items" in d and "unread" in d and "has_more" in d
        assert isinstance(d["items"], list)
        assert len(d["items"]) <= 20
        for it in d["items"]:
            assert "_id" not in it

    def test_limit_over_max_422(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/notifications", params={"limit": 999}, timeout=30)
        assert r.status_code == 422, r.text[:300]

    def test_limit_zero_422(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/notifications", params={"limit": 0}, timeout=30)
        assert r.status_code == 422

    def test_negative_skip_422(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/notifications", params={"skip": -5}, timeout=30)
        assert r.status_code == 422

    def test_limit_100_boundary_ok(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/notifications", params={"limit": 100}, timeout=30)
        assert r.status_code == 200
        assert len(r.json()["items"]) <= 100


# ---------- item 4: chat limit param ----------
class TestChatLimit:
    def test_chat_default(self, admin_client, team):
        r = admin_client.get(f"{BASE_URL}/teams/{team['id']}/chat", timeout=30)
        assert r.status_code == 200
        assert isinstance(r.json(), list)
        assert len(r.json()) <= 200

    def test_chat_limit_respected(self, admin_client, team):
        r = admin_client.get(f"{BASE_URL}/teams/{team['id']}/chat", params={"limit": 2}, timeout=30)
        assert r.status_code == 200
        assert len(r.json()) <= 2

    def test_chat_limit_over_max_422(self, admin_client, team):
        r = admin_client.get(f"{BASE_URL}/teams/{team['id']}/chat", params={"limit": 5000}, timeout=30)
        assert r.status_code == 422

    def test_chat_limit_zero_422(self, admin_client, team):
        r = admin_client.get(f"{BASE_URL}/teams/{team['id']}/chat", params={"limit": 0}, timeout=30)
        assert r.status_code == 422


# ---------- lists is_done field ----------
class TestListsIsDone:
    def test_lists_have_is_done(self, admin_client, team):
        r = admin_client.get(f"{BASE_URL}/teams/{team['id']}/lists", timeout=30)
        assert r.status_code == 200
        lists = r.json()
        assert lists
        for l in lists:
            assert "is_done" in l, f"list {l['name']} missing is_done"
            assert isinstance(l["is_done"], bool)
        done = [l for l in lists if l["is_done"]]
        assert len(done) >= 1, "no list flagged is_done"

    def test_new_list_defaults_false(self, admin_client, team):
        r = admin_client.post(f"{BASE_URL}/teams/{team['id']}/lists", json={"name": "TEST_isdone_list"}, timeout=30)
        assert r.status_code in (200, 201), r.text[:300]
        lid = r.json()["id"]
        assert r.json()["is_done"] is False
        try:
            g = admin_client.get(f"{BASE_URL}/teams/{team['id']}/lists", timeout=30).json()
            found = [l for l in g if l["id"] == lid]
            assert found and found[0]["is_done"] is False
        finally:
            admin_client.delete(f"{BASE_URL}/lists/{lid}", timeout=30)


# ---------- item 6: member1 role enforcement ----------
class TestMemberRole:
    def test_member1_is_member(self, admin_client, team):
        r = admin_client.get(f"{BASE_URL}/teams/{team['id']}/members", timeout=30)
        assert r.status_code == 200
        m = [x for x in r.json() if x["email"] == MEMBER["email"]]
        assert m, "member1 not in team members"
        assert m[0]["team_role"] == "member", f"expected member, got {m[0]['team_role']}"

    def test_member_my_role(self, member_client, team):
        r = member_client.get(f"{BASE_URL}/teams", timeout=30)
        assert r.status_code == 200
        t = [x for x in r.json() if x["id"] == team["id"]]
        assert t and t[0]["my_role"] == "member"

    def test_member_cannot_create_list(self, member_client, team):
        r = member_client.post(f"{BASE_URL}/teams/{team['id']}/lists", json={"name": "TEST_member_list"}, timeout=30)
        assert r.status_code == 403, r.text[:300]

    def test_member_cannot_rename_or_delete_list(self, member_client, admin_client, team):
        lists = admin_client.get(f"{BASE_URL}/teams/{team['id']}/lists", timeout=30).json()
        lid = lists[0]["id"]
        r = member_client.patch(f"{BASE_URL}/lists/{lid}", json={"name": "TEST_renamed"}, timeout=30)
        assert r.status_code == 403
        r2 = member_client.delete(f"{BASE_URL}/lists/{lid}", timeout=30)
        assert r2.status_code == 403
        r3 = member_client.patch(f"{BASE_URL}/lists/{lid}", json={"archived": True}, timeout=30)
        assert r3.status_code == 403

    def test_member_create_team_label_permission(self, member_client, admin_client, team):
        """Review request expects 403; backend uses require_member for POST labels.
        Documented here as an observed behaviour mismatch (reported, not masked)."""
        r = member_client.post(f"{BASE_URL}/teams/{team['id']}/labels", json={"name": "TEST_lbl", "color": "#ff0000"}, timeout=30)
        if r.status_code == 200:
            admin_client.delete(f"{BASE_URL}/labels/{r.json()['id']}", timeout=30)
        assert r.status_code == 403, (
            "MISMATCH: POST /teams/{id}/labels uses require_member, so a regular member CAN "
            "create team labels. Review request states this should be admin-only (403)."
        )

    def test_member_cannot_delete_team_label(self, member_client, admin_client, team):
        c = admin_client.post(f"{BASE_URL}/teams/{team['id']}/labels", json={"name": "TEST_lbl_del", "color": "#00ff00"}, timeout=30)
        assert c.status_code in (200, 201), c.text[:300]
        lid = c.json()["id"]
        try:
            r = member_client.delete(f"{BASE_URL}/labels/{lid}", timeout=30)
            assert r.status_code == 403
            r2 = member_client.patch(f"{BASE_URL}/labels/{lid}", json={"name": "TEST_x"}, timeout=30)
            assert r2.status_code == 403
        finally:
            admin_client.delete(f"{BASE_URL}/labels/{lid}", timeout=30)

    def test_member_cannot_reorder_lists(self, member_client, admin_client, team):
        # UI reorder = PATCH /lists/{id} {order}
        lists = admin_client.get(f"{BASE_URL}/teams/{team['id']}/lists", timeout=30).json()
        r = member_client.patch(f"{BASE_URL}/lists/{lists[0]['id']}", json={"order": 99}, timeout=30)
        assert r.status_code == 403, f"member was allowed to reorder: {r.status_code} {r.text[:200]}"


# ---------- item 2: bidirectional complete toggle (data level) ----------
class TestCompleteToggle:
    def test_task_moves_to_done_and_back(self, admin_client, team):
        lists = admin_client.get(f"{BASE_URL}/teams/{team['id']}/lists", timeout=30).json()
        done_list = next(l for l in lists if l["is_done"])
        first_open = next(l for l in lists if not l["is_done"])

        c = admin_client.post(f"{BASE_URL}/teams/{team['id']}/tasks",
                              json={"title": "TEST_toggle_task", "list_id": first_open["id"]}, timeout=30)
        assert c.status_code in (200, 201), c.text[:300]
        tid = c.json()["id"]
        try:
            r = admin_client.patch(f"{BASE_URL}/tasks/{tid}", json={"list_id": done_list["id"]}, timeout=30)
            assert r.status_code == 200
            g = admin_client.get(f"{BASE_URL}/tasks/{tid}", timeout=30).json()
            assert g["list_id"] == done_list["id"]

            r2 = admin_client.patch(f"{BASE_URL}/tasks/{tid}", json={"list_id": first_open["id"]}, timeout=30)
            assert r2.status_code == 200
            g2 = admin_client.get(f"{BASE_URL}/tasks/{tid}", timeout=30).json()
            assert g2["list_id"] == first_open["id"]
        finally:
            admin_client.delete(f"{BASE_URL}/tasks/{tid}", timeout=30)


# ---------- core regression smoke ----------
class TestRegressionSmoke:
    @pytest.mark.parametrize("path", [
        "/teams", "/notifications", "/auth/me",
    ])
    def test_global_endpoints(self, admin_client, path):
        r = admin_client.get(f"{BASE_URL}{path}", timeout=30)
        assert r.status_code == 200, r.text[:200]

    @pytest.mark.parametrize("sub", [
        "lists", "tasks", "members", "labels", "announcements", "questions", "documents", "chat",
    ])
    def test_team_endpoints(self, admin_client, team, sub):
        r = admin_client.get(f"{BASE_URL}/teams/{team['id']}/{sub}", timeout=30)
        assert r.status_code == 200, f"{sub}: {r.status_code} {r.text[:200]}"
        body = r.json()
        items = body if isinstance(body, list) else body.get("items", [])
        for it in items if isinstance(items, list) else []:
            if isinstance(it, dict):
                assert "_id" not in it

    def test_search(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/search", params={"q": "a"}, timeout=30)
        assert r.status_code == 200
        assert "tasks" in r.json()

    def test_unauthenticated_blocked(self):
        r = requests.get(f"{BASE_URL}/teams", timeout=30)
        assert r.status_code in (401, 403)
