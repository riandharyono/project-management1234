"""Iteration 12 backend tests: file upload E2E, documents cross-listing,
sub-checklist persistence, schedule quick-actions (mark done / reschedule),
plus auth playbook checks."""
import io
import os
import re
import hashlib
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


def _creds():
    content = Path("/app/memory/test_credentials.md").read_text(encoding="utf-8")
    emails = re.findall(r"(?im)^\s*[-*]?\s*Email:\s*`?([^`\s]+)", content)
    pwds = re.findall(r"(?im)^\s*[-*]?\s*Password:\s*`?([^`\s]+)", content)
    return list(zip(emails, pwds))


@pytest.fixture(scope="session")
def creds():
    c = _creds()
    if len(c) < 2:
        pytest.skip("credentials file incomplete")
    return {"admin": c[0], "member": c[1]}


@pytest.fixture(scope="session")
def admin(creds):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": creds["admin"][0], "password": creds["admin"][1]})
    if r.status_code != 200:
        pytest.fail(f"admin login failed {r.status_code} {r.text[:300]}")
    return s


@pytest.fixture(scope="session")
def member(creds):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": creds["member"][0], "password": creds["member"][1]})
    if r.status_code != 200:
        pytest.fail(f"member login failed {r.status_code} {r.text[:300]}")
    return s


@pytest.fixture(scope="session")
def team(admin):
    r = admin.get(f"{API}/teams")
    assert r.status_code == 200, r.text
    teams = r.json()
    assert teams, "no teams available"
    return teams[0]


@pytest.fixture(scope="session")
def lists(admin, team):
    r = admin.get(f"{API}/teams/{team['id']}/lists")
    assert r.status_code == 200
    ls = r.json()
    assert any(l.get("is_done") for l in ls), "team has no is_done list"
    return ls


@pytest.fixture
def task(admin, team, lists):
    todo = next(l for l in lists if not l.get("is_done"))
    r = admin.post(f"{API}/teams/{team['id']}/tasks", json={"title": "TEST_it12_task", "list_id": todo["id"], "priority": "Sedang"})
    assert r.status_code in (200, 201), r.text
    t = r.json()
    yield t
    admin.delete(f"{API}/tasks/{t['id']}")


# ---------- Auth / playbook ----------
class TestAuthPlaybook:
    def test_login_sets_httponly_cookies(self, creds):
        s = requests.Session()
        r = s.post(f"{API}/auth/login", json={"email": creds["admin"][0], "password": creds["admin"][1]})
        assert r.status_code == 200
        raw = r.headers.get("set-cookie", "")
        assert "access_token" in raw and "HttpOnly" in raw, raw[:300]
        assert "refresh_token" in raw

    def test_me_returns_user(self, admin, creds):
        r = admin.get(f"{API}/auth/me")
        assert r.status_code == 200
        assert r.json()["email"] == creds["admin"][0]
        assert "_id" not in r.json()

    def test_unauthenticated_blocked(self):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code in (401, 403)

    def test_bcrypt_hash_format(self):
        try:
            from motor.motor_asyncio import AsyncIOMotorClient  # noqa
        except Exception:
            pytest.skip("motor unavailable")
        import asyncio
        from motor.motor_asyncio import AsyncIOMotorClient
        env = dotenv_values("/app/backend/.env")
        mongo_url = env.get("MONGO_URL") or os.environ.get("MONGO_URL")
        db_name = env.get("DB_NAME") or os.environ.get("DB_NAME")
        if not mongo_url or not db_name:
            pytest.skip("mongo env missing")

        async def run():
            c = AsyncIOMotorClient(mongo_url)
            u = await c[db_name].users.find_one({}, {"_id": 0, "password": 1})
            c.close()
            return u
        u = asyncio.get_event_loop().run_until_complete(run())
        assert u and u.get("password", "").startswith("$2b$"), u

    def test_brute_force_lockout(self):
        s = requests.Session()
        email = "TEST_bruteforce_it12@example.com"
        codes = []
        for _ in range(7):
            r = s.post(f"{API}/auth/login", json={"email": email, "password": "wrongpass"})
            codes.append(r.status_code)
        assert 429 in codes, f"no lockout observed: {codes}"


