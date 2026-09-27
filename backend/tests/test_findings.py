"""Comment notifications to assignees + finding recap/export data."""
import os
import uuid

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8000").rstrip("/")
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@fallenstar.app")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "Admin123!")
API = f"{BASE_URL}/api"


@pytest.fixture
def admin():
    session = requests.Session()
    response = session.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    if response.status_code != 200:
        pytest.skip(f"admin login failed: {response.status_code}")
    return session


@pytest.fixture
def team(admin):
    r = admin.post(f"{API}/teams", json={
        "name": f"TEST_findings_{uuid.uuid4().hex[:6]}", "color": "#2879ed", "year": 2026, "wilayah": "Kabupaten Fakfak",
    })
    assert r.status_code == 200, r.text
    t = r.json()
    yield t
    admin.delete(f"{API}/teams/{t['id']}")


@pytest.fixture
def member(admin, team):
    email = f"test_find_{uuid.uuid4().hex[:8]}@example.com"
    created = admin.post(f"{API}/members", json={
        "name": "Temuan Member", "email": email, "password": "Member123!xx", "role": "anggota_tim",
    })
    if created.status_code == 403:
        pytest.skip("admin is not super_admin; cannot create member")
    assert created.status_code == 200, created.text
    user = created.json()
    add = admin.post(f"{API}/teams/{team['id']}/members", json={"user_id": user["id"]})
    assert add.status_code == 200, add.text
    session = requests.Session()
    login = session.post(f"{API}/auth/login", json={"email": email, "password": "Member123!xx"})
    assert login.status_code == 200, login.text
    yield session, user
    admin.delete(f"{API}/members/{user['id']}")


def _first_list(admin, team):
    lists = admin.get(f"{API}/teams/{team['id']}/lists").json()
    assert lists, "team has no lists"
    return lists[0]


def test_comment_notifies_assignees_not_author(admin, team, member):
    member_s, member_u = member
    lst = _first_list(admin, team)
    created = admin.post(f"{API}/teams/{team['id']}/tasks", json={
        "title": "TEST_comment_assignee", "list_id": lst["id"], "assignees": [member_u["id"]],
    })
    assert created.status_code == 200, created.text
    task = created.json()
    before = {n["id"] for n in member_s.get(f"{API}/notifications").json()["items"]}
    comment = admin.post(f"{API}/tasks/{task['id']}/comments", json={"body": "Tolong dicek"})
    assert comment.status_code == 200, comment.text
    assert comment.json().get("is_finding") is False
    notifs = member_s.get(f"{API}/notifications").json()["items"]
    new = [n for n in notifs if n["id"] not in before]
    assert any(n["task_id"] == task["id"] and n["type"] == "comment" for n in new), new
    admin_notifs = admin.get(f"{API}/notifications").json()["items"]
    assert not any(n.get("task_id") == task["id"] and n.get("type") == "comment" for n in admin_notifs)


def test_mention_and_assignee_do_not_double_notify(admin, team, member):
    member_s, member_u = member
    lst = _first_list(admin, team)
    created = admin.post(f"{API}/teams/{team['id']}/tasks", json={
        "title": "TEST_comment_mention", "list_id": lst["id"], "assignees": [member_u["id"]],
    })
    task = created.json()
    before = [n for n in member_s.get(f"{API}/notifications").json()["items"] if n.get("task_id") == task["id"]]
    comment = admin.post(f"{API}/tasks/{task['id']}/comments", json={
        "body": f"Halo @{member_u['name']}", "mentions": [member_u["id"]],
    })
    assert comment.status_code == 200, comment.text
    after = [n for n in member_s.get(f"{API}/notifications").json()["items"] if n.get("task_id") == task["id"]]
    new = [n for n in after if n["id"] not in {x["id"] for x in before}]
    assert len(new) == 1, new
    assert new[0]["type"] == "mention"


def test_finding_comment_appears_in_recap(admin, team, member):
    member_s, member_u = member
    lst = _first_list(admin, team)
    created = admin.post(f"{API}/teams/{team['id']}/tasks", json={
        "title": "TEST_finding_task", "list_id": lst["id"], "assignees": [member_u["id"]],
    })
    task = created.json()
    normal = admin.post(f"{API}/tasks/{task['id']}/comments", json={"body": "komentar biasa"})
    finding = admin.post(f"{API}/tasks/{task['id']}/comments", json={
        "body": "Ada kelemahan pengendalian intern", "is_finding": True,
    })
    assert normal.status_code == 200 and finding.status_code == 200, finding.text
    assert finding.json()["is_finding"] is True
    recap = admin.get(f"{API}/findings", params={"team_id": team["id"]})
    assert recap.status_code == 200, recap.text
    bodies = [i["body"] for i in recap.json()["items"]]
    assert "Ada kelemahan pengendalian intern" in bodies
    assert "komentar biasa" not in bodies
    member_recap = member_s.get(f"{API}/findings")
    assert member_recap.status_code == 200
    assert any(i["id"] == finding.json()["id"] for i in member_recap.json()["items"])
    notifs = member_s.get(f"{API}/notifications").json()["items"]
    assert any(n["task_id"] == task["id"] and n["type"] == "finding" for n in notifs)


