"""Iteration 8 - tests for new features: label registry, list reorder perms, chat WebSocket broadcast."""
import asyncio
import json
import os

import pytest
import requests
import websockets
from dotenv import dotenv_values

fe = dotenv_values("/app/frontend/.env")
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or fe.get("REACT_APP_BACKEND_URL")).rstrip("/")
API = f"{BASE_URL}/api"
ADMIN = {"email": "admin@northstar.team", "password": "Northstar123!"}
MEMBER = {"email": "member1@northstar.team", "password": "Member123!"}


def login(creds):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json=creds)
    if r.status_code != 200:
        pytest.fail(f"Login failed {creds['email']}: {r.status_code} {r.text[:300]}")
    return s


@pytest.fixture(scope="module")
def admin_client():
    return login(ADMIN)


@pytest.fixture(scope="module")
def member_client():
    return login(MEMBER)


@pytest.fixture(scope="module")
def team_id(admin_client):
    r = admin_client.get(f"{API}/teams")
    assert r.status_code == 200
    teams = r.json()
    tb = next((t for t in teams if t["name"] == "Tim B"), None)
    assert tb, f"Tim B not found in {[t['name'] for t in teams]}"
    assert tb["my_role"] == "admin"
    return tb["id"]


# ---------- Label registry ----------
class TestLabelRegistry:
    created = []

    def test_get_labels_shape(self, admin_client, team_id):
        r = admin_client.get(f"{API}/teams/{team_id}/labels")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        for l in data:
            assert "_id" not in l and "id" in l and "name" in l and "color" in l

    def test_create_label_and_persist(self, admin_client, team_id):
        payload = {"name": "TEST_Urgent", "color": "#ef4444"}
        r = admin_client.post(f"{API}/teams/{team_id}/labels", json=payload)
        assert r.status_code == 200, r.text
        lab = r.json()
        assert "_id" not in lab
        assert lab["name"] == payload["name"] and lab["color"] == payload["color"]
        TestLabelRegistry.created.append(lab["id"])
        # GET verify persistence
        got = admin_client.get(f"{API}/teams/{team_id}/labels").json()
        assert any(x["id"] == lab["id"] and x["name"] == "TEST_Urgent" for x in got)

    def test_label_shared_across_members(self, member_client, team_id):
        got = member_client.get(f"{API}/teams/{team_id}/labels")
        assert got.status_code == 200
        assert any(x["name"] == "TEST_Urgent" for x in got.json()), "label registry not shared with member"

    def test_member_can_create_label(self, member_client, team_id):
        r = member_client.post(f"{API}/teams/{team_id}/labels", json={"name": "TEST_MemberLabel", "color": "#22c55e"})
        assert r.status_code == 200, r.text
        TestLabelRegistry.created.append(r.json()["id"])

    def test_non_member_cannot_read_labels(self, team_id):
        s = requests.Session()
        r = s.get(f"{API}/teams/{team_id}/labels")
        assert r.status_code in (401, 403)

    def test_member_cannot_delete_label(self, member_client):
        assert TestLabelRegistry.created
        r = member_client.delete(f"{API}/labels/{TestLabelRegistry.created[0]}")
        assert r.status_code == 403, f"expected 403 got {r.status_code}"

    def test_label_applied_to_task_reusable(self, admin_client, team_id):
        tasks = admin_client.get(f"{API}/teams/{team_id}/tasks").json()
        assert tasks, "no tasks in Tim B to test labels"
        t = tasks[0]
        labels = [{"name": "TEST_Urgent", "color": "#ef4444"}]
        r = admin_client.patch(f"{API}/tasks/{t['id']}", json={"labels": labels})
        assert r.status_code == 200, r.text
        assert r.json()["labels"] == labels
        got = admin_client.get(f"{API}/tasks/{t['id']}").json()
        assert got["labels"] == labels
        # cleanup label from task
        admin_client.patch(f"{API}/tasks/{t['id']}", json={"labels": t.get("labels") or []})

    def test_delete_labels_cleanup(self, admin_client, team_id):
        for lid in TestLabelRegistry.created:
            r = admin_client.delete(f"{API}/labels/{lid}")
            assert r.status_code in (200, 204, 404)
        got = admin_client.get(f"{API}/teams/{team_id}/labels").json()
        assert not [x for x in got if x["name"].startswith("TEST_")]


