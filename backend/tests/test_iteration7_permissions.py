"""Iteration 7 regression: is_private enforcement + list admin-only permissions."""
import os
import re
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL missing")
BASE_URL = base_url.rstrip("/")
API = f"{BASE_URL}/api"


def creds():
    content = Path("/app/memory/test_credentials.md").read_text(encoding="utf-8")
    emails = re.findall(r"(?im)^\s*[-*]?\s*Email:\s*(\S+)", content)
    passwords = re.findall(r"(?im)^\s*[-*]?\s*Password:\s*(\S+)", content)
    if len(emails) < 2 or len(passwords) < 2:
        pytest.skip("credentials file incomplete")
    return list(zip(emails, passwords))


def login(email, password):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password})
    if r.status_code != 200:
        pytest.fail(f"login failed for {email}: {r.status_code} {r.text[:300]}")
    return s, r.json()


@pytest.fixture(scope="module")
def sessions():
    pairs = creds()
    (admin_email, admin_pw), (member_email, member_pw) = pairs[0], pairs[1]
    admin_s, admin_u = login(admin_email, admin_pw)
    member_s, member_u = login(member_email, member_pw)
    return {"admin": (admin_s, admin_u), "member": (member_s, member_u)}


@pytest.fixture(scope="module")
def team(sessions):
    admin_s, _ = sessions["admin"]
    member_s, _ = sessions["member"]
    at = admin_s.get(f"{API}/teams").json()
    mt = member_s.get(f"{API}/teams").json()
    member_team_ids = {t["id"] for t in mt}
    shared = [t for t in at if t["id"] in member_team_ids and t["my_role"] == "admin"]
    assert shared, "no shared team where first account is admin"
    t = shared[0]
    mrole = next(x["my_role"] for x in mt if x["id"] == t["id"])
    assert mrole == "member", f"second account should be plain member, got {mrole}"
    return t


@pytest.fixture(scope="module")
def created(sessions):
    ids = {"tasks": [], "lists": []}
    yield ids
    admin_s, _ = sessions["admin"]
    for tid in ids["tasks"]:
        admin_s.delete(f"{API}/tasks/{tid}")
    for lid in ids["lists"]:
        admin_s.delete(f"{API}/lists/{lid}")


