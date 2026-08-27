import os
import uuid

import requests
from dotenv import dotenv_values


_env_url = os.environ.get("REACT_APP_BACKEND_URL") or dotenv_values("/app/frontend/.env").get("REACT_APP_BACKEND_URL")
if not _env_url:
    raise RuntimeError("REACT_APP_BACKEND_URL is missing from the environment and /app/frontend/.env")
BASE_URL = _env_url.rstrip("/")
ADMIN_EMAIL = "admin@northstar.team"
ADMIN_PASSWORD = "Northstar123!"


def test_cors_preflight_restricts_unconfigured_origin():
    response = requests.options(
        f"{BASE_URL}/api/auth/login",
        headers={
            "Origin": "https://evil.example",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    assert response.status_code == 400
    assert response.headers.get("access-control-allow-origin") != "*"


def test_login_locks_after_five_failures_without_locking_admin():
    email = f"lockout_{uuid.uuid4().hex[:10]}@example.com"
    for _ in range(5):
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": email, "password": "Wrong123!"},
        )
        assert response.status_code == 401
    locked = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": email, "password": "Wrong123!"},
    )
    assert locked.status_code == 429
    admin = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
    )
    assert admin.status_code == 200


def test_missing_task_delete_and_member_update_return_404():
    session = requests.Session()
    login = session.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
    )
    assert login.status_code == 200
    missing_id = str(uuid.uuid4())
    deleted = session.delete(f"{BASE_URL}/api/tasks/{missing_id}")
    updated = session.patch(
        f"{BASE_URL}/api/members/{missing_id}", json={"role": "member"}
    )
    assert deleted.status_code == 404
    assert updated.status_code == 404