"""Team year / archive grouping."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8000").rstrip("/")
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@fallenstar.app")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "Admin123!")


@pytest.fixture
def admin():
    session = requests.Session()
    response = session.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    if response.status_code != 200:
        pytest.skip(f"admin login failed: {response.status_code}")
    return session


def test_new_team_gets_year(admin):
    r = admin.post(f"{BASE_URL}/api/teams", json={"name": "TEST_year_current", "color": "#2879ed", "year": 2026})
    assert r.status_code == 200, r.text
    team = r.json()
    assert team["year"] == 2026
    admin.delete(f"{BASE_URL}/api/teams/{team['id']}")


def test_create_archived_year_team(admin):
    r = admin.post(f"{BASE_URL}/api/teams", json={"name": "TEST_year_archive", "color": "#20a76a", "year": 2025})
    assert r.status_code == 200, r.text
    team = r.json()
    assert team["year"] == 2025
    listed = admin.get(f"{BASE_URL}/api/teams").json()
    match = next(t for t in listed if t["id"] == team["id"])
    assert match["year"] == 2025
    patched = admin.patch(f"{BASE_URL}/api/teams/{team['id']}", json={
        "name": team["name"], "color": team["color"], "year": 2024,
    }).json()
    assert patched["year"] == 2024
    admin.delete(f"{BASE_URL}/api/teams/{team['id']}")


def test_list_teams_include_year(admin):
    teams = admin.get(f"{BASE_URL}/api/teams").json()
    assert teams
    for t in teams:
        assert isinstance(t.get("year"), int)
        assert 2000 <= t["year"] <= 2100


def test_monitoring_includes_year(admin):
    r = admin.get(f"{BASE_URL}/api/teams/tasks-monitoring")
    if r.status_code == 403:
        pytest.skip("admin cannot view monitoring")
    assert r.status_code == 200, r.text
    for row in r.json():
        assert isinstance(row.get("year"), int)
