"""Northstar Workspace v2 (multi-team) API tests."""
import os
import re
import io
import uuid
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL missing")
BASE = base_url.rstrip("/") + "/api"


def creds(which="admin"):
    content = Path("/app/memory/test_credentials.md").read_text()
    blocks = re.findall(r"- Email: (\S+)\n- Password: (\S+)", content)
    if not blocks:
        pytest.skip("no credentials found")
    return blocks[0] if which == "admin" else blocks[1]


@pytest.fixture(scope="session")
def admin():
    s = requests.Session()
    email, password = creds("admin")
    r = s.post(f"{BASE}/auth/login", json={"email": email, "password": password})
    if r.status_code != 200:
        pytest.fail(f"admin login failed {r.status_code}: {r.text[:300]}")
    return s


@pytest.fixture(scope="session")
def member():
    s = requests.Session()
    email, password = creds("member")
    r = s.post(f"{BASE}/auth/login", json={"email": email, "password": password})
    if r.status_code != 200:
        pytest.fail(f"member login failed {r.status_code}: {r.text[:300]}")
    return s


@pytest.fixture(scope="session")
def team(admin):
    r = admin.get(f"{BASE}/teams")
    assert r.status_code == 200, r.text
    teams = r.json()
    assert len(teams) >= 1, "admin has no teams"
    t = next((x for x in teams if x["name"] == "Tim B"), teams[0])
    return t


@pytest.fixture(scope="session")
def lists(admin, team):
    r = admin.get(f"{BASE}/teams/{team['id']}/lists")
    assert r.status_code == 200, r.text
    return r.json()


# ---------- auth ----------
class TestAuth:
    def test_login_sets_httponly_cookies(self):
        s = requests.Session()
        email, password = creds("admin")
        r = s.post(f"{BASE}/auth/login", json={"email": email, "password": password})
        assert r.status_code == 200
        data = r.json()
        assert data["email"] == email
        assert "password_hash" not in data
        assert "_id" not in data
        cookie_header = "; ".join(h for h in r.headers.get_all("set-cookie", []) ) if hasattr(r.headers, "get_all") else str(r.headers)
        assert "access_token" in cookie_header and "HttpOnly" in cookie_header
        assert "refresh_token" in cookie_header

    def test_me(self, admin):
        r = admin.get(f"{BASE}/auth/me")
        assert r.status_code == 200
        assert r.json()["role"] == "admin"

    def test_invalid_credentials(self):
        r = requests.post(f"{BASE}/auth/login", json={"email": "nobody-xyz@northstar.team", "password": "wrongpass1"})
        assert r.status_code in (401, 429)

    def test_protected_requires_auth(self):
        for path in ["/teams", "/notifications", "/auth/me", "/members", "/search?q=a"]:
            r = requests.get(f"{BASE}{path}")
            assert r.status_code == 401, f"{path} -> {r.status_code}"

    def test_bcrypt_hash_format(self):
        import subprocess, json as _json
        out = subprocess.run([
            "python", "-c",
            "import os,pymongo;from dotenv import dotenv_values;e=dotenv_values('/app/backend/.env');"
            "c=pymongo.MongoClient(e['MONGO_URL']);u=c[e['DB_NAME']].users.find_one({'email':e['ADMIN_EMAIL'].lower()});"
            "print(u['password_hash'][:4])"
        ], capture_output=True, text=True)
        assert out.stdout.strip() == "$2b$", out.stdout + out.stderr


