"""One-off cleanup of UI test data created during iteration 5 testing."""
import os
from dotenv import dotenv_values
import requests

BASE = (dotenv_values("/app/frontend/.env")["REACT_APP_BACKEND_URL"]).rstrip("/") + "/api"


def session(email, pwd):
    s = requests.Session()
    r = s.post(f"{BASE}/auth/login", json={"email": email, "password": pwd})
    r.raise_for_status()
    return s


admin = session("admin@northstar.team", "Northstar123!")
member = session("member1@northstar.team", "Member123!")

for s, label in ((admin, "admin"), (member, "member1")):
    for team in s.get(f"{BASE}/teams").json():
        if team["name"].startswith("TEST_"):
            print(label, "delete team", team["name"], s.delete(f"{BASE}/teams/{team['id']}").status_code)
            continue
        for arch in (False, True):
            for t in s.get(f"{BASE}/teams/{team['id']}/tasks", params={"archived": arch}).json():
                if t["title"].startswith("TEST_"):
                    print(label, "delete task", t["title"], s.delete(f"{BASE}/tasks/{t['id']}").status_code)
        for arch in (False, True):
            for l in s.get(f"{BASE}/teams/{team['id']}/lists", params={"archived": arch}).json():
                if l["name"].startswith("TEST_"):
                    print(label, "delete list", l["name"], s.delete(f"{BASE}/lists/{l['id']}").status_code)
print("done")