# ---------- File upload E2E ----------
class TestFileUpload:
    def test_task_attachment_roundtrip(self, admin, team, task):
        payload = os.urandom(2048)
        digest = hashlib.sha256(payload).hexdigest()
        r = admin.post(
            f"{API}/files/upload",
            params={"team_id": team["id"], "task_id": task["id"], "kind": "attachment"},
            files={"file": ("TEST_it12_attach.bin", io.BytesIO(payload), "application/octet-stream")},
        )
        assert r.status_code == 200, r.text
        entry = r.json()
        assert entry["filename"] == "TEST_it12_attach.bin"
        assert entry["size"] == len(payload)
        fid = entry["id"]

        # persisted on task
        t = admin.get(f"{API}/tasks/{task['id']}").json()
        assert any(a["id"] == fid for a in t.get("attachments", []))

        # download real bytes
        d = admin.get(f"{API}/files/{fid}")
        assert d.status_code == 200, d.text
        assert hashlib.sha256(d.content).hexdigest() == digest, "downloaded bytes differ from uploaded"

        # cross-listed in documents
        docs = admin.get(f"{API}/teams/{team['id']}/documents").json()
        assert any(d_["file_id"] == fid and d_.get("task_id") == task["id"] for d_ in docs), "attachment not cross-listed in documents"

        # delete attachment
        rem = admin.delete(f"{API}/tasks/{task['id']}/attachments/{fid}")
        assert rem.status_code == 200
        t2 = admin.get(f"{API}/tasks/{task['id']}").json()
        assert not any(a["id"] == fid for a in t2.get("attachments", []))

    def test_document_upload_roundtrip(self, admin, team):
        payload = b"TEST_it12 document content \x00\x01binary" * 40
        digest = hashlib.sha256(payload).hexdigest()
        r = admin.post(
            f"{API}/files/upload",
            params={"team_id": team["id"], "kind": "document"},
            files={"file": ("TEST_it12_doc.txt", io.BytesIO(payload), "text/plain")},
        )
        assert r.status_code == 200, r.text
        fid = r.json()["id"]
        docs = admin.get(f"{API}/teams/{team['id']}/documents").json()
        match = [d for d in docs if d["file_id"] == fid]
        assert match, "uploaded document missing from documents list"
        assert all("_id" not in d for d in docs)
        d = admin.get(f"{API}/files/{fid}")
        assert d.status_code == 200
        assert hashlib.sha256(d.content).hexdigest() == digest
        # cleanup document entry if endpoint exists
        doc_id = match[0]["id"]
        admin.delete(f"{API}/documents/{doc_id}")

    def test_download_requires_auth(self, admin, team, task):
        payload = b"auth-check"
        r = admin.post(f"{API}/files/upload", params={"team_id": team["id"], "task_id": task["id"], "kind": "attachment"},
                       files={"file": ("TEST_it12_auth.txt", io.BytesIO(payload), "text/plain")})
        assert r.status_code == 200
        fid = r.json()["id"]
        anon = requests.get(f"{API}/files/{fid}")
        assert anon.status_code in (401, 403), anon.status_code

    def test_upload_nonmember_team_denied(self, member, team):
        # member1 IS a member of Tim B, so use bogus team id instead
        r = member.post(f"{API}/files/upload", params={"team_id": "nonexistent-team", "kind": "document"},
                        files={"file": ("TEST_it12_x.txt", io.BytesIO(b"x"), "text/plain")})
        assert r.status_code in (403, 404), r.status_code

    def test_download_missing_file_404(self, admin):
        r = admin.get(f"{API}/files/does-not-exist")
        assert r.status_code == 404


# ---------- Sub-checklist ----------
class TestSubChecklist:
    def test_subitems_persist_and_toggle(self, admin, task):
        checklist = [
            {"id": "m1", "text": "TEST_main1", "done": False,
             "subitems": [{"id": "s1", "text": "TEST_sub1", "done": False},
                          {"id": "s2", "text": "TEST_sub2", "done": True}]},
            {"id": "m2", "text": "TEST_main2", "done": True, "subitems": []},
        ]
        r = admin.patch(f"{API}/tasks/{task['id']}", json={"checklist": checklist})
        assert r.status_code == 200, r.text
        got = r.json()["checklist"]
        assert len(got) == 2
        assert len(got[0]["subitems"]) == 2
        assert got[0]["subitems"][1]["done"] is True

        # GET verify persistence
        t = admin.get(f"{API}/tasks/{task['id']}").json()
        assert t["checklist"][0]["subitems"][0]["text"] == "TEST_sub1"

        # combined progress expectation: done = main1(0)+main2(1)+sub2(1) = 2, total = 2+2 = 4
        done = sum((1 if c["done"] else 0) + sum(1 for s in c.get("subitems", []) if s["done"]) for c in t["checklist"])
        total = sum(1 + len(c.get("subitems", [])) for c in t["checklist"])
        assert (done, total) == (2, 4)

        # toggle a subitem off
        t["checklist"][0]["subitems"][1]["done"] = False
        r2 = admin.patch(f"{API}/tasks/{task['id']}", json={"checklist": t["checklist"]})
        assert r2.status_code == 200
        assert r2.json()["checklist"][0]["subitems"][1]["done"] is False

        # remove subitem
        cl = r2.json()["checklist"]
        cl[0]["subitems"] = [s for s in cl[0]["subitems"] if s["id"] != "s1"]
        r3 = admin.patch(f"{API}/tasks/{task['id']}", json={"checklist": cl})
        assert r3.status_code == 200
        assert len(admin.get(f"{API}/tasks/{task['id']}").json()["checklist"][0]["subitems"]) == 1