# ---------- teams & lists ----------
class TestTeamsLists:
    created_team = None

    def test_create_team_with_default_lists(self, admin):
        name = f"TEST_Tim_{uuid.uuid4().hex[:6]}"
        r = admin.post(f"{BASE}/teams", json={"name": name, "color": "#ff5722"})
        assert r.status_code == 200, r.text
        t = r.json()
        assert t["name"] == name and t["my_role"] == "admin" and t["member_count"] == 1
        TestTeamsLists.created_team = t["id"]

        lr = admin.get(f"{BASE}/teams/{t['id']}/lists")
        assert lr.status_code == 200
        names = [x["name"] for x in lr.json()]
        assert names == ["To Do List", "Dikerjakan", "Selesai", "Batal"], names

        gr = admin.get(f"{BASE}/teams/{t['id']}")
        assert gr.status_code == 200 and gr.json()["name"] == name

    def test_non_member_forbidden(self, member):
        assert TestTeamsLists.created_team
        r = member.get(f"{BASE}/teams/{TestTeamsLists.created_team}/tasks")
        assert r.status_code == 403, r.status_code

    def test_list_crud_and_archive(self, admin):
        tid = TestTeamsLists.created_team
        r = admin.post(f"{BASE}/teams/{tid}/lists", json={"name": "TEST_List"})
        assert r.status_code == 200, r.text
        lid = r.json()["id"]

        r = admin.patch(f"{BASE}/lists/{lid}", json={"name": "TEST_List_Renamed"})
        assert r.status_code == 200 and r.json()["name"] == "TEST_List_Renamed"

        r = admin.patch(f"{BASE}/lists/{lid}", json={"archived": True})
        assert r.status_code == 200 and r.json()["archived"] is True
        active = [x["id"] for x in admin.get(f"{BASE}/teams/{tid}/lists").json()]
        assert lid not in active
        archived = [x["id"] for x in admin.get(f"{BASE}/teams/{tid}/lists?archived=true").json()]
        assert lid in archived

        # restore
        r = admin.patch(f"{BASE}/lists/{lid}", json={"archived": False})
        assert r.status_code == 200 and r.json()["archived"] is False

        assert admin.delete(f"{BASE}/lists/{lid}").status_code == 200
        assert admin.patch(f"{BASE}/lists/{lid}", json={"name": "x"}).status_code == 404

    def test_add_member_role_and_remove(self, admin, member):
        tid = TestTeamsLists.created_team
        avail = admin.get(f"{BASE}/teams/{tid}/available-members")
        assert avail.status_code == 200
        target = next((u for u in avail.json() if u["email"].startswith("member1")), None)
        assert target, "member1 not in available-members"

        r = admin.post(f"{BASE}/teams/{tid}/members", json={"user_id": target["id"]})
        assert r.status_code == 200, r.text
        assert admin.post(f"{BASE}/teams/{tid}/members", json={"user_id": target["id"]}).status_code == 409

        members = admin.get(f"{BASE}/teams/{tid}/members").json()
        assert any(m["id"] == target["id"] and m["team_role"] == "member" for m in members)

        # member can now access
        assert member.get(f"{BASE}/teams/{tid}/tasks").status_code == 200
        # member cannot admin
        assert member.delete(f"{BASE}/teams/{tid}/members/{target['id']}").status_code == 403

        r = admin.patch(f"{BASE}/teams/{tid}/members/{target['id']}", json={"role": "admin"})
        assert r.status_code == 200
        members = admin.get(f"{BASE}/teams/{tid}/members").json()
        assert any(m["id"] == target["id"] and m["team_role"] == "admin" for m in members)
        assert admin.patch(f"{BASE}/teams/{tid}/members/{target['id']}", json={"role": "boss"}).status_code == 400

        assert admin.delete(f"{BASE}/teams/{tid}/members/{target['id']}").status_code == 200
        assert member.get(f"{BASE}/teams/{tid}/tasks").status_code == 403

    def test_zz_delete_team_cleans_up(self, admin):
        tid = TestTeamsLists.created_team
        assert admin.delete(f"{BASE}/teams/{tid}").status_code == 200
        assert admin.get(f"{BASE}/teams/{tid}").status_code == 403
        assert tid not in [t["id"] for t in admin.get(f"{BASE}/teams").json()]