# ---------- is_private enforcement ----------
class TestPrivateTaskVisibility:
    @pytest.fixture(scope="class")
    def private_task(self, sessions, team, created):
        admin_s, _ = sessions["admin"]
        lists = admin_s.get(f"{API}/teams/{team['id']}/lists").json()
        assert lists, "team has no lists"
        r = admin_s.post(f"{API}/teams/{team['id']}/tasks", json={
            "title": "TEST_PRIVATEONLY_admin_secret",
            "description": "TEST_PRIVATEONLY secret body",
            "list_id": lists[0]["id"],
            "is_private": True,
            "assignees": [],
        })
        assert r.status_code == 200, r.text
        task = r.json()
        assert task["is_private"] is True
        created["tasks"].append(task["id"])
        return task

    def test_admin_sees_private_task_in_board(self, sessions, team, private_task):
        admin_s, _ = sessions["admin"]
        tasks = admin_s.get(f"{API}/teams/{team['id']}/tasks").json()
        assert private_task["id"] in [t["id"] for t in tasks]

    def test_member_board_hides_private_task(self, sessions, team, private_task):
        member_s, _ = sessions["member"]
        r = member_s.get(f"{API}/teams/{team['id']}/tasks")
        assert r.status_code == 200
        assert private_task["id"] not in [t["id"] for t in r.json()]

    def test_member_search_hides_private_task(self, sessions, private_task):
        member_s, _ = sessions["member"]
        r = member_s.get(f"{API}/search", params={"q": "TEST_PRIVATEONLY"})
        assert r.status_code == 200
        assert private_task["id"] not in [t["id"] for t in r.json()["tasks"]]

    def test_admin_search_shows_private_task(self, sessions, private_task):
        admin_s, _ = sessions["admin"]
        r = admin_s.get(f"{API}/search", params={"q": "TEST_PRIVATEONLY"})
        assert private_task["id"] in [t["id"] for t in r.json()["tasks"]]

    def test_member_direct_get_returns_403(self, sessions, private_task):
        member_s, _ = sessions["member"]
        r = member_s.get(f"{API}/tasks/{private_task['id']}")
        assert r.status_code == 403, f"expected 403 got {r.status_code}: {r.text[:200]}"

    def test_assigned_member_can_see_private_task(self, sessions, team, private_task):
        admin_s, _ = sessions["admin"]
        member_s, member_u = sessions["member"]
        upd = admin_s.patch(f"{API}/tasks/{private_task['id']}", json={"assignees": [member_u["id"]]})
        assert upd.status_code == 200, upd.text
        r = member_s.get(f"{API}/tasks/{private_task['id']}")
        assert r.status_code == 200, r.text
        assert r.json()["id"] == private_task["id"]
        board = member_s.get(f"{API}/teams/{team['id']}/tasks").json()
        assert private_task["id"] in [t["id"] for t in board]
        srch = member_s.get(f"{API}/search", params={"q": "TEST_PRIVATEONLY"}).json()["tasks"]
        assert private_task["id"] in [t["id"] for t in srch]
        # revert
        admin_s.patch(f"{API}/tasks/{private_task['id']}", json={"assignees": []})

    def test_private_task_comments_not_readable_by_nonassigned_member(self, sessions, private_task):
        """Secondary leak check: comments endpoint should also respect task_visible."""
        member_s, _ = sessions["member"]
        r = member_s.get(f"{API}/tasks/{private_task['id']}/comments")
        assert r.status_code == 403, f"comments of private task readable (status {r.status_code})"

    def test_private_task_not_writable_by_nonassigned_member(self, sessions, private_task):
        """Secondary leak check: PATCH should also respect task_visible."""
        member_s, _ = sessions["member"]
        r = member_s.patch(f"{API}/tasks/{private_task['id']}", json={"title": "TEST_HIJACK"})
        if r.status_code == 200:
            # restore title so board state stays clean
            sessions["admin"][0].patch(f"{API}/tasks/{private_task['id']}", json={"title": private_task["title"]})
        assert r.status_code == 403, f"private task editable by non-assigned member (status {r.status_code})"


# ---------- list admin-only permissions ----------
class TestListPermissions:
    def test_member_cannot_create_list(self, sessions, team):
        member_s, _ = sessions["member"]
        r = member_s.post(f"{API}/teams/{team['id']}/lists", json={"name": "TEST_member_list"})
        assert r.status_code == 403, r.text

    def test_member_cannot_rename_archive_or_delete_list(self, sessions, team):
        member_s, _ = sessions["member"]
        lists = member_s.get(f"{API}/teams/{team['id']}/lists").json()
        assert lists
        lid = lists[0]["id"]
        original = lists[0]["name"]
        r1 = member_s.patch(f"{API}/lists/{lid}", json={"name": "TEST_renamed_by_member"})
        r2 = member_s.patch(f"{API}/lists/{lid}", json={"archived": True})
        r3 = member_s.delete(f"{API}/lists/{lid}")
        assert r1.status_code == 403, f"rename allowed: {r1.status_code}"
        assert r2.status_code == 403, f"archive allowed: {r2.status_code}"
        assert r3.status_code == 403, f"delete allowed: {r3.status_code}"
        after = member_s.get(f"{API}/teams/{team['id']}/lists").json()
        assert any(l["id"] == lid and l["name"] == original for l in after), "list mutated by member"

    def test_admin_full_list_lifecycle(self, sessions, team, created):
        admin_s, _ = sessions["admin"]
        # create
        r = admin_s.post(f"{API}/teams/{team['id']}/lists", json={"name": "TEST_admin_list"})
        assert r.status_code == 200, r.text
        lst = r.json()
        created["lists"].append(lst["id"])
        assert lst["name"] == "TEST_admin_list"
        assert lst["archived"] is False
        # rename
        r = admin_s.patch(f"{API}/lists/{lst['id']}", json={"name": "TEST_admin_list_renamed"})
        assert r.status_code == 200
        assert r.json()["name"] == "TEST_admin_list_renamed"
        fetched = admin_s.get(f"{API}/teams/{team['id']}/lists").json()
        assert any(l["id"] == lst["id"] and l["name"] == "TEST_admin_list_renamed" for l in fetched)
        # archive
        r = admin_s.patch(f"{API}/lists/{lst['id']}", json={"archived": True})
        assert r.status_code == 200 and r.json()["archived"] is True
        active = admin_s.get(f"{API}/teams/{team['id']}/lists").json()
        assert lst["id"] not in [l["id"] for l in active]
        arch = admin_s.get(f"{API}/teams/{team['id']}/lists", params={"archived": "true"}).json()
        assert lst["id"] in [l["id"] for l in arch]
        # restore
        r = admin_s.patch(f"{API}/lists/{lst['id']}", json={"archived": False})
        assert r.status_code == 200 and r.json()["archived"] is False
        active = admin_s.get(f"{API}/teams/{team['id']}/lists").json()
        assert lst["id"] in [l["id"] for l in active]
        # delete
        r = admin_s.delete(f"{API}/lists/{lst['id']}")
        assert r.status_code == 200
        created["lists"].remove(lst["id"])
        active = admin_s.get(f"{API}/teams/{team['id']}/lists").json()
        assert lst["id"] not in [l["id"] for l in active]