# ---------- Schedule quick actions ----------
class TestScheduleActions:
    def test_reschedule_due_date(self, admin, task):
        r = admin.patch(f"{API}/tasks/{task['id']}", json={"due_date": "2026-12-24"})
        assert r.status_code == 200
        assert r.json()["due_date"] == "2026-12-24"
        assert admin.get(f"{API}/tasks/{task['id']}").json()["due_date"] == "2026-12-24"

    def test_mark_done_moves_to_done_list(self, admin, task, lists):
        done_list = next(l for l in lists if l.get("is_done"))
        r = admin.patch(f"{API}/tasks/{task['id']}", json={"list_id": done_list["id"]})
        assert r.status_code == 200
        assert r.json()["list_id"] == done_list["id"]
        assert admin.get(f"{API}/tasks/{task['id']}").json()["list_id"] == done_list["id"]

    def test_team_tasks_include_due_date_and_list(self, admin, team, task):
        admin.patch(f"{API}/tasks/{task['id']}", json={"due_date": "2026-11-11"})
        tasks = admin.get(f"{API}/teams/{team['id']}/tasks").json()
        me = [t for t in tasks if t["id"] == task["id"]]
        assert me, "created task missing from team tasks"
        assert me[0]["due_date"] == "2026-11-11"
        assert all("_id" not in t for t in tasks)


# ---------- Light regression ----------
class TestRegression:
    def test_core_endpoints(self, admin, team):
        for path in ["/teams", f"/teams/{team['id']}/lists", f"/teams/{team['id']}/tasks",
                     f"/teams/{team['id']}/members", f"/teams/{team['id']}/labels",
                     f"/teams/{team['id']}/chat", f"/teams/{team['id']}/announcements",
                     f"/teams/{team['id']}/questions", f"/teams/{team['id']}/documents",
                     "/notifications?page=1&limit=10"]:
            r = admin.get(f"{API}{path}")
            assert r.status_code == 200, f"{path} -> {r.status_code} {r.text[:200]}"

    def test_member_cannot_create_label(self, member, team):
        r = member.post(f"{API}/teams/{team['id']}/labels", json={"name": "TEST_it12_label", "color": "#ff0000"})
        assert r.status_code == 403, f"member label creation allowed! {r.status_code}"

    def test_duplicate_and_delete_task(self, admin, task):
        r = admin.post(f"{API}/tasks/{task['id']}/duplicate")
        assert r.status_code in (200, 201), r.text
        dup = r.json()
        assert dup["id"] != task["id"]
        d = admin.delete(f"{API}/tasks/{dup['id']}")
        assert d.status_code == 200
        assert admin.get(f"{API}/tasks/{dup['id']}").status_code == 404

    def test_chat_reaction_no_duplicate(self, admin, team):
        r = admin.post(f"{API}/teams/{team['id']}/chat", json={"body": "TEST_it12 chat", "mentions": []})
        assert r.status_code in (200, 201), r.text
        msg = r.json()
        a = admin.post(f"{API}/chat/{msg['id']}/react", json={"emoji": "👍"})
        assert a.status_code == 200, a.text
        b = admin.post(f"{API}/chat/{msg['id']}/react", json={"emoji": "👍"})
        assert b.status_code == 200
        users = b.json().get("reactions", {}).get("👍", [])
        assert len(users) == len(set(users)), "duplicate reaction users"
        admin.delete(f"{API}/chat/{msg['id']}")