# ---------- tasks ----------
class TestTasks:
    def test_task_crud_move_duplicate_archive(self, admin, team, lists):
        tid, l0, l1 = team["id"], lists[0]["id"], lists[1]["id"]
        payload = {"title": "TEST_task_crud", "description": "desc", "list_id": l0, "priority": "High",
                   "due_date": "2026-08-20", "assignees": [], "labels": [{"name": "TEST", "color": "#f00"}]}
        r = admin.post(f"{BASE}/teams/{tid}/tasks", json=payload)
        assert r.status_code == 200, r.text
        t = r.json()
        assert t["title"] == payload["title"] and t["list_id"] == l0 and t["priority"] == "High"
        assert t["archived"] is False and t["attachments"] == [] and t["checklist"] == []
        assert "_id" not in t
        task_id = t["id"]

        # move (drag and drop equivalent) + persistence
        r = admin.patch(f"{BASE}/tasks/{task_id}", json={"list_id": l1, "order": 3})
        assert r.status_code == 200 and r.json()["list_id"] == l1 and r.json()["order"] == 3
        fetched = next(x for x in admin.get(f"{BASE}/teams/{tid}/tasks").json() if x["id"] == task_id)
        assert fetched["list_id"] == l1 and fetched["order"] == 3

        # checklist + private
        r = admin.patch(f"{BASE}/tasks/{task_id}", json={"checklist": [{"id": "c1", "text": "step", "done": False}], "is_private": True})
        assert r.status_code == 200
        assert r.json()["checklist"][0]["text"] == "step" and r.json()["is_private"] is True

        # duplicate
        r = admin.post(f"{BASE}/tasks/{task_id}/duplicate")
        assert r.status_code == 200, r.text
        dup = r.json()
        assert dup["title"] == "TEST_task_crud (Salinan)" and dup["id"] != task_id
        assert "_id" not in dup

        # archive + restore
        assert admin.patch(f"{BASE}/tasks/{task_id}", json={"archived": True}).status_code == 200
        board = [x["id"] for x in admin.get(f"{BASE}/teams/{tid}/tasks").json()]
        assert task_id not in board
        arch = [x["id"] for x in admin.get(f"{BASE}/teams/{tid}/tasks?archived=true").json()]
        assert task_id in arch
        r = admin.patch(f"{BASE}/tasks/{task_id}", json={"archived": False})
        assert r.status_code == 200 and r.json()["archived"] is False

        # delete both
        for i in (task_id, dup["id"]):
            assert admin.delete(f"{BASE}/tasks/{i}").status_code == 200
        assert admin.patch(f"{BASE}/tasks/{task_id}", json={"title": "x"}).status_code == 404

    def test_task_validation(self, admin, team, lists):
        r = admin.post(f"{BASE}/teams/{team['id']}/tasks", json={"title": "", "list_id": lists[0]["id"]})
        assert r.status_code == 422
        r = admin.post(f"{BASE}/teams/{team['id']}/tasks", json={"description": "no title"})
        assert r.status_code == 422

    def test_clear_due_date(self, admin, team, lists):
        r = admin.post(f"{BASE}/teams/{team['id']}/tasks", json={"title": "TEST_cleardate", "list_id": lists[0]["id"], "due_date": "2026-09-01"})
        task_id = r.json()["id"]
        try:
            r = admin.patch(f"{BASE}/tasks/{task_id}", json={"due_date": None})
            assert r.status_code == 200
            assert r.json()["due_date"] is None, "due_date could not be cleared (PATCH strips None values)"
        finally:
            admin.delete(f"{BASE}/tasks/{task_id}")


