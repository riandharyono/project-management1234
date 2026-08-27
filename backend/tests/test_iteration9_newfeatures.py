"""Iteration 9 backend tests: chat reactions, notification pagination,
label cascade rename/delete, team progress data, light iteration_8 regression."""
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
BASE_URL = base_url.rstrip("/")
API = BASE_URL + "/api"

CRED_PATH = Path("/app/memory/test_credentials.md")


def _creds():
    content = CRED_PATH.read_text(encoding="utf-8")
    emails = re.findall(r"(?im)^-\s*Email:\s*(\S+)", content)
    passwords = re.findall(r"(?im)^-\s*Password:\s*(\S+)", content)
    return list(zip(emails, passwords))


@pytest.fixture(scope="session")
def creds():
    pairs = _creds()
    if len(pairs) < 2:
        pytest.skip("need 2 accounts in test_credentials.md")
    return {"admin": pairs[0], "member": pairs[1]}


def _login(email, password):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    if r.status_code != 200:
        pytest.fail(f"login failed for {email}: {r.status_code} {r.text[:300]}")
    assert "access_token" in s.cookies, "httpOnly access_token cookie not set"
    return s


@pytest.fixture(scope="session")
def admin(creds):
    return _login(*creds["admin"])


@pytest.fixture(scope="session")
def member(creds):
    return _login(*creds["member"])


@pytest.fixture(scope="session")
def team(admin):
    r = admin.get(f"{API}/teams", timeout=30)
    assert r.status_code == 200, r.text
    teams = r.json()
    assert teams, "no teams found"
    return teams[0]


@pytest.fixture(scope="session")
def lists(admin, team):
    r = admin.get(f"{API}/teams/{team['id']}/lists", timeout=30)
    assert r.status_code == 200
    return r.json()


@pytest.fixture(scope="session")
def plain_member(admin, team):
    """member1@northstar.team is a TEAM ADMIN of Tim B, so a fresh non-admin member is
    registered for permission (403) checks and removed afterwards."""
    email = f"test_plain_{uuid.uuid4().hex[:8]}@example.com"
    pwd = "PlainMember123!"
    s = requests.Session()
    r = s.post(f"{API}/auth/register", json={"email": email, "password": pwd}, timeout=30)
    assert r.status_code in (200, 201), r.text
    uid = s.get(f"{API}/auth/me", timeout=30).json()["id"]
    r = admin.post(f"{API}/teams/{team['id']}/members", json={"user_id": uid}, timeout=30)
    assert r.status_code == 200, r.text
    yield s
    admin.delete(f"{API}/teams/{team['id']}/members/{uid}", timeout=30)


@pytest.fixture(scope="session")
def me_admin(admin):
    return admin.get(f"{API}/auth/me", timeout=30).json()


@pytest.fixture(scope="session")
def me_member(member):
    return member.get(f"{API}/auth/me", timeout=30).json()


# ---------------- Feature: auth / playbook basics ----------------
class TestAuthBasics:
    def test_bcrypt_and_cookie(self, creds):
        s = _login(*creds["admin"])
        me = s.get(f"{API}/auth/me", timeout=30)
        assert me.status_code == 200
        data = me.json()
        assert "password_hash" not in data
        assert data["email"] == creds["admin"][0]

    def test_no_token_rejected(self):
        r = requests.get(f"{API}/notifications", timeout=30)
        assert r.status_code == 401

    def test_bcrypt_hash_format_in_db(self):
        import asyncio
        from dotenv import load_dotenv
        from motor.motor_asyncio import AsyncIOMotorClient
        load_dotenv("/app/backend/.env")

        async def check():
            db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
            u = await db.users.find_one({"email": "admin@northstar.team"})
            return u["password_hash"]

        h = asyncio.run(check())
        assert h.startswith("$2b$"), f"unexpected hash prefix: {h[:4]}"

    def test_brute_force_lockout(self):
        email = f"test_lockout_{uuid.uuid4().hex[:8]}@example.com"
        codes = []
        for _ in range(6):
            r = requests.post(f"{API}/auth/login", json={"email": email, "password": "WrongPass123!"}, timeout=30)
            codes.append(r.status_code)
        assert codes[:5] == [401] * 5, codes
        assert codes[5] == 429, f"expected lockout 429 on 6th attempt, got {codes}"

    def test_cors_credentials_explicit_origin(self):
        r = requests.options(f"{API}/notifications", headers={
            "Origin": BASE_URL, "Access-Control-Request-Method": "GET"}, timeout=30)
        assert r.status_code in (200, 204), r.status_code
        assert r.headers.get("Access-Control-Allow-Origin") in (BASE_URL, "*")
        # credentials must be allowed for cookie auth
        if r.headers.get("Access-Control-Allow-Origin") == BASE_URL:
            assert r.headers.get("Access-Control-Allow-Credentials") == "true"


