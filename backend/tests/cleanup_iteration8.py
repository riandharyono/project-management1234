"""Cleanup helper for iteration 8 UI test data (labels, list order, task placement)."""
import requests
from dotenv import dotenv_values

BASE = dotenv_values("/app/frontend/.env")["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE}/api"
s = requests.Session()
s.post(f"{API}/auth/login", json={"email": "admin@northstar.team", "password": "Northstar123!"}).raise_for_status()
team = next(t for t in s.get(f"{API}/teams").json() if t["name"] == "Tim B")
tid = team["id"]

# remove TEST_ labels from registry and from tasks
for lab in s.get(f"{API}/teams/{tid}/labels").json():
    if lab["name"].startswith("TEST_"):
        print("delete label", lab["name"], s.delete(f"{API}/labels/{lab['id']}").status_code)
for t in s.get(f"{API}/teams/{tid}/tasks").json():
    labels = [l for l in (t.get("labels") or []) if not l["name"].startswith("TEST_")]
    if labels != (t.get("labels") or []):
        print("clean task labels", t["title"], s.patch(f"{API}/tasks/{t['id']}", json={"labels": labels}).status_code)

# restore canonical list order
desired = ["To Do List", "Dikerjakan", "Selesai", "Batal"]
lists = s.get(f"{API}/teams/{tid}/lists").json()
by_name = {l["name"]: l for l in lists}
for i, name in enumerate(desired):
    if name in by_name:
        s.patch(f"{API}/lists/{by_name[name]['id']}", json={"order": i})
print("list order restored:", [l["name"] for l in s.get(f"{API}/teams/{tid}/lists").json()])

# move Test Task back to Selesai
for t in s.get(f"{API}/teams/{tid}/tasks").json():
    if t["title"] == "Test Task" and "Selesai" in by_name:
        print("move Test Task to Selesai", s.patch(f"{API}/tasks/{t['id']}", json={"list_id": by_name["Selesai"]["id"], "order": 0}).status_code)

# delete leftover TEST_ tasks
for t in s.get(f"{API}/teams/{tid}/tasks").json():
    if t["title"].startswith("TEST_"):
        print("delete task", t["title"], s.delete(f"{API}/tasks/{t['id']}").status_code)