# ---------- comments / mentions / notifications ----------
class TestCommentsMentions:
    def test_comment_mention_creates_notification(self, admin, member, team, lists):
        tid = team["id"]
        members = admin.get(f"{BASE}/teams/{tid}/members").json()
        target = next((m for m in members if m["email"].startswith("member1")), None)
        assert target, "member1 must be member of Tim B"

        r = admin.post(f"{BASE}/teams/{tid}/tasks", json={"title": "TEST_mention_task", "list_id": lists[0]["id"]})
        task_id = r.json()["id"]
        try:
            before = member.get(f"{BASE}/notifications").json()["unread"]
            r = admin.post(f"{BASE}/tasks/{task_id}/comments", json={"body": f"Halo @{target['name']} cek ini", "mentions": [target["id"]]})
            assert r.status_code == 200, r.text
            c = r.json()
            assert c["mentions"] == [target["id"]] and c["author"]
            got = admin.get(f"{BASE}/tasks/{task_id}/comments").json()
            assert any(x["id"] == c["id"] for x in got)

            notif = member.get(f"{BASE}/notifications").json()
            assert notif["unread"] > before
            item = next(i for i in notif["items"] if i["task_id"] == task_id)
            assert item["type"] == "mention" and item["team_id"] == tid
            assert member.patch(f"{BASE}/notifications/{item['id']}/read").status_code == 200
            after = member.get(f"{BASE}/notifications").json()
            assert next(i for i in after["items"] if i["id"] == item["id"])["read"] is True

            assert member.patch(f"{BASE}/notifications/read-all").status_code == 200
            assert member.get(f"{BASE}/notifications").json()["unread"] == 0

            # comments deleted with task
            admin.delete(f"{BASE}/tasks/{task_id}")
            assert admin.get(f"{BASE}/tasks/{task_id}/comments").status_code == 404
        finally:
            admin.delete(f"{BASE}/tasks/{task_id}")

    def test_empty_comment_rejected(self, admin, team, lists):
        r = admin.post(f"{BASE}/teams/{team['id']}/tasks", json={"title": "TEST_empty_comment", "list_id": lists[0]["id"]})
        task_id = r.json()["id"]
        try:
            assert admin.post(f"{BASE}/tasks/{task_id}/comments", json={"body": ""}).status_code == 422
        finally:
            admin.delete(f"{BASE}/tasks/{task_id}")

    def test_assignment_notification(self, admin, member, team, lists):
        members = admin.get(f"{BASE}/teams/{team['id']}/members").json()
        target = next(m for m in members if m["email"].startswith("member1"))
        r = admin.post(f"{BASE}/teams/{team['id']}/tasks", json={"title": "TEST_assign", "list_id": lists[0]["id"], "assignees": [target["id"]]})
        assert r.status_code == 200
        task_id = r.json()["id"]
        try:
            notif = member.get(f"{BASE}/notifications").json()
            assert any(i["task_id"] == task_id and i["type"] == "assignment" for i in notif["items"])
        finally:
            admin.delete(f"{BASE}/tasks/{task_id}")


# ---------- files ----------
class TestFiles:
    def test_upload_attachment_download_delete(self, admin, team, lists):
        tid = team["id"]
        r = admin.post(f"{BASE}/teams/{tid}/tasks", json={"title": "TEST_file_task", "list_id": lists[0]["id"]})
        task_id = r.json()["id"]
        try:
            files = {"file": ("TEST_upload.txt", io.BytesIO(b"hello northstar"), "text/plain")}
            r = admin.post(f"{BASE}/files/upload?team_id={tid}&task_id={task_id}&kind=attachment", files=files)
            assert r.status_code == 200, r.text
            entry = r.json()
            assert entry["filename"] == "TEST_upload.txt" and entry["size"] > 0
            fid = entry["id"]

            task = next(x for x in admin.get(f"{BASE}/teams/{tid}/tasks").json() if x["id"] == task_id)
            assert any(a["id"] == fid for a in task["attachments"])

            d = admin.get(f"{BASE}/files/{fid}")
            assert d.status_code == 200 and d.content == b"hello northstar"

            docs = admin.get(f"{BASE}/teams/{tid}/documents").json()
            assert any(x["file_id"] == fid for x in docs)

            assert admin.delete(f"{BASE}/tasks/{task_id}/attachments/{fid}").status_code == 200
            task = next(x for x in admin.get(f"{BASE}/teams/{tid}/tasks").json() if x["id"] == task_id)
            assert not any(a["id"] == fid for a in task["attachments"])
        finally:
            admin.delete(f"{BASE}/tasks/{task_id}")

    def test_upload_document_standalone(self, admin, team):
        tid = team["id"]
        files = {"file": ("TEST_doc.txt", io.BytesIO(b"dokumen tim"), "text/plain")}
        r = admin.post(f"{BASE}/files/upload?team_id={tid}&kind=document", files=files)
        assert r.status_code == 200, r.text
        fid = r.json()["id"]
        docs = admin.get(f"{BASE}/teams/{tid}/documents").json()
        assert any(x["file_id"] == fid for x in docs)
        assert admin.get(f"{BASE}/files/{fid}").content == b"dokumen tim"

    def test_missing_file_404(self, admin):
        assert admin.get(f"{BASE}/files/{uuid.uuid4()}").status_code == 404