# ---------------- Feature 2: chat emoji reactions ----------------
class TestChatReactions:
    def test_reaction_add_toggle_aggregate_persist(self, admin, member, team, me_admin, me_member):
        body = f"TEST_reaction_msg_{uuid.uuid4().hex[:6]}"
        r = admin.post(f"{API}/teams/{team['id']}/chat", json={"body": body, "mentions": []}, timeout=30)
        assert r.status_code == 200, r.text
        msg = r.json()
        assert msg["reactions"] == {}
        mid = msg["id"]

        # admin adds 👍
        r = admin.post(f"{API}/chat/{mid}/react", json={"emoji": "👍"}, timeout=30)
        assert r.status_code == 200, r.text
        payload = r.json()
        assert payload["type"] == "reaction" and payload["message_id"] == mid
        assert payload["reactions"]["👍"] == [me_admin["id"]]

        # member adds same emoji -> aggregate 2
        r = member.post(f"{API}/chat/{mid}/react", json={"emoji": "👍"}, timeout=30)
        assert r.status_code == 200, r.text
        assert sorted(r.json()["reactions"]["👍"]) == sorted([me_admin["id"], me_member["id"]])

        # member adds different emoji
        r = member.post(f"{API}/chat/{mid}/react", json={"emoji": "🎉"}, timeout=30)
        assert r.json()["reactions"]["🎉"] == [me_member["id"]]

        # persistence via GET
        msgs = admin.get(f"{API}/teams/{team['id']}/chat", timeout=30).json()
        stored = [m for m in msgs if m["id"] == mid][0]
        assert len(stored["reactions"]["👍"]) == 2
        assert stored["reactions"]["🎉"] == [me_member["id"]]

        # toggle off own reaction
        r = admin.post(f"{API}/chat/{mid}/react", json={"emoji": "👍"}, timeout=30)
        assert r.json()["reactions"]["👍"] == [me_member["id"]]
        r = member.post(f"{API}/chat/{mid}/react", json={"emoji": "👍"}, timeout=30)
        assert "👍" not in r.json()["reactions"], "emoji key should be removed when empty"

        msgs = admin.get(f"{API}/teams/{team['id']}/chat", timeout=30).json()
        stored = [m for m in msgs if m["id"] == mid][0]
        assert "👍" not in stored["reactions"]

    def test_reaction_invalid_message(self, admin):
        r = admin.post(f"{API}/chat/{uuid.uuid4()}/react", json={"emoji": "👍"}, timeout=30)
        assert r.status_code == 404

    def test_reaction_empty_emoji_rejected(self, admin, team):
        msg = admin.post(f"{API}/teams/{team['id']}/chat", json={"body": "TEST_empty_emoji", "mentions": []}, timeout=30).json()
        r = admin.post(f"{API}/chat/{msg['id']}/react", json={"emoji": ""}, timeout=30)
        assert r.status_code == 422

    def test_reaction_unauthenticated(self, admin, team):
        msg = admin.post(f"{API}/teams/{team['id']}/chat", json={"body": "TEST_unauth_react", "mentions": []}, timeout=30).json()
        r = requests.post(f"{API}/chat/{msg['id']}/react", json={"emoji": "👍"}, timeout=30)
        assert r.status_code == 401


