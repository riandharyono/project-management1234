import os
import uuid

import pytest
import requests


BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
ADMIN_EMAIL = "admin@northstar.team"
ADMIN_PASSWORD = "Northstar123!"


@pytest.fixture
def admin():
    session = requests.Session()
    response = session.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert response.status_code == 200, response.text
    assert response.json()["role"] == "admin"
    return session


def test_auth_me_and_logout():
    session = requests.Session()
    login = session.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert login.status_code == 200
    assert {c.name for c in login.cookies} >= {"access_token", "refresh_token"}
    assert "HttpOnly" in login.headers.get("set-cookie", "")
    me = session.get(f"{BASE_URL}/api/auth/me")
    assert me.status_code == 200 and me.json()["email"] == ADMIN_EMAIL
    logout = session.post(f"{BASE_URL}/api/auth/logout")
    assert logout.status_code == 200
    assert session.get(f"{BASE_URL}/api/auth/me").status_code == 401


def test_protected_endpoints_require_auth():
    for path in ["/dashboard", "/tasks", "/members", "/search?q=x"]:
        response = requests.get(f"{BASE_URL}/api{path}")
        assert response.status_code == 401, (path, response.text)


def test_invalid_login_and_duplicate_register():
    bad = requests.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": "wrong-password"})
    assert bad.status_code == 401 and "detail" in bad.json()
    duplicate = requests.post(f"{BASE_URL}/api/auth/register", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert duplicate.status_code == 409


def test_register_member_and_role_permission(admin):
    email = f"test_{uuid.uuid4().hex[:8]}@example.com"
    member = requests.Session()
    response = member.post(f"{BASE_URL}/api/auth/register", json={"email": email, "password": "Member123!"})
    assert response.status_code == 200 and response.json()["role"] == "member"
    member_id = response.json()["id"]
    denied = member.patch(f"{BASE_URL}/api/members/{member_id}", json={"role": "admin"})
    assert denied.status_code == 403
    allowed = admin.patch(f"{BASE_URL}/api/members/{member_id}", json={"role": "admin"})
    assert allowed.status_code == 200 and allowed.json()["ok"] is True


def test_task_comment_search_update_delete_and_dashboard(admin):
    payload = {"title": "TEST_api_task", "description": "UniqueSearchPhrase", "status": "To Do", "priority": "High", "due_date": "2026-07-01", "assignees": [], "labels": ["qa"]}
    created = admin.post(f"{BASE_URL}/api/tasks", json=payload)
    assert created.status_code == 200 and created.json()["title"] == payload["title"]
    task_id = created.json()["id"]
    fetched = admin.get(f"{BASE_URL}/api/tasks").json()
    assert any(t["id"] == task_id and t["labels"] == ["qa"] for t in fetched)
    comment = admin.post(f"{BASE_URL}/api/tasks/{task_id}/comments", json={"body": "TEST_comment"})
    assert comment.status_code == 200 and comment.json()["task_id"] == task_id
    assert any(c["body"] == "TEST_comment" for c in admin.get(f"{BASE_URL}/api/tasks/{task_id}/comments").json())
    search = admin.get(f"{BASE_URL}/api/search", params={"q": "UniqueSearchPhrase"})
    assert search.status_code == 200 and any(t["id"] == task_id for t in search.json()["tasks"])
    updated = dict(payload, title="TEST_api_task_updated", status="Done")
    assert admin.patch(f"{BASE_URL}/api/tasks/{task_id}", json=updated).status_code == 200
    assert any(t["id"] == task_id and t["status"] == "Done" for t in admin.get(f"{BASE_URL}/api/tasks").json())
    dashboard = admin.get(f"{BASE_URL}/api/dashboard")
    assert dashboard.status_code == 200 and "counts" in dashboard.json()
    assert admin.delete(f"{BASE_URL}/api/tasks/{task_id}").status_code == 200
    assert not any(t["id"] == task_id for t in admin.get(f"{BASE_URL}/api/tasks").json())