# ---------- chat / announcements / questions ----------
class TestCollaboration:
    def test_chat_with_mention(self, admin, member, team):
        tid = team["id"]
        members = admin.get(f"{BASE}/teams/{tid}/members").json()
        target = next(m for m in members if m["email"].startswith("member1"))
        r = admin.post(f"{BASE}/teams/{tid}/chat", json={"body": f"TEST_chat @{target['name']}", "mentions": [target["id"]]})
        assert r.status_code == 200, r.text
        msg = r.json()
        got = admin.get(f"{BASE}/teams/{tid}/chat").json()
        assert any(x["id"] == msg["id"] and x["body"] == msg["body"] for x in got)
        notif = member.get(f"{BASE}/notifications").json()
        assert any("Chat Grup" in i["text"] for i in notif["items"])
        assert admin.post(f"{BASE}/teams/{tid}/chat", json={"body": ""}).status_code == 422

    def test_announcement_notifies_members(self, admin, member, team):
        tid = team["id"]
        r = admin.post(f"{BASE}/teams/{tid}/announcements", json={"title": "TEST_pengumuman", "body": "isi"})
        assert r.status_code == 200, r.text
        a = r.json()
        assert any(x["id"] == a["id"] for x in admin.get(f"{BASE}/teams/{tid}/announcements").json())
        notif = member.get(f"{BASE}/notifications").json()
        assert any(i["type"] == "announcement" and "TEST_pengumuman" in i["text"] for i in notif["items"])

    def test_question_answer_notifies_author(self, admin, member, team):
        tid = team["id"]
        r = member.post(f"{BASE}/teams/{tid}/questions", json={"title": "TEST_pertanyaan", "body": "kenapa?"})
        assert r.status_code == 200, r.text
        qid = r.json()["id"]
        assert r.json()["answers"] == []
        r = admin.post(f"{BASE}/questions/{qid}/answers", json={"body": "karena TEST"})
        assert r.status_code == 200, r.text
        q = next(x for x in member.get(f"{BASE}/teams/{tid}/questions").json() if x["id"] == qid)
        assert len(q["answers"]) == 1 and q["answers"][0]["body"] == "karena TEST"
        notif = member.get(f"{BASE}/notifications").json()
        assert any(i["type"] == "answer" for i in notif["items"])
        assert admin.post(f"{BASE}/questions/{uuid.uuid4()}/answers", json={"body": "x"}).status_code == 404


# ---------- search ----------
class TestSearch:
    def test_search_scoped_to_my_teams(self, admin, member, team, lists):
        r = admin.post(f"{BASE}/teams/{team['id']}/tasks", json={"title": "TEST_searchable_zebra", "list_id": lists[0]["id"]})
        task_id = r.json()["id"]
        try:
            res = admin.get(f"{BASE}/search", params={"q": "searchable_zebra"})
            assert res.status_code == 200
            tasks = res.json()["tasks"]
            assert any(t["id"] == task_id for t in tasks)
            assert all("_id" not in t for t in tasks)
            res2 = admin.get(f"{BASE}/search", params={"q": "nomatch_" + uuid.uuid4().hex})
            assert res2.json()["tasks"] == []
        finally:
            admin.delete(f"{BASE}/tasks/{task_id}")
