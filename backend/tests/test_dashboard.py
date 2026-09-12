"""GET /api/dashboard — HQ command center payload."""
import os

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@fallenstar.app")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "Admin123!")


@pytest.fixture
def session():
    if not BASE_URL:
        pytest.skip("REACT_APP_BACKEND_URL not set")
    s = requests.Session()
    response = s.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    if response.status_code != 200:
        pytest.skip(f"login failed: {response.status_code}")
    return s


def test_dashboard_requires_auth():
    if not BASE_URL:
        pytest.skip("REACT_APP_BACKEND_URL not set")
    r = requests.get(f"{BASE_URL}/api/dashboard")
    assert r.status_code == 401


def test_dashboard_shape(session):
    r = session.get(f"{BASE_URL}/api/dashboard")
    assert r.status_code == 200, r.text
    body = r.json()
    for key in ("year", "years", "kpis", "counts", "attention", "teams", "deadlines", "mine"):
        assert key in body
    for k in ("teams", "overdue_tasks", "due_today", "data_pending", "data_unavailable", "deadlines_overdue", "unassigned"):
        assert k in body["kpis"]
        assert isinstance(body["kpis"][k], int)
    assert isinstance(body["attention"], list)
    assert isinstance(body["teams"], list)
    assert set(body["mine"]) >= {"overdue", "today", "upcoming", "mentions"}
    all_years = session.get(f"{BASE_URL}/api/dashboard", params={"all_years": True})
    assert all_years.status_code == 200
    assert all_years.json().get("all_years") is True
