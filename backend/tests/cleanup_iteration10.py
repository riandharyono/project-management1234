"""Cleanup TEST_ data created during iteration 10 testing."""
import asyncio
import datetime
from dotenv import dotenv_values
from motor.motor_asyncio import AsyncIOMotorClient

env = dotenv_values("/app/backend/.env")
cl = AsyncIOMotorClient(env["MONGO_URL"])
db = cl[env["DB_NAME"]]


async def main():
    r = await db.notifications.delete_many({"text": {"$regex": "^TEST_notif_seed_"}})
    print("deleted seeded notifications:", r.deleted_count)
    r2 = await db.chat_messages.delete_many({"body": {"$regex": "^TEST_(admin|member)_"}})
    print("deleted TEST chat messages:", r2.deleted_count)
    r3 = await db.comments.delete_many({"body": {"$regex": "^TEST_comment_regression"}})
    print("deleted TEST comments:", r3.deleted_count)
    r4 = await db.labels.delete_many({"name": {"$regex": "^TEST_"}})
    print("deleted TEST labels:", r4.deleted_count)
    r5 = await db.lists.delete_many({"name": {"$regex": "^TEST_"}})
    print("deleted TEST lists:", r5.deleted_count)
    r6 = await db.tasks.delete_many({"title": {"$regex": "^TEST_"}})
    print("deleted TEST tasks:", r6.deleted_count)
    # revert regression edits on existing task
    await db.tasks.update_many({"description": "TEST_notes_regression"}, {"$set": {"description": ""}})
    await db.tasks.update_many({"due_date": "2026-09-15"}, {"$set": {"due_date": None}})
    await db.tasks.update_many({}, {"$pull": {"checklist": {"text": "TEST_check_item"}}})
    print("reverted notes/due_date/checklist edits")


asyncio.run(main())
