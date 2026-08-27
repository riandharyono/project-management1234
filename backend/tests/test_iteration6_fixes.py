"""Iteration 6 regression: nullable PATCH, is_private enforcement, list admin RBAC, search hardening."""
import os
import re
import uuid
from pathlib import Path

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
        pytest.fail(f"login failed for {creds['email']}: {r.status_code} {r.text[:300]}")
    body = r.json()
    tok = body.get("token") or body.get("access_token")
    if tok:
        s.headers.update({"Authorization": f"Bearer {tok}"})
    return s, body


@pytest.fixture(scope="module")
def admin_client():
    s, _ = make_client(ADMIN)
    return s


@pytest.fixture(scope="module")
def member_client():
    s, _ = make_client(MEMBER)
    return s


@pytest.fixture(scope="module")
def team_b(admin_client):
    r = admin_client.get(f"{BASE_URL}/teams", timeout=30)
    assert r.status_code == 200, r.text
    teams = r.json()
    team = next((t for t in teams if t["name"] == "Tim B"), None)
    assert team, f"Tim B not found in {[t['name'] for t in teams]}"
    return team


@pytest.fixture(scope="module")
def lists_b(admin_client, team_b):
    r = admin_client.get(f"{BASE_URL}/teams/{team_b['id']}/lists", timeout=30)
    assert r.status_code == 200, r.text
    assert len(r.json()) > 0
    return r.json()


@pytest.fixture(scope="module")
def created_tasks():
    ids = []
    yield ids


@pytest.fixture(scope="module", autouse=True)
def cleanup(admin_client, created_tasks):
    yield
    for tid in created_tasks:
        admin_client.delete(f"{BASE_URL}/tasks/{tid}", timeout=30)


# ---------- Auth / playbook basics ----------
class TestAuthBasics:
    def test_login_sets_httponly_cookie(self):
        s = requests.Session()
        r = s.post(f"{BASE_URL}/auth/login", json=ADMIN, timeout=30)
        assert r.status_code == 200
        raw = "; ".join(v for k, v in r.headers.items() if k.lower() == "set-cookie")
        assert raw, f"no Set-Cookie header: {dict(r.headers)}"
        assert "httponly" in raw.lower()

    def test_me_with_cookie_only(self):
        s = requests.Session()
        s.post(f"{BASE_URL}/auth/login", json=ADMIN, timeout=30)
        r = s.get(f"{BASE_URL}/auth/me", timeout=30)
        assert r.status_code == 200
        assert r.json()["email"] == ADMIN["email"]

    def test_bad_password_rejected(self):
        r = requests.post(f"{BASE_URL}/auth/login", json={"email": ADMIN["email"], "password": "wrong-x"}, timeout=30)
        assert r.status_code in (400, 401, 429)


