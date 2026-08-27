"""Cleanup of TEST_ seed data created by iteration 9 testing."""
import asyncio
import os
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv(Path(__file__).resolve().parents[1] / ".env")
db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]

DEFAULT_ORDER = {"To Do List": 0, "Dikerjakan": 1, "Selesai": 2, "Batal": 3}


async def main():
    r = await db.chat_messages.delete_many({"body": {"$regex": "^TEST_"}})
    print("chat_messages removed:", r.deleted_count)
    r = await db.announcements.delete_many({"title": {"$regex": "^TEST_"}})
    print("announcements removed:", r.deleted_count)
    r = await db.notifications.delete_many({"text": {"$regex": "TEST_"}})
    print("notifications removed:", r.deleted_count)
    r = await db.tasks.delete_many({"title": {"$regex": "^TEST_"}})
    print("tasks removed:", r.deleted_count)
    r = await db.labels.delete_many({"name": {"$regex": "^TEST_"}})
    print("labels removed:", r.deleted_count)

    # temp users created for permission tests
    temp = await db.users.find({"email": {"$regex": "^test_plain_"}}, {"_id": 0}).to_list(50)
    for u in temp:
        await db.team_members.delete_many({"user_id": u["id"]})
    r = await db.users.delete_many({"email": {"$regex": "^test_plain_"}})
    print("temp users removed:", r.deleted_count)
    r = await db.login_attempts.delete_many({"identifier": {"$regex": "^test_lockout_"}})
    print("lockout records removed:", r.deleted_count)

    # restore default list order changed by drag-reorder regression test
    for name, order in DEFAULT_ORDER.items():
        await db.lists.update_many({"name": name}, {"$set": {"order": order}})
    lists = await db.lists.find({}, {"_id": 0}).sort("order", 1).to_list(50)
    print("list order restored:", [(l["name"], l["order"]) for l in lists])

    # unassign the member added by the notification regression test
    member = await db.users.find_one({"email": "member1@northstar.team"}, {"_id": 0})
    if member:
        r = await db.tasks.update_many({"title": "Test Task"}, {"$pull": {"assignees": member["id"]}})
        print("assignee cleanup on 'Test Task':", r.modified_count)

    for coll in ("chat_messages", "tasks", "labels", "announcements"):
        left = await db[coll].count_documents({})
        print(coll, "remaining docs:", left)


asyncio.run(main())
