"""Cleanup TEST_it11_* data created during iteration 11 testing."""
import asyncio
from dotenv import dotenv_values
from motor.motor_asyncio import AsyncIOMotorClient

env = dotenv_values("/app/backend/.env")
cl = AsyncIOMotorClient(env["MONGO_URL"])
db = cl[env["DB_NAME"]]


async def main():
    lbls = await db.labels.find({"name": {"$regex": "^TEST_it11"}}, {"_id": 0}).to_list(50)
    ids = [l["id"] for l in lbls]
    for lid in ids:
        await db.tasks.update_many({}, {"$pull": {"labels": lid}})
    r = await db.labels.delete_many({"name": {"$regex": "^TEST_it11"}})
    print("deleted TEST labels:", r.deleted_count, "detached from tasks:", ids)
    r2 = await db.chat_messages.delete_many({"body": {"$regex": "^TEST_it11_"}})
    print("deleted TEST chat messages:", r2.deleted_count)
    await db.tasks.update_many({}, {"$pull": {"checklist": {"text": "TEST_it11_check"}}})
    await db.tasks.update_many({"description": "TEST_it11_notes"}, {"$set": {"description": ""}})
    print("reverted checklist/notes edits")
    r3 = await db.notifications.delete_many({"text": {"$regex": "TEST_it11_"}})
    print("deleted TEST notifications:", r3.deleted_count)
    print("remaining TEST_it11 labels:", await db.labels.count_documents({"name": {"$regex": "^TEST_it11"}}))


asyncio.run(main())