# ---------------- Feature 3: notification pagination ----------------
class TestNotificationPagination:
    def test_shape_and_pagination(self, admin, member, team, me_admin):
        # generate 25 notifications for admin via announcements posted by member
        for i in range(25):
            r = member.post(f"{API}/teams/{team['id']}/announcements",
                            json={"title": f"TEST_notif_{i}_{uuid.uuid4().hex[:4]}", "body": "seed"}, timeout=30)
            assert r.status_code == 200, r.text

        r = admin.get(f"{API}/notifications", timeout=30)
        assert r.status_code == 200
        data = r.json()
        for key in ("items", "unread", "has_more"):
            assert key in data, f"missing key {key}"
        assert len(data["items"]) == 20, f"default limit should be 20, got {len(data['items'])}"
        assert data["has_more"] is True
        assert data["unread"] >= 25
        first_page_ids = [n["id"] for n in data["items"]]
        assert all("_id" not in n for n in data["items"])

        # descending order check
        stamps = [n["created_at"] for n in data["items"]]
        assert stamps == sorted(stamps, reverse=True), "notifications not sorted newest first"

        # page 2
        r2 = admin.get(f"{API}/notifications", params={"skip": 20, "limit": 20}, timeout=30)
        assert r2.status_code == 200
        page2 = r2.json()
        assert page2["items"], "second page empty"
        assert not set(n["id"] for n in page2["items"]) & set(first_page_ids), "pages overlap"

    def test_mark_read_and_read_all(self, admin):
        data = admin.get(f"{API}/notifications", timeout=30).json()
        assert data["items"]
        target = next((n for n in data["items"] if not n["read"]), None)
        assert target, "no unread notification to test"
        unread_before = data["unread"]
        r = admin.patch(f"{API}/notifications/{target['id']}/read", timeout=30)
        assert r.status_code == 200
        after = admin.get(f"{API}/notifications", timeout=30).json()
        assert after["unread"] == unread_before - 1
        got = next(n for n in after["items"] if n["id"] == target["id"])
        assert got["read"] is True

        r = admin.patch(f"{API}/notifications/read-all", timeout=30)
        assert r.status_code == 200
        after = admin.get(f"{API}/notifications", timeout=30).json()
        assert after["unread"] == 0
        assert all(n["read"] for n in after["items"])

    def test_custom_limit(self, admin):
        r = admin.get(f"{API}/notifications", params={"skip": 0, "limit": 5}, timeout=30)
        assert r.status_code == 200
        assert len(r.json()["items"]) <= 5