# ---------- List (Kanban column) reorder permissions ----------
class TestListReorder:
    def test_admin_can_reorder_lists(self, admin_client, team_id):
        lists = admin_client.get(f"{API}/teams/{team_id}/lists").json()
        assert len(lists) >= 2
        original = [(l["id"], l["order"]) for l in lists]
        reordered = list(reversed(lists))
        for i, l in enumerate(reordered):
            r = admin_client.patch(f"{API}/lists/{l['id']}", json={"order": i})
            assert r.status_code == 200, r.text
            assert r.json()["order"] == i
        after = admin_client.get(f"{API}/teams/{team_id}/lists").json()
        assert [l["id"] for l in after] == [l["id"] for l in reordered], "order not persisted/sorted"
        # restore
        for lid, order in original:
            admin_client.patch(f"{API}/lists/{lid}", json={"order": order})
        restored = admin_client.get(f"{API}/teams/{team_id}/lists").json()
        assert [l["id"] for l in restored] == [lid for lid, _ in original]

    def test_member_cannot_reorder_lists(self, member_client, admin_client, team_id):
        lists = admin_client.get(f"{API}/teams/{team_id}/lists").json()
        r = member_client.patch(f"{API}/lists/{lists[0]['id']}", json={"order": 99})
        assert r.status_code == 403, f"expected 403 got {r.status_code} {r.text[:200]}"


# ---------- Chat WebSocket real-time ----------
class TestChatWebSocket:
    def test_ws_broadcast_to_other_member(self, admin_client, member_client, team_id):
        cookie = member_client.cookies.get("access_token")
        assert cookie, "no access_token cookie for member (httpOnly login cookie missing)"
        ws_url = BASE_URL.replace("https://", "wss://").replace("http://", "ws://") + f"/api/ws/chat/{team_id}"

        async def run():
            async with websockets.connect(ws_url, additional_headers={"Cookie": f"access_token={cookie}"}) as ws:
                body = "TEST_ws_realtime_message"
                r = admin_client.post(f"{API}/teams/{team_id}/chat", json={"body": body, "mentions": []})
                assert r.status_code == 200, r.text
                raw = await asyncio.wait_for(ws.recv(), timeout=10)
                msg = json.loads(raw)
                assert msg["body"] == body
                assert "_id" not in msg
                assert msg["author"]
                return msg

        msg = asyncio.run(run())
        assert msg["team_id"] == team_id

    def test_ws_rejects_unauthenticated(self, team_id):
        ws_url = BASE_URL.replace("https://", "wss://").replace("http://", "ws://") + f"/api/ws/chat/{team_id}"

        async def run():
            try:
                async with websockets.connect(ws_url) as ws:
                    await asyncio.wait_for(ws.recv(), timeout=5)
                return "connected"
            except Exception as e:
                return f"rejected: {type(e).__name__}"

        result = asyncio.run(run())
        assert result != "connected", "unauthenticated WebSocket connection was accepted"


# ---------- Notifications ----------
class TestNotifications:
    def test_mention_creates_notification_and_read_all(self, admin_client, member_client, team_id):
        me = member_client.get(f"{API}/auth/me").json()
        tasks = admin_client.get(f"{API}/teams/{team_id}/tasks").json()
        assert tasks
        task = tasks[0]
        r = admin_client.post(f"{API}/tasks/{task['id']}/comments",
                              json={"body": f"TEST_mention @{me['name']}", "mentions": [me["id"]]})
        assert r.status_code == 200, r.text
        notif = member_client.get(f"{API}/notifications").json()
        assert notif["unread"] >= 1, notif
        items = notif["items"]
        assert any(n.get("task_id") == task["id"] for n in items), "mention notification missing task_id"
        for n in items:
            assert "_id" not in n and n.get("text")
        # mark single read
        first = items[0]
        assert member_client.patch(f"{API}/notifications/{first['id']}/read").status_code == 200
        # read all
        assert member_client.patch(f"{API}/notifications/read-all").status_code == 200
        after = member_client.get(f"{API}/notifications").json()
        assert after["unread"] == 0, after