def test_existing_comment_can_be_marked_finding_and_deleted(admin, team, member):
    member_s, member_u = member
    lst = _first_list(admin, team)
    created = admin.post(f"{API}/teams/{team['id']}/tasks", json={
        "title": "TEST_finding_toggle_delete", "list_id": lst["id"], "assignees": [member_u["id"]],
    })
    task = created.json()
    comment = admin.post(f"{API}/tasks/{task['id']}/comments", json={"body": "catatan lama"}).json()
    assert comment["is_finding"] is False
    marked = admin.patch(f"{API}/tasks/{task['id']}/comments/{comment['id']}", json={"is_finding": True})
    assert marked.status_code == 200, marked.text
    assert marked.json()["is_finding"] is True
    recap = admin.get(f"{API}/findings", params={"team_id": team["id"]}).json()
    assert any(i["id"] == comment["id"] for i in recap["items"])
    unmarked = admin.patch(f"{API}/tasks/{task['id']}/comments/{comment['id']}", json={"is_finding": False})
    assert unmarked.status_code == 200 and unmarked.json()["is_finding"] is False
    recap2 = admin.get(f"{API}/findings", params={"team_id": team["id"]}).json()
    assert not any(i["id"] == comment["id"] for i in recap2["items"])
    denied = member_s.delete(f"{API}/tasks/{task['id']}/comments/{comment['id']}")
    assert denied.status_code == 403
    deleted = admin.delete(f"{API}/tasks/{task['id']}/comments/{comment['id']}")
    assert deleted.status_code == 200, deleted.text
    listed = admin.get(f"{API}/tasks/{task['id']}/comments").json()
    assert comment["id"] not in [c["id"] for c in listed]


def test_comment_body_can_be_edited(admin, team, member):
    member_s, member_u = member
    lst = _first_list(admin, team)
    created = admin.post(f"{API}/teams/{team['id']}/tasks", json={
        "title": "TEST_comment_edit", "list_id": lst["id"], "assignees": [member_u["id"]],
    })
    task = created.json()
    comment = admin.post(f"{API}/tasks/{task['id']}/comments", json={"body": "versi awal"}).json()
    denied = member_s.patch(f"{API}/tasks/{task['id']}/comments/{comment['id']}", json={"body": "diubah member"})
    assert denied.status_code == 403
    edited = admin.patch(f"{API}/tasks/{task['id']}/comments/{comment['id']}", json={"body": "versi baru"})
    assert edited.status_code == 200, edited.text
    assert edited.json()["body"] == "versi baru"
    assert edited.json().get("edited_at")


def test_answer_and_schedule_can_be_updated(admin, team, member):
    member_s, member_u = member
    q = admin.post(f"{API}/teams/{team['id']}/questions", json={"title": "TEST_q", "body": "tanya"}).json()
    ans = member_s.post(f"{API}/questions/{q['id']}/answers", json={"body": "jawab awal"}).json()
    edited = member_s.patch(f"{API}/questions/{q['id']}/answers/{ans['id']}", json={"body": "jawab diedit"})
    assert edited.status_code == 200, edited.text
    assert edited.json()["body"] == "jawab diedit"
    denied = admin.patch(f"{API}/questions/{q['id']}/answers/{ans['id']}", json={"body": "admin ubah"})
    assert denied.status_code == 200
    deleted = member_s.delete(f"{API}/questions/{q['id']}/answers/{ans['id']}")
    assert deleted.status_code == 200
    listed = admin.get(f"{API}/teams/{team['id']}/questions").json()
    got = next(x for x in listed if x["id"] == q["id"])
    assert ans["id"] not in [a["id"] for a in got.get("answers") or []]
    sched = admin.post(f"{API}/teams/{team['id']}/question-schedules", json={
        "title": "TEST_sched", "body": "rutin", "days": [0, 2], "time": "09:00", "recipients": [member_u["id"]], "secret": False,
    }).json()
    patched = admin.patch(f"{API}/question-schedules/{sched['id']}", json={"time": "14:30", "days": [1, 3]})
    assert patched.status_code == 200, patched.text
    assert patched.json()["time"] == "14:30"
    assert patched.json()["days"] == [1, 3]
