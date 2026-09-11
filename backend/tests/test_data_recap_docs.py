"""Document-level wilayah / year / type for data recap."""
import os
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
        "name": "TEST_recap_docs", "color": "#2879ed", "year": 2026, "wilayah": "Kabupaten Fakfak",
    })
    assert r.status_code == 200, r.text
    t = r.json()
    yield t
    admin.delete(f"{API}/teams/{t['id']}")


def test_pusat_does_not_inherit_team_wilayah(admin, team):
    pemda = admin.post(f"{API}/teams/{team['id']}/data-requests", json={
        "name": "LKPD", "sheets": ["Keuangan"], "doc_year": 2024, "doc_type": "LKPD",
        "scope": "pemda", "wilayah": "Kabupaten Fakfak", "year": 2026,
    })
    assert pemda.status_code == 200, pemda.text
    pusat = admin.post(f"{API}/teams/{team['id']}/data-requests", json={
        "name": "PP 54 Tahun 2025", "sheets": ["Kepatuhan"], "doc_year": 2025,
        "doc_type": "Peraturan pusat", "scope": "pusat", "year": 2026,
    })
    assert pusat.status_code == 200, pusat.text
    assert pusat.json()["scope"] == "pusat"
    assert pusat.json()["wilayah_label"] == "Pusat / umum"
    assert pusat.json()["wilayah"] in (None, "")

    recap = admin.get(f"{API}/data-recap", params={"year": 2026})
    assert recap.status_code == 200, recap.text
    body = recap.json()
    labels = body.get("wilayahs") or []
    assert "Pusat / umum" in labels
    pusat_items = [i for i in body.get("items") or [] if i.get("scope") == "pusat" and "pp 54" in (i.get("name") or "").lower()]
    assert pusat_items, body.get("items")
    assert all(i["wilayah"] == "Pusat / umum" for i in pusat_items)

    fakfak = [i for i in body.get("items") or [] if i.get("name") == "LKPD" and i.get("wilayah") == "Kabupaten Fakfak"]
    assert fakfak
    assert fakfak[0]["doc_year"] == 2024
    assert fakfak[0]["doc_type"] == "LKPD"


def test_same_pusat_doc_merges_across_name_key(admin, team):
    for _ in range(2):
        r = admin.post(f"{API}/teams/{team['id']}/data-requests", json={
            "name": "Permendagri 23 Tahun 2020", "doc_year": 2020, "doc_type": "Peraturan pusat",
            "scope": "pusat", "year": 2026,
        })
        assert r.status_code == 200, r.text
    recap = admin.get(f"{API}/data-recap", params={"year": 2026}).json()
    matches = [i for i in recap.get("items") or [] if "permendagri 23" in (i.get("name") or "").lower() and i.get("doc_year") == 2020]
    assert len(matches) == 1
    assert matches[0]["wilayah"] == "Pusat / umum"