# ---------- smoke: core flows still work ----------
class TestSmoke:
    def test_member_can_comment_with_mention_on_public_task(self, sessions, team, created):
        admin_s, admin_u = sessions["admin"]
        member_s, member_u = sessions["member"]
        lists = admin_s.get(f"{API}/teams/{team['id']}/lists").json()
        r = admin_s.post(f"{API}/teams/{team['id']}/tasks", json={"title": "TEST_public_smoke", "list_id": lists[0]["id"]})
        assert r.status_code == 200
        task = r.json()
        created["tasks"].append(task["id"])
        assert member_s.get(f"{API}/tasks/{task['id']}").status_code == 200
        c = member_s.post(f"{API}/tasks/{task['id']}/comments", json={"body": "TEST_comment @admin", "mentions": [admin_u["id"]]})
        assert c.status_code == 200, c.text
        assert c.json()["body"] == "TEST_comment @admin"
        listed = member_s.get(f"{API}/tasks/{task['id']}/comments").json()
        assert c.json()["id"] in [x["id"] for x in listed]
        notifs = admin_s.get(f"{API}/notifications").json()["items"]
        assert any(n["task_id"] == task["id"] and n["type"] == "mention" for n in notifs)

    def test_member_can_move_task_between_lists(self, sessions, team, created):
        admin_s, _ = sessions["admin"]
        member_s, _ = sessions["member"]
        lists = admin_s.get(f"{API}/teams/{team['id']}/lists").json()
        assert len(lists) >= 2
        r = admin_s.post(f"{API}/teams/{team['id']}/tasks", json={"title": "TEST_drag_smoke", "list_id": lists[0]["id"]})
        task = r.json()
        created["tasks"].append(task["id"])
        upd = member_s.patch(f"{API}/tasks/{task['id']}", json={"list_id": lists[1]["id"], "order": 0})
        assert upd.status_code == 200
        assert upd.json()["list_id"] == lists[1]["id"]
        board = member_s.get(f"{API}/teams/{team['id']}/tasks").json()
        got = next(t for t in board if t["id"] == task["id"])
        assert got["list_id"] == lists[1]["id"]

    def test_chat_group_post_and_fetch(self, sessions, team):
        member_s, _ = sessions["member"]
        admin_s, admin_u = sessions["admin"]
        r = member_s.post(f"{API}/teams/{team['id']}/chat", json={"body": "TEST_chat_smoke @admin", "mentions": [admin_u["id"]]})
        assert r.status_code == 200, r.text
        msg = r.json()
        msgs = admin_s.get(f"{API}/teams/{team['id']}/chat").json()
        assert msg["id"] in [m["id"] for m in msgs]

    def test_no_mongo_object_ids_leaked(self, sessions, team):
        admin_s, _ = sessions["admin"]
        for path in [f"{API}/teams", f"{API}/teams/{team['id']}/lists", f"{API}/teams/{team['id']}/tasks", f"{API}/teams/{team['id']}/members", f"{API}/notifications"]:
            body = admin_s.get(path).text
            assert '"_id"' not in body, f"_id leaked in {path}"