# ---------------- Feature 4: shared label cascade rename/delete ----------------
class TestLabelCascade:
    def test_rename_recolor_and_cascade_delete(self, admin, team, lists):
        tid = team["id"]
        lname = f"TEST_label_{uuid.uuid4().hex[:6]}"
        r = admin.post(f"{API}/teams/{tid}/labels", json={"name": lname, "color": "#ff0000"}, timeout=30)
        assert r.status_code == 200, r.text
        label = r.json()
        label_id = label["id"]

        # reuse: same name+color returns same label (registry dedupe)
        r = admin.post(f"{API}/teams/{tid}/labels", json={"name": lname, "color": "#ff0000"}, timeout=30)
        assert r.json()["id"] == label_id, "duplicate label created instead of reuse"

        task_ids = []
        for i in range(2):
            r = admin.post(f"{API}/teams/{tid}/tasks", json={
                "title": f"TEST_labeltask_{i}_{uuid.uuid4().hex[:4]}",
                "list_id": lists[0]["id"], "labels": [label_id]}, timeout=30)
            assert r.status_code == 200, r.text
            t = r.json()
            assert t["labels"] == [label_id], "task should reference label by id"
            task_ids.append(t["id"])

        # rename + recolor
        r = admin.patch(f"{API}/labels/{label_id}", json={"name": lname + "_ren", "color": "#00aa00"}, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json()["name"] == lname + "_ren" and r.json()["color"] == "#00aa00"

        labels = admin.get(f"{API}/teams/{tid}/labels", timeout=30).json()
        got = next(l for l in labels if l["id"] == label_id)
        assert got["name"] == lname + "_ren"

        # tasks still reference by id (no task update needed)
        tasks = admin.get(f"{API}/teams/{tid}/tasks", timeout=30).json()
        for t in [x for x in tasks if x["id"] in task_ids]:
            assert label_id in t["labels"]

        # cascade delete
        r = admin.delete(f"{API}/labels/{label_id}", timeout=30)
        assert r.status_code == 200, r.text
        labels = admin.get(f"{API}/teams/{tid}/labels", timeout=30).json()
        assert label_id not in [l["id"] for l in labels]
        tasks = admin.get(f"{API}/teams/{tid}/tasks", timeout=30).json()
        for t in [x for x in tasks if x["id"] in task_ids]:
            assert label_id not in (t.get("labels") or []), "label_id not pulled from task"

        for t in task_ids:
            admin.delete(f"{API}/tasks/{t}", timeout=30)

    def test_member_cannot_patch_or_delete_label(self, admin, plain_member, team):
        lname = f"TEST_label_perm_{uuid.uuid4().hex[:6]}"
        label = admin.post(f"{API}/teams/{team['id']}/labels", json={"name": lname, "color": "#123456"}, timeout=30).json()
        member = plain_member
        r = member.patch(f"{API}/labels/{label['id']}", json={"name": "hack"}, timeout=30)
        assert r.status_code == 403, f"member allowed to rename label: {r.status_code}"
        r = member.delete(f"{API}/labels/{label['id']}", timeout=30)
        assert r.status_code == 403
        admin.delete(f"{API}/labels/{label['id']}", timeout=30)

    def test_patch_delete_missing_label(self, admin):
        assert admin.patch(f"{API}/labels/{uuid.uuid4()}", json={"name": "x"}, timeout=30).status_code == 404
        assert admin.delete(f"{API}/labels/{uuid.uuid4()}", timeout=30).status_code == 404


# ---------------- Feature 1: team progress data source ----------------
class TestTeamProgressData:
    def test_done_count_matches_selesai_list(self, admin, team, lists):
        tid = team["id"]
        selesai = next((l for l in lists if l["name"] == "Selesai"), None)
        assert selesai, "no 'Selesai' list"
        todo = lists[0]

        tasks = admin.get(f"{API}/teams/{tid}/tasks", timeout=30).json()
        base_total = len(tasks)
        base_done = len([t for t in tasks if t["list_id"] == selesai["id"]])

        t = admin.post(f"{API}/teams/{tid}/tasks", json={"title": f"TEST_progress_{uuid.uuid4().hex[:4]}", "list_id": todo["id"]}, timeout=30).json()
        tasks = admin.get(f"{API}/teams/{tid}/tasks", timeout=30).json()
        assert len(tasks) == base_total + 1
        assert len([x for x in tasks if x["list_id"] == selesai["id"]]) == base_done

        r = admin.patch(f"{API}/tasks/{t['id']}", json={"list_id": selesai["id"]}, timeout=30)
        assert r.status_code == 200, r.text
        tasks = admin.get(f"{API}/teams/{tid}/tasks", timeout=30).json()
        assert len([x for x in tasks if x["list_id"] == selesai["id"]]) == base_done + 1

        admin.delete(f"{API}/tasks/{t['id']}", timeout=30)


# ---------------- Feature 5: iteration_8 regression ----------------
class TestRegression:
    def test_list_reorder_admin_only(self, admin, plain_member, team, lists):
        target = lists[-1]
        original = target["order"]
        r = admin.patch(f"{API}/lists/{target['id']}", json={"order": original}, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json()["order"] == original
        r = plain_member.patch(f"{API}/lists/{target['id']}", json={"order": 0}, timeout=30)
        assert r.status_code == 403, f"non-admin member allowed list reorder: {r.status_code}"
        # confirm nothing changed
        after = admin.get(f"{API}/teams/{team['id']}/lists", timeout=30).json()
        assert next(l for l in after if l["id"] == target["id"])["order"] == original

    def test_notification_has_task_id_for_assignment(self, admin, member, team, lists, me_member):
        t = admin.post(f"{API}/teams/{team['id']}/tasks", json={
            "title": f"TEST_assign_{uuid.uuid4().hex[:4]}", "list_id": lists[0]["id"],
            "assignees": [me_member["id"]]}, timeout=30).json()
        data = member.get(f"{API}/notifications", timeout=30).json()
        match = [n for n in data["items"] if n.get("task_id") == t["id"]]
        assert match, "assignment notification with task_id not created"
        assert match[0]["team_id"] == team["id"]
        admin.delete(f"{API}/tasks/{t['id']}", timeout=30)

    def test_chat_history_and_member_access(self, member, team):
        r = member.get(f"{API}/teams/{team['id']}/chat", timeout=30)
        assert r.status_code == 200
        assert isinstance(r.json(), list)
        assert all("reactions" in m for m in r.json())