# ---------- PATCH nullable fields ----------
class TestNullablePatch:
    def test_clear_due_date(self, admin_client, team_b, lists_b, created_tasks):
        r = admin_client.post(f"{BASE_URL}/teams/{team_b['id']}/tasks",
                              json={"title": "TEST_it6_cleardate", "list_id": lists_b[0]["id"]}, timeout=30)
        assert r.status_code in (200, 201), r.text
        tid = r.json()["id"]
        created_tasks.append(tid)

        r = admin_client.patch(f"{BASE_URL}/tasks/{tid}", json={"due_date": "2026-08-01"}, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json()["due_date"] == "2026-08-01"
        assert admin_client.get(f"{BASE_URL}/tasks/{tid}", timeout=30).json()["due_date"] == "2026-08-01"

        r = admin_client.patch(f"{BASE_URL}/tasks/{tid}", json={"due_date": None}, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json()["due_date"] is None, "due_date not cleared in PATCH response"
        got = admin_client.get(f"{BASE_URL}/tasks/{tid}", timeout=30).json()
        assert got["due_date"] is None, "due_date not cleared after GET"

    def test_partial_patch_does_not_wipe_other_fields(self, admin_client, team_b, lists_b, created_tasks):
        r = admin_client.post(f"{BASE_URL}/teams/{team_b['id']}/tasks",
                              json={"title": "TEST_it6_partial", "list_id": lists_b[0]["id"],
                                    "description": "keep me", "due_date": "2026-09-09"}, timeout=30)
        tid = r.json()["id"]
        created_tasks.append(tid)
        r = admin_client.patch(f"{BASE_URL}/tasks/{tid}", json={"title": "TEST_it6_partial_edit"}, timeout=30)
        assert r.status_code == 200
        got = admin_client.get(f"{BASE_URL}/tasks/{tid}", timeout=30).json()
        assert got["title"] == "TEST_it6_partial_edit"
        assert got["description"] == "keep me"
        assert got["due_date"] == "2026-09-09"


# ---------- is_private enforcement ----------
class TestPrivateTasks:
    def test_private_task_hidden_from_member(self, admin_client, member_client, team_b, lists_b, created_tasks):
        r = admin_client.post(f"{BASE_URL}/teams/{team_b['id']}/tasks",
                              json={"title": "TEST_it6_private", "list_id": lists_b[0]["id"]}, timeout=30)
        tid = r.json()["id"]
        created_tasks.append(tid)
        r = admin_client.patch(f"{BASE_URL}/tasks/{tid}", json={"is_private": True}, timeout=30)
        assert r.status_code == 200 and r.json()["is_private"] is True

        admin_titles = [t["title"] for t in admin_client.get(f"{BASE_URL}/teams/{team_b['id']}/tasks", timeout=30).json()]
        assert "TEST_it6_private" in admin_titles

        mr = member_client.get(f"{BASE_URL}/teams/{team_b['id']}/tasks", timeout=30)
        assert mr.status_code == 200
        assert "TEST_it6_private" not in [t["title"] for t in mr.json()], "private task leaked to member"

    def test_private_task_not_in_member_search(self, admin_client, member_client, team_b, lists_b, created_tasks):
        r = admin_client.post(f"{BASE_URL}/teams/{team_b['id']}/tasks",
                              json={"title": "TEST_it6_privsearch_zzq", "list_id": lists_b[0]["id"]}, timeout=30)
        tid = r.json()["id"]
        created_tasks.append(tid)
        admin_client.patch(f"{BASE_URL}/tasks/{tid}", json={"is_private": True}, timeout=30)
        r = member_client.get(f"{BASE_URL}/search", params={"q": "privsearch_zzq"}, timeout=30)
        assert r.status_code == 200
        assert r.json()["tasks"] == [], "private task exposed via search to member"

    def test_private_task_direct_get_blocked_for_member(self, admin_client, member_client, team_b, lists_b, created_tasks):
        r = admin_client.post(f"{BASE_URL}/teams/{team_b['id']}/tasks",
                              json={"title": "TEST_it6_privget", "list_id": lists_b[0]["id"]}, timeout=30)
        tid = r.json()["id"]
        created_tasks.append(tid)
        admin_client.patch(f"{BASE_URL}/tasks/{tid}", json={"is_private": True}, timeout=30)
        r = member_client.get(f"{BASE_URL}/tasks/{tid}", timeout=30)
        assert r.status_code in (403, 404), f"member can fetch private task directly: {r.status_code} {r.text[:200]}"


# ---------- list RBAC ----------
class TestListRBAC:
    def test_member_cannot_create_list(self, member_client, team_b):
        r = member_client.post(f"{BASE_URL}/teams/{team_b['id']}/lists", json={"name": "TEST_it6_memberlist"}, timeout=30)
        assert r.status_code == 403, f"expected 403, got {r.status_code} {r.text[:200]}"

    def test_member_cannot_delete_list(self, member_client, lists_b):
        r = member_client.delete(f"{BASE_URL}/lists/{lists_b[-1]['id']}", timeout=30)
        assert r.status_code == 403, f"expected 403, got {r.status_code}"

    def test_admin_can_create_and_delete_list(self, admin_client, team_b):
        r = admin_client.post(f"{BASE_URL}/teams/{team_b['id']}/lists", json={"name": "TEST_it6_adminlist"}, timeout=30)
        assert r.status_code in (200, 201), r.text
        lid = r.json()["id"]
        assert r.json()["name"] == "TEST_it6_adminlist"
        names = [l["name"] for l in admin_client.get(f"{BASE_URL}/teams/{team_b['id']}/lists", timeout=30).json()]
        assert "TEST_it6_adminlist" in names
        assert admin_client.delete(f"{BASE_URL}/lists/{lid}", timeout=30).status_code in (200, 204)
        names = [l["name"] for l in admin_client.get(f"{BASE_URL}/teams/{team_b['id']}/lists", timeout=30).json()]
        assert "TEST_it6_adminlist" not in names


# ---------- search hardening ----------
class TestSearchHardening:
    @pytest.mark.parametrize("q", ["a.*b(", "(((", "[a-", "*", ".*", "a{1000000}", "\\"])
    def test_regex_specials_do_not_crash(self, admin_client, q):
        r = admin_client.get(f"{BASE_URL}/search", params={"q": q}, timeout=30)
        assert r.status_code == 200, f"q={q!r} -> {r.status_code} {r.text[:200]}"
        assert isinstance(r.json()["tasks"], list)

    def test_empty_query_returns_nothing(self, admin_client):
        for q in ["", "   "]:
            r = admin_client.get(f"{BASE_URL}/search", params={"q": q}, timeout=30)
            assert r.status_code == 200
            assert r.json()["tasks"] == [], f"empty q returned results ({q!r})"

    def test_literal_match_still_works(self, admin_client, team_b, lists_b, created_tasks):
        title = f"TEST_it6_search_{uuid.uuid4().hex[:6]}"
        r = admin_client.post(f"{BASE_URL}/teams/{team_b['id']}/tasks",
                              json={"title": title, "list_id": lists_b[0]["id"]}, timeout=30)
        created_tasks.append(r.json()["id"])
        r = admin_client.get(f"{BASE_URL}/search", params={"q": title}, timeout=30)
        assert r.status_code == 200
        assert title in [t["title"] for t in r.json()["tasks"]]


# ---------- notification payloads used by frontend routing ----------
class TestNotificationRouting:
    def test_announcement_notification_has_team_and_type(self, admin_client, member_client, team_b):
        text = f"TEST_it6_ann_{uuid.uuid4().hex[:6]}"
        r = admin_client.post(f"{BASE_URL}/teams/{team_b['id']}/announcements",
                              json={"title": text, "body": "isi pengumuman"}, timeout=30)
        assert r.status_code in (200, 201), r.text
        r = member_client.get(f"{BASE_URL}/notifications", timeout=30)
        assert r.status_code == 200
        n = next((x for x in r.json()["items"] if text in x.get("text", "")), None)
        assert n, "member did not receive announcement notification"
        assert n.get("team_id") == team_b["id"]
        assert n.get("type") in ("announcement", "pengumuman"), n.get("type")

    def test_mention_notification_has_task_id(self, admin_client, member_client, team_b, lists_b, created_tasks):
        m = member_client.get(f"{BASE_URL}/auth/me", timeout=30).json()
        r = admin_client.post(f"{BASE_URL}/teams/{team_b['id']}/tasks",
                              json={"title": "TEST_it6_mention", "list_id": lists_b[0]["id"]}, timeout=30)
        tid = r.json()["id"]
        created_tasks.append(tid)
        r = admin_client.post(f"{BASE_URL}/tasks/{tid}/comments",
                              json={"body": f"halo @{m['name']} lihat ini", "mentions": [m["id"]]}, timeout=30)
        assert r.status_code in (200, 201), r.text
        notifs = member_client.get(f"{BASE_URL}/notifications", timeout=30).json()["items"]
        n = next((x for x in notifs if x.get("task_id") == tid), None)
        assert n, "no mention notification with task_id"
        assert n.get("team_id") == team_b["id"]


# ---------- brute force lockout (playbook) ----------
class TestBruteForceLockout:
    def test_lockout_after_five_failures(self):
        email = f"TEST_it6_lock_{uuid.uuid4().hex[:8]}@example.com"
        codes = []
        for _ in range(6):
            r = requests.post(f"{BASE_URL}/auth/login", json={"email": email, "password": "wrongpass1"}, timeout=30)
            codes.append(r.status_code)
        print("codes:", codes)
        assert codes[:4] == [401, 401, 401, 401], codes
        assert 429 in codes[4:], f"no lockout after 5 failures: {codes}"

    def test_admin_login_still_works_after_lockout_of_other_identifier(self):
        r = requests.post(f"{BASE_URL}/auth/login", json=ADMIN, timeout=30)
        assert r.status_code == 200
