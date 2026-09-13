from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, UploadFile, File, Query, WebSocket, WebSocketDisconnect
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr
from typing import Optional, List
from pathlib import Path
from datetime import datetime, timezone, timedelta
import os, uuid, bcrypt, jwt, logging, re, mimetypes, asyncio, base64, json, html as html_lib
from pywebpush import webpush, WebPushException
from url_safety import normalize_http_url

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

def _env_flag(name, default=False):
    raw = os.environ.get(name, "").strip().lower()
    if not raw:
        return default
    return raw in ("1", "true", "yes", "on")

# Swagger/OpenAPI off by default. Set ENABLE_DOCS=true only on a local/dev box.
ENABLE_DOCS = _env_flag("ENABLE_DOCS")
app = FastAPI(
    title="Project Management API",
    docs_url="/docs" if ENABLE_DOCS else None,
    redoc_url="/redoc" if ENABLE_DOCS else None,
    openapi_url="/openapi.json" if ENABLE_DOCS else None,
)
api = APIRouter(prefix="/api")
JWT_ALGORITHM = "HS256"
APP_NAME = os.environ["APP_NAME"]
MAX_LOGIN_ATTEMPTS = 10
MIN_NEW_PASSWORD_LENGTH = 12
MAX_PASSWORD_LENGTH = 128

ROLE_SUPER_ADMIN = "super_admin"
ROLE_KOORWAS = "koorwas"
ROLE_KETUA_TIM = "ketua_tim"
ROLE_ANGGOTA_TIM = "anggota_tim"
USER_ROLES = [ROLE_SUPER_ADMIN, ROLE_KOORWAS, ROLE_KETUA_TIM, ROLE_ANGGOTA_TIM]
ROLES_CAN_CREATE_TEAM = {ROLE_SUPER_ADMIN, ROLE_KETUA_TIM}
ROLES_VIEW_ALL_TEAMS = {ROLE_SUPER_ADMIN, ROLE_KOORWAS}

STORAGE_DIR = Path(os.environ.get("STORAGE_DIR") or ROOT_DIR / "storage").resolve()
STORAGE_DIR.mkdir(parents=True, exist_ok=True)

def _resolve_object_path(path):
    full_path = (STORAGE_DIR / path).resolve()
    if full_path != STORAGE_DIR and STORAGE_DIR not in full_path.parents:
        raise HTTPException(400, "Path tidak valid")
    return full_path

def put_object(path, data, content_type):
    full_path = _resolve_object_path(path)
    full_path.parent.mkdir(parents=True, exist_ok=True)
    full_path.write_bytes(data)
    return {"path": path, "size": len(data)}

def get_object(path):
    full_path = _resolve_object_path(path)
    if not full_path.is_file(): raise HTTPException(404, "File tidak ditemukan di storage")
    content_type = mimetypes.guess_type(full_path.name)[0] or "application/octet-stream"
    return full_path.read_bytes(), content_type

WIB = timezone(timedelta(hours=7))
def now(): return datetime.now(timezone.utc).isoformat()
def current_year(): return datetime.now(WIB).year
def infer_team_year(team):
    y = team.get("year") if isinstance(team, dict) else None
    try:
        y = int(y)
        if 2000 <= y <= 2100: return y
    except (TypeError, ValueError):
        pass
    created = (team or {}).get("created_at") or ""
    if len(created) >= 4 and created[:4].isdigit():
        y = int(created[:4])
        if 2000 <= y <= 2100: return y
    return current_year()
def with_team_year(team):
    team = dict(team)
    team["year"] = infer_team_year(team)
    return team
def public_user(user):
    user = dict(user); user.pop("password_hash", None); user.pop("_id", None); return user
def hash_password(value): return bcrypt.hashpw(value.encode(), bcrypt.gensalt()).decode()
def verify_password(value, hashed): return bcrypt.checkpw(value.encode(), hashed.encode())
def token(user_id, email, kind="access", days=0):
    expiry = datetime.now(timezone.utc) + (timedelta(days=days) if days else timedelta(minutes=15))
    return jwt.encode({"sub": user_id, "email": email, "type": kind, "exp": expiry}, os.environ["JWT_SECRET"], algorithm=JWT_ALGORITHM)

async def current_user(request: Request):
    raw = request.cookies.get("access_token")
    if not raw and request.headers.get("Authorization", "").startswith("Bearer "): raw = request.headers["Authorization"][7:]
    if not raw: raise HTTPException(401, "Silakan masuk terlebih dahulu")
    try:
        payload = jwt.decode(raw, os.environ["JWT_SECRET"], algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access": raise HTTPException(401, "Sesi tidak valid")
        user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
        if not user: raise HTTPException(401, "Pengguna tidak ditemukan")
        return user
    except jwt.ExpiredSignatureError: raise HTTPException(401, "Sesi kedaluwarsa")
    except jwt.InvalidTokenError: raise HTTPException(401, "Sesi tidak valid")

notif_connections: dict = {}

async def broadcast_notif(user_id, payload):
    for ws in list(notif_connections.get(user_id, [])):
        try: await ws.send_json(payload)
        except Exception: pass

VAPID_PRIVATE_KEY = os.environ.get("VAPID_PRIVATE_KEY") or None
VAPID_CLAIMS_BASE = {"sub": f"mailto:{os.environ.get('VAPID_CONTACT_EMAIL', 'admin@example.com')}"}

async def send_push(user_id, title, body, url="/"):
    if not VAPID_PRIVATE_KEY: return
    subs = await db.push_subscriptions.find({"user_id": user_id}, {"_id": 0}).to_list(20)
    for sub in subs:
        try:
            # webpush() does a blocking HTTP call with no timeout of its own. Run it off
            # the event loop with a hard timeout — otherwise a slow/unreachable push
            # endpoint freezes the single worker for every user, not just this request.
            await asyncio.wait_for(asyncio.to_thread(
                webpush, subscription_info=sub["subscription"], data=json.dumps({"title": title, "body": body, "url": url}),
                vapid_private_key=VAPID_PRIVATE_KEY, vapid_claims=dict(VAPID_CLAIMS_BASE), timeout=10,
            ), timeout=15)
        except asyncio.TimeoutError:
            logging.error("push failed: timed out")
        except WebPushException as e:
            if getattr(e.response, "status_code", None) in (404, 410):
                await db.push_subscriptions.delete_one({"endpoint": sub["endpoint"]})
            else:
                logging.error(f"push failed: {e}")
        except Exception as e:
            logging.error(f"push failed (unexpected): {e}")

def _notif_url(type_, team_id=None, task_id=None):
    # Mirrors the tab-selection order in the frontend's openNotification() so a
    # clicked push notification lands in the same place as clicking it in-app.
    if not team_id: return "/"
    if type_ == "announcement": return f"/?team={team_id}&tab=announcements"
    if type_ in ("answer", "question"): return f"/?team={team_id}&tab=questions"
    if task_id: return f"/?team={team_id}&tab=tasks&task={task_id}"
    return f"/?team={team_id}"

async def notify(user_id, type_, text, team_id=None, task_id=None):
    if not user_id: return
    doc = {"id": str(uuid.uuid4()), "user_id": user_id, "type": type_, "text": text, "team_id": team_id, "task_id": task_id, "read": False, "created_at": now()}
    await db.notifications.insert_one(doc)
    unread = await db.notifications.count_documents({"user_id": user_id, "read": False})
    doc.pop("_id", None)
    await broadcast_notif(user_id, {"type": "notification", "item": doc, "unread": unread})
    await send_push(user_id, NOTIF_PUSH_TITLES.get(type_, "Notifikasi Baru"), text, url=_notif_url(type_, team_id, task_id))

async def log_activity(task_id, user, action, detail="", team_id=None):
    doc = {
        "id": str(uuid.uuid4()), "task_id": task_id, "team_id": team_id,
        "user_id": user["id"], "user_name": user.get("name") or "",
        "action": action, "detail": detail, "created_at": now(),
    }
    await db.task_activity.insert_one(doc)
    doc.pop("_id", None)
    return doc

NOTIF_PUSH_TITLES = {"mention": "Anda Disebut", "announcement": "Pengumuman Baru", "answer": "Pertanyaan Dijawab",
                      "assignment": "Ditugaskan ke Anda", "deadline": "Tenggat Tugas", "question": "Pertanyaan Rutin",
                      "data_status": "Status Data"}

async def user_from_token(raw):
    if not raw: return None
    try:
        payload = jwt.decode(raw, os.environ["JWT_SECRET"], algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access": return None
        return await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
    except jwt.PyJWTError:
        return None

async def team_role(team_id, user_id):
    m = await db.team_members.find_one({"team_id": team_id, "user_id": user_id}, {"_id": 0})
    return m["role"] if m else None

def can_create_team(user): return user.get("role") in ROLES_CAN_CREATE_TEAM
def can_view_all_teams(user): return user.get("role") in ROLES_VIEW_ALL_TEAMS

async def require_member(team_id, user):
    role = await team_role(team_id, user["id"])
    if role: return role
    if user.get("role") == ROLE_SUPER_ADMIN: return "admin"
    if user.get("role") == ROLE_KOORWAS: return "member"
    raise HTTPException(403, "Anda bukan anggota tim ini")

async def require_admin(team_id, user):
    role = await require_member(team_id, user)
    if role != "admin": raise HTTPException(403, "Hanya admin tim yang dapat melakukan ini")
    return role

async def can_access_team(team_id, user_id):
    if await team_role(team_id, user_id): return True
    u = await db.users.find_one({"id": user_id}, {"_id": 0, "role": 1})
    return bool(u) and u.get("role") in ROLES_VIEW_ALL_TEAMS

def task_visible(task, user, role):
    return role == "admin" or not task.get("is_private") or task.get("created_by") == user["id"] or user["id"] in task.get("assignees", [])

async def load_team_members(team_id):
    rows = await db.team_members.find({"team_id": team_id}, {"_id": 0}).to_list(200)
    if not rows:
        return []
    user_ids = [r["user_id"] for r in rows]
    users = {u["id"]: public_user(u) for u in await db.users.find({"id": {"$in": user_ids}}, {"_id": 0}).to_list(200)}
    return [{**users[r["user_id"]], "team_role": r["role"]} for r in rows if r["user_id"] in users]

# ---------- models ----------
class Credentials(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=MAX_PASSWORD_LENGTH)
class ProfileUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
class PasswordUpdate(BaseModel):
    current_password: str = Field(min_length=1, max_length=MAX_PASSWORD_LENGTH)
    new_password: str = Field(min_length=MIN_NEW_PASSWORD_LENGTH, max_length=MAX_PASSWORD_LENGTH)
class TeamInput(BaseModel):
    name: str = Field(min_length=1)
    color: str = "#2879ed"
    year: Optional[int] = Field(default=None, ge=2000, le=2100)
    wilayah: Optional[str] = Field(default=None, max_length=160)
    laporan_deadline: Optional[str] = None
    kke_deadline: Optional[str] = None
    laporan_link: Optional[str] = None
    kke_link: Optional[str] = None
    kertas_link: Optional[str] = None
class SuratDefaultsInput(BaseModel):
    penerima_surat: str = ""
    nomor_surat_tugas: str = ""
    perihal: str = ""
    link_upload: str = ""
    jabatan: str = ""
    bidang: str = ""
    nama: str = ""
    nip: str = ""
    tanda_tangan: str = ""
    pic_nama: str = ""
    pic_wa: str = ""
class ListInput(BaseModel):
    name: str = Field(min_length=1)
class ListPatch(BaseModel):
    name: Optional[str] = None
    order: Optional[int] = None
    archived: Optional[bool] = None
    is_done: Optional[bool] = None
    is_cancelled: Optional[bool] = None
class TaskCreate(BaseModel):
    title: str = Field(min_length=1)
    description: str = ""
    list_id: str
    priority: str = "Medium"
    start_date: Optional[str] = None
    due_date: Optional[str] = None
    due_time: Optional[str] = None
    repeat: str = "none"
    assignees: List[str] = []
    labels: List[str] = []
    is_private: bool = False
    data_request_ids: List[str] = []
    title_color: str = ""
    title_size: str = "md"
    title_html: str = ""
class TaskDuplicate(BaseModel):
    title: Optional[str] = None
    target_team_id: Optional[str] = None
    target_list_id: Optional[str] = None
    keep_labels: bool = True
    keep_assignees: bool = True
    keep_checklist: bool = True
    keep_attachments: bool = True
class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    team_id: Optional[str] = None
    list_id: Optional[str] = None
    order: Optional[int] = None
    priority: Optional[str] = None
    start_date: Optional[str] = None
    due_date: Optional[str] = None
    due_time: Optional[str] = None
    repeat: Optional[str] = None
    assignees: Optional[List[str]] = None
    labels: Optional[List[str]] = None
    is_private: Optional[bool] = None
    archived: Optional[bool] = None
    cover: Optional[str] = None
    checklist: Optional[List[dict]] = None
    description_mentions: Optional[List[str]] = None
    data_request_ids: Optional[List[str]] = None
    title_color: Optional[str] = None
    title_size: Optional[str] = None
    title_html: Optional[str] = Field(default=None, max_length=8000)
class CommentInput(BaseModel):
    body: str = Field(min_length=1)
    mentions: List[str] = []
class LinkAttachmentInput(BaseModel):
    name: str = ""
    url: str = Field(min_length=1)
class MemberUpdate(BaseModel): role: str
class MemberPasswordUpdate(BaseModel):
    new_password: str = Field(min_length=MIN_NEW_PASSWORD_LENGTH, max_length=MAX_PASSWORD_LENGTH)
class MemberAdd(BaseModel): user_id: str
class MemberCreate(BaseModel):
    name: str = Field(min_length=1)
    email: EmailStr
    password: str = Field(min_length=MIN_NEW_PASSWORD_LENGTH, max_length=MAX_PASSWORD_LENGTH)
    role: str = ROLE_ANGGOTA_TIM
class AnnouncementInput(BaseModel):
    title: str = Field(min_length=1)
    body: str = ""
    mentions: List[str] = []
class AnnouncementPatch(BaseModel):
    title: Optional[str] = None
    body: Optional[str] = None
    mentions: Optional[List[str]] = None
class QuestionInput(BaseModel):
    title: str = Field(min_length=1)
    body: str = ""
    mentions: List[str] = []
class QuestionPatch(BaseModel):
    title: Optional[str] = None
    body: Optional[str] = None
    mentions: Optional[List[str]] = None
class AnswerInput(BaseModel): body: str = Field(min_length=1)
class QuestionScheduleInput(BaseModel):
    title: str = Field(min_length=1)
    body: str = ""
    days: List[int] = Field(min_length=1)  # 0=Senin .. 6=Minggu
    time: str = Field(pattern=r"^\d{2}:\d{2}$")
    recipients: List[str] = []
    secret: bool = False
class LabelInput(BaseModel):
    name: str = Field(min_length=1)
    color: str = "#2879ed"
class LabelPatch(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
class DocumentPatch(BaseModel):
    folder: Optional[str] = None
class DataRequestCreate(BaseModel):
    name: str = Field(min_length=1)
    sheets: List[str] = []
    status: str = "diminta"
    pic: str = ""
    notes: str = ""
    year: Optional[int] = Field(default=None, ge=2000, le=2100)
    doc_year: Optional[int] = Field(default=None, ge=1900, le=2100)
    doc_type: str = Field(default="", max_length=120)
    scope: str = "pemda"
    wilayah: Optional[str] = Field(default=None, max_length=160)
class DataRequestPatch(BaseModel):
    name: Optional[str] = None
    sheets: Optional[List[str]] = None
    status: Optional[str] = None
    pic: Optional[str] = None
    notes: Optional[str] = None
    year: Optional[int] = Field(default=None, ge=2000, le=2100)
    doc_year: Optional[int] = Field(default=None, ge=1900, le=2100)
    doc_type: Optional[str] = Field(default=None, max_length=120)
    scope: Optional[str] = None
    wilayah: Optional[str] = Field(default=None, max_length=160)
class ApplyYearInput(BaseModel):
    year: int = Field(ge=2000, le=2100)
class RenameSheetInput(BaseModel):
    from_name: str = Field(min_length=1, max_length=120)
    to_name: str = Field(min_length=1, max_length=120)
class DataPackageItemIn(BaseModel):
    name: str = Field(min_length=1, max_length=240)
    doc_type: str = Field(default="", max_length=120)
    scope: str = "pemda"
    sheets: List[str] = []
    notes: str = ""
class DataPackageIn(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    description: str = Field(default="", max_length=400)
    items: List[DataPackageItemIn] = []
class ApplyPackageInput(BaseModel):
    package_id: str
    doc_year: Optional[int] = Field(default=None, ge=1900, le=2100)

DEFAULT_LISTS = ["Belum dikerjakan", "Dikerjakan", "Selesai", "Batal"]
TASK_TITLE_COLORS = {"", "#dc6863", "#ec9a2b", "#20a76a", "#2879ed", "#8b5cf6"}
TASK_TITLE_SIZES = {"sm", "md", "lg"}

def plain_from_html(s):
    text = re.sub(r"<[^>]+>", " ", s or "")
    text = html_lib.unescape(text)
    return re.sub(r"\s+", " ", text).strip()

DATA_STATUS_LABELS = {
    "diminta": "Diminta",
    "diterima_sebagian": "diterima sebagian",
    "diterima_lengkap": "diterima lengkap",
    "tidak_tersedia": "tidak tersedia",
    "tidak_relevan": "tidak relevan",
}

async def notify_linked_tasks_data_status(item, old_status, new_status, actor):
    if old_status == new_status or not new_status:
        return
    tasks = await db.tasks.find(
        {"data_request_ids": item["id"], "archived": {"$ne": True}},
        {"_id": 0, "id": 1, "team_id": 1, "assignees": 1, "created_by": 1, "title": 1},
    ).to_list(200)
    label = DATA_STATUS_LABELS.get(new_status, new_status)
    text = f"Data \"{item.get('name') or ''}\" sekarang {label}"
    actor_id = (actor or {}).get("id")
    for t in tasks:
        recipients = set(t.get("assignees") or [])
        if t.get("created_by"):
            recipients.add(t["created_by"])
        recipients.discard(actor_id)
        for uid in recipients:
            await notify(uid, "data_status", f"{text} (tugas: {t.get('title') or ''})", team_id=t.get("team_id"), task_id=t["id"])

def normalize_title_style(color=None, size=None):
    out = {}
    if color is not None:
        c = (color or "").strip().lower()
        out["title_color"] = c if c in TASK_TITLE_COLORS else ""
    if size is not None:
        s = (size or "md").strip().lower()
        out["title_size"] = s if s in TASK_TITLE_SIZES else "md"
    return out
DATA_REQUEST_STATUSES = ["diminta", "diterima_sebagian", "diterima_lengkap", "tidak_tersedia", "tidak_relevan"]
DATA_REQUEST_RECEIVED_STATUSES = {"diterima_sebagian", "diterima_lengkap"}
DATA_REQUEST_SCOPES = ["pemda", "pusat"]
NO_SHEET_LABEL = "(Tanpa klasifikasi)"
NO_WILAYAH_LABEL = "(Tanpa wilayah)"
PUSAT_WILAYAH_LABEL = "Pusat / umum"
NO_DOC_TYPE_LABEL = "(Tanpa jenis)"
WEAK_STATUS_RANK = ["diminta", "diterima_sebagian", "tidak_tersedia", "tidak_relevan", "diterima_lengkap"]

def team_wilayah(team):
    w = ((team or {}).get("wilayah") or "").strip()
    return w or NO_WILAYAH_LABEL

def item_scope(item):
    s = ((item or {}).get("scope") or "pemda").strip().lower()
    return s if s in DATA_REQUEST_SCOPES else "pemda"

def normalize_scope(scope):
    s = (scope or "pemda").strip().lower()
    return s if s in DATA_REQUEST_SCOPES else "pemda"

def infer_item_year(item, team=None):
    y = (item or {}).get("year")
    try:
        y = int(y)
        if 2000 <= y <= 2100:
            return y
    except (TypeError, ValueError):
        pass
    return infer_team_year(team or {})

def infer_doc_year(item, team=None):
    y = (item or {}).get("doc_year")
    try:
        y = int(y)
        if 1900 <= y <= 2100:
            return y
    except (TypeError, ValueError):
        pass
    return infer_team_year(team or {})

def item_wilayah(item, team=None):
    if item_scope(item) == "pusat":
        return PUSAT_WILAYAH_LABEL
    w = ((item or {}).get("wilayah") or "").strip()
    if w:
        return w
    return team_wilayah(team)

def item_doc_type(item):
    return ((item or {}).get("doc_type") or "").strip()

def decorate_data_request(item, team=None):
    if not item:
        return item
    item["year"] = infer_item_year(item, team)
    item["doc_year"] = infer_doc_year(item, team)
    item["scope"] = item_scope(item)
    item["doc_type"] = item_doc_type(item)
    stored = ((item.get("wilayah") or "").strip()) or None
    item["wilayah"] = None if item["scope"] == "pusat" else stored
    item["wilayah_label"] = item_wilayah(item, team)
    return item

def weakest_status(counts):
    for s in WEAK_STATUS_RANK:
        if counts.get(s):
            return s
    return "diminta"

def _region_sort_key(label):
    if label == PUSAT_WILAYAH_LABEL:
        return (0, "")
    if label in (NO_WILAYAH_LABEL, NO_DOC_TYPE_LABEL, NO_SHEET_LABEL):
        return (2, "")
    return (1, str(label).lower())

def normalize_data_name(name):
    s = (name or "").strip().lower()
    s = re.sub(r"[\s\u00a0]+", " ", s)
    s = re.sub(r"[\"'`]+", "", s)
    return s.strip()

def _most_common_name(names):
    counts = {}
    for n in names:
        counts[n] = counts.get(n, 0) + 1
    return sorted(counts.items(), key=lambda kv: (-kv[1], -len(kv[0]), kv[0]))[0][0]

async def seed_admin():
    await db.users.create_index("email", unique=True)
    email, password = os.environ["ADMIN_EMAIL"].lower(), os.environ["ADMIN_PASSWORD"]
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if not existing:
        # One-time bootstrap only — deliberately never re-syncs the password on later
        # startups, otherwise any password change (self-service or a manual DB reset)
        # gets silently reverted to ADMIN_PASSWORD on the next restart/deploy.
        await db.users.insert_one({"id": str(uuid.uuid4()), "email": email, "name": "Workspace Admin", "role": ROLE_SUPER_ADMIN, "password_hash": hash_password(password), "created_at": now()})

async def migrate_user_roles():
    await db.users.update_many({"role": "admin"}, {"$set": {"role": ROLE_SUPER_ADMIN}})
    await db.users.update_many({"$or": [{"role": "member"}, {"role": {"$exists": False}}]}, {"$set": {"role": ROLE_ANGGOTA_TIM}})

async def create_team_internal(name, color, owner, laporan_deadline=None, kke_deadline=None, laporan_link=None, kke_link=None, year=None, wilayah=None, kertas_link=None):
    team = {"id": str(uuid.uuid4()), "name": name, "color": color, "created_by": owner["id"], "created_at": now(),
            "year": year if year is not None else current_year(),
            "wilayah": (wilayah or "").strip() or None,
            "laporan_deadline": laporan_deadline, "kke_deadline": kke_deadline,
            "laporan_link": laporan_link, "kke_link": kke_link, "kertas_link": kertas_link}
    await db.teams.insert_one(team)
    await db.team_members.insert_one({"id": str(uuid.uuid4()), "team_id": team["id"], "user_id": owner["id"], "role": "admin", "joined_at": now()})
    for i, name_ in enumerate(DEFAULT_LISTS):
        await db.lists.insert_one({"id": str(uuid.uuid4()), "team_id": team["id"], "name": name_, "order": i, "archived": False,
                                     "is_done": name_ == "Selesai", "is_cancelled": name_ == "Batal", "created_at": now()})
    team.pop("_id", None)
    return team

async def purge_team(team_id):
    task_ids = [t["id"] async for t in db.tasks.find({"team_id": team_id}, {"_id": 0, "id": 1})]
    if task_ids:
        await db.comments.delete_many({"task_id": {"$in": task_ids}})
        await db.task_activity.delete_many({"task_id": {"$in": task_ids}})
    for coll in ["tasks", "lists", "team_members", "announcements", "questions", "documents", "labels", "data_requests"]:
        await db[coll].delete_many({"team_id": team_id})
    await db.notifications.delete_many({"team_id": team_id})
    await db.teams.delete_one({"id": team_id})

async def purge_member_created_teams():
    creator_ids = {u["id"] for u in await db.users.find({"role": {"$in": list(ROLES_CAN_CREATE_TEAM)}}, {"_id": 0, "id": 1}).to_list(1000)}
    teams = await db.teams.find({}, {"_id": 0, "id": 1, "created_by": 1, "name": 1}).to_list(1000)
    removed = 0
    for t in teams:
        creator = t.get("created_by")
        if creator and creator not in creator_ids:
            await purge_team(t["id"])
            removed += 1
            logging.info("Removed team created by a role without team-creation rights: %s (%s)", t.get("name"), t["id"])
    return removed

async def migrate_legacy_tasks():
    admin = await db.users.find_one({"email": os.environ["ADMIN_EMAIL"].lower()}, {"_id": 0})
    if not admin: return
    if await db.teams.count_documents({}) == 0:
        await create_team_internal("Tim B", "#2879ed", admin)
    legacy = await db.tasks.find({"team_id": {"$exists": False}}, {"_id": 0}).to_list(1000)
    if not legacy: return
    team = await db.teams.find_one({}, {"_id": 0})
    lists = await db.lists.find({"team_id": team["id"]}, {"_id": 0}).sort("order", 1).to_list(20)
    status_map = {"To Do": lists[0]["id"], "In Progress": lists[1]["id"], "Review": lists[1]["id"], "Done": lists[2]["id"]}
    for i, t in enumerate(legacy):
        await db.tasks.update_one({"id": t["id"]}, {"$set": {
            "team_id": team["id"], "list_id": status_map.get(t.get("status"), lists[0]["id"]), "order": i,
            "repeat": "none", "checklist": t.get("checklist") or [], "attachments": [], "cover": None,
            "is_private": False, "archived": False, "created_by_name": admin.get("name", "Admin")
        }, "$unset": {"status": ""}})

async def migrate_task_labels():
    cursor = db.tasks.find({"labels": {"$elemMatch": {"$type": "object"}}}, {"_id": 0})
    async for task in cursor:
        ids = []
        for label in task.get("labels", []):
            if not isinstance(label, dict):
                ids.append(label); continue
            existing = await db.labels.find_one({"team_id": task["team_id"], "name": label.get("name"), "color": label.get("color")}, {"_id": 0})
            if not existing:
                existing = {"id": str(uuid.uuid4()), "team_id": task["team_id"], "name": label.get("name", "Label"), "color": label.get("color", "#2879ed"), "created_at": now()}
                await db.labels.insert_one(dict(existing))
            ids.append(existing["id"])
        await db.tasks.update_one({"id": task["id"]}, {"$set": {"labels": ids}})

async def migrate_list_done_flag():
    await db.lists.update_many({"is_done": {"$exists": False}, "name": "Selesai"}, {"$set": {"is_done": True}})
    await db.lists.update_many({"is_done": {"$exists": False}}, {"$set": {"is_done": False}})
    await db.lists.update_many({"is_cancelled": {"$exists": False}, "name": "Batal"}, {"$set": {"is_cancelled": True}})
    await db.lists.update_many({"is_cancelled": {"$exists": False}}, {"$set": {"is_cancelled": False}})

async def migrate_team_years():
    async for t in db.teams.find({"$or": [{"year": {"$exists": False}}, {"year": None}]}):
        await db.teams.update_one({"id": t["id"]}, {"$set": {"year": infer_team_year(t)}})

async def migrate_data_request_years():
    teams = {t["id"]: t async for t in db.teams.find({}, {"_id": 0, "id": 1, "year": 1, "created_at": 1})}
    async for it in db.data_requests.find({"$or": [{"year": {"$exists": False}}, {"year": None}]}):
        await db.data_requests.update_one({"id": it["id"]}, {"$set": {"year": infer_item_year(it, teams.get(it.get("team_id")))}})

async def migrate_data_request_doc_attrs():
    teams = {t["id"]: t async for t in db.teams.find({}, {"_id": 0, "id": 1, "year": 1, "created_at": 1, "wilayah": 1})}
    query = {"$or": [
        {"scope": {"$exists": False}},
        {"doc_year": {"$exists": False}},
        {"doc_type": {"$exists": False}},
        {"wilayah": {"$exists": False}},
    ]}
    async for it in db.data_requests.find(query):
        updates = {}
        if it.get("scope") not in DATA_REQUEST_SCOPES:
            updates["scope"] = "pemda"
        scope = updates.get("scope") or it.get("scope") or "pemda"
        if scope != "pusat" and not (it.get("wilayah") or "").strip():
            tw = ((teams.get(it.get("team_id")) or {}).get("wilayah") or "").strip()
            if tw:
                updates["wilayah"] = tw
        if it.get("doc_year") is None:
            updates["doc_year"] = infer_item_year(it, teams.get(it.get("team_id")))
        if "doc_type" not in it:
            updates["doc_type"] = ""
        if updates:
            await db.data_requests.update_one({"id": it["id"]}, {"$set": updates})

async def seed_data_packages():
    if await db.data_packages.count_documents({}) > 0:
        return
    await db.data_packages.insert_one({
        "id": str(uuid.uuid4()),
        "name": "PKPT Kabupaten",
        "description": "Paket awal permintaan data penugasan kabupaten. Tahun dokumen diisi saat paket dipakai.",
        "items": [
            {"name": "LKPD", "doc_type": "LKPD", "scope": "pemda", "sheets": ["Keuangan"], "notes": ""},
            {"name": "LHP BPK", "doc_type": "Laporan", "scope": "pemda", "sheets": ["Keuangan"], "notes": ""},
            {"name": "RPJMD", "doc_type": "Dokumen perencanaan", "scope": "pemda", "sheets": [], "notes": ""},
            {"name": "Renstra OPD", "doc_type": "Dokumen perencanaan", "scope": "pemda", "sheets": [], "notes": ""},
            {"name": "Data realisasi kinerja", "doc_type": "Data statistik", "scope": "pemda", "sheets": [], "notes": ""},
            {"name": "Peraturan pusat terkait", "doc_type": "Peraturan pusat", "scope": "pusat", "sheets": [], "notes": ""},
        ],
        "created_at": now(),
    })

def can_manage_data_packages(user):
    return can_create_team(user) or can_view_all_teams(user)

def _package_public(doc):
    if not doc:
        return doc
    doc.pop("_id", None)
    return doc

async def migrate_data_request_year_to_team():
    """Assignment year follows the team; leftover per-item years (e.g. 2027) were recap bugs."""
    teams = {t["id"]: infer_team_year(t) async for t in db.teams.find({}, {"_id": 0, "id": 1, "year": 1, "created_at": 1})}
    async for it in db.data_requests.find({}, {"_id": 0, "id": 1, "team_id": 1, "year": 1}):
        ty = teams.get(it.get("team_id"))
        if ty is None:
            continue
        try:
            current = int(it["year"]) if it.get("year") is not None else None
        except (TypeError, ValueError):
            current = None
        if current != ty:
            await db.data_requests.update_one({"id": it["id"]}, {"$set": {"year": ty}})

_scheduler_task = None
_reminder_task = None

def _warn_if_default_secrets():
    if os.environ.get("JWT_SECRET", "").startswith("dev-local-secret"):
        logging.warning("SECURITY: JWT_SECRET masih memakai nilai default development — wajib diganti sebelum production.")
    if os.environ.get("ADMIN_PASSWORD") == "Admin123!":
        logging.warning("SECURITY: ADMIN_PASSWORD masih memakai nilai default development — wajib diganti sebelum production.")
    if not mongo_url.strip().startswith("mongodb://localhost") and "@" not in mongo_url:
        logging.warning("SECURITY: MONGO_URL menunjuk ke host non-localhost tanpa kredensial — pastikan MongoDB punya autentikasi.")

@app.on_event("startup")
async def startup():
    _warn_if_default_secrets()
    await seed_admin()
    await migrate_user_roles()
    await db.tasks.create_index("team_id")
    await db.tasks.create_index([("team_id", 1), ("archived", 1), ("order", 1)])
    await db.lists.create_index([("team_id", 1), ("archived", 1), ("order", 1)])
    await db.labels.create_index("team_id")
    await db.task_activity.create_index("task_id")
    await db.comments.create_index("task_id")
    await db.login_attempts.create_index("identifier")
    await db.team_members.create_index([("team_id", 1), ("user_id", 1)], unique=True)
    await db.team_members.create_index("user_id")
    await db.notifications.create_index([("user_id", 1), ("read", 1), ("created_at", -1)])
    await migrate_legacy_tasks()
    await migrate_task_labels()
    await migrate_list_done_flag()
    await migrate_team_years()
    await migrate_data_request_years()
    await migrate_data_request_doc_attrs()
    await migrate_data_request_year_to_team()
    await seed_data_packages()
    await purge_member_created_teams()
    global _scheduler_task, _reminder_task
    _scheduler_task = asyncio.create_task(question_scheduler_loop())
    _reminder_task = asyncio.create_task(deadline_reminder_loop())

# ---------- auth ----------
# Public self-registration is intentionally disabled — accounts are created by a workspace
# admin via POST /api/members (see "global members" section below).

@api.post("/auth/login")
async def login(data: Credentials, response: Response):
    email = str(data.email).lower()
    identifier = f"{email}"
    attempt = await db.login_attempts.find_one({"identifier": identifier}, {"_id": 0})
    if attempt and attempt.get("locked_until", "") > now(): raise HTTPException(429, "Terlalu banyak percobaan. Coba lagi beberapa menit.")
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user or not verify_password(data.password, user["password_hash"]):
        failures = (attempt or {}).get("failures", 0) + 1
        locked_until = (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat() if failures >= MAX_LOGIN_ATTEMPTS else ""
        await db.login_attempts.update_one({"identifier": identifier}, {"$set": {"identifier": identifier, "failures": failures, "locked_until": locked_until}}, upsert=True)
        if failures >= MAX_LOGIN_ATTEMPTS: raise HTTPException(429, "Terlalu banyak percobaan. Coba lagi beberapa menit.")
        raise HTTPException(401, f"Email atau password salah (percobaan ke-{failures} dari {MAX_LOGIN_ATTEMPTS})")
    await db.login_attempts.delete_one({"identifier": identifier})
    response.set_cookie("access_token", token(user["id"], user["email"]), httponly=True, secure=True, samesite="none", max_age=900)
    response.set_cookie("refresh_token", token(user["id"], user["email"], "refresh", 7), httponly=True, secure=True, samesite="none", max_age=604800)
    return public_user(user)

@api.post("/auth/refresh")
async def refresh(request: Request, response: Response):
    raw = request.cookies.get("refresh_token")
    if not raw: raise HTTPException(401, "Sesi tidak valid")
    try:
        payload = jwt.decode(raw, os.environ["JWT_SECRET"], algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "refresh": raise HTTPException(401, "Sesi tidak valid")
    except jwt.ExpiredSignatureError: raise HTTPException(401, "Sesi kedaluwarsa")
    except jwt.InvalidTokenError: raise HTTPException(401, "Sesi tidak valid")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
    if not user: raise HTTPException(401, "Pengguna tidak ditemukan")
    response.set_cookie("access_token", token(user["id"], user["email"]), httponly=True, secure=True, samesite="none", max_age=900)
    return public_user(user)

@api.post("/auth/logout")
async def logout(response: Response, user=Depends(current_user)):
    response.delete_cookie("access_token"); response.delete_cookie("refresh_token"); return {"ok": True}

@api.get("/auth/me")
async def me(user=Depends(current_user)): return public_user(user)

@api.patch("/auth/me")
async def update_me(data: ProfileUpdate, user=Depends(current_user)):
    name = data.name.strip()
    if not name: raise HTTPException(400, "Nama tidak boleh kosong")
    await db.users.update_one({"id": user["id"]}, {"$set": {"name": name}})
    user["name"] = name
    return public_user(user)

@api.patch("/auth/password")
async def update_password(data: PasswordUpdate, user=Depends(current_user)):
    if not verify_password(data.current_password, user["password_hash"]):
        raise HTTPException(400, "Password saat ini salah")
    await db.users.update_one({"id": user["id"]}, {"$set": {"password_hash": hash_password(data.new_password)}})
    return {"ok": True}

@api.post("/auth/me/avatar")
async def upload_avatar(file: UploadFile = File(...), user=Depends(current_user)):
    if file.content_type not in INLINE_SAFE_TYPES:
        raise HTTPException(400, "Foto profil harus berformat PNG, JPEG, GIF, atau WEBP")
    data = await file.read()
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, f"Ukuran file melebihi batas maksimum {MAX_UPLOAD_BYTES // (1024 * 1024)}MB")
    ext = re.sub(r"[^A-Za-z0-9]", "", file.filename.rsplit(".", 1)[-1])[:10] or "bin" if "." in file.filename else "bin"
    path = f"{APP_NAME}/uploads/{user['id']}/{uuid.uuid4()}.{ext}"
    result = put_object(path, data, file.content_type)
    record = {"id": str(uuid.uuid4()), "storage_path": result["path"], "original_filename": file.filename,
              "content_type": file.content_type, "size": result.get("size", len(data)),
              "is_deleted": False, "uploaded_by": user["id"], "uploaded_by_name": user["name"], "created_at": now()}
    await db.files.insert_one(record)
    await db.users.update_one({"id": user["id"]}, {"$set": {"avatar": record["id"]}})
    user["avatar"] = record["id"]
    return public_user(user)

@api.delete("/auth/me/avatar")
async def remove_avatar(user=Depends(current_user)):
    await db.users.update_one({"id": user["id"]}, {"$unset": {"avatar": ""}})
    user.pop("avatar", None)
    return public_user(user)

# ---------- teams ----------
@api.get("/teams")
async def list_teams(user=Depends(current_user)):
    memberships = await db.team_members.find({"user_id": user["id"]}, {"_id": 0}).to_list(200)
    role_by_team = {m["team_id"]: m["role"] for m in memberships}
    if can_view_all_teams(user):
        teams = await db.teams.find({}, {"_id": 0}).to_list(1000)
        default_role = "admin" if user.get("role") == ROLE_SUPER_ADMIN else "member"
    else:
        if not memberships:
            return []
        teams = await db.teams.find({"id": {"$in": list(role_by_team.keys())}}, {"_id": 0}).to_list(200)
        default_role = "member"
    team_ids = [t["id"] for t in teams]
    counts = await db.team_members.aggregate([
        {"$match": {"team_id": {"$in": team_ids}}},
        {"$group": {"_id": "$team_id", "n": {"$sum": 1}}},
    ]).to_list(200)
    count_map = {c["_id"]: c["n"] for c in counts}
    result = [{**with_team_year(t), "my_role": role_by_team.get(t["id"], default_role), "member_count": count_map.get(t["id"], 0)} for t in teams]
    result.sort(key=lambda t: (-int(t.get("year") or 0), t.get("created_at") or ""))
    return result

async def _visible_team_ids(user):
    memberships = await db.team_members.find({"user_id": user["id"]}, {"_id": 0}).to_list(200)
    if can_view_all_teams(user):
        return None, memberships
    return [m["team_id"] for m in memberships], memberships

@api.get("/wilayahs")
async def list_wilayahs(user=Depends(current_user)):
    team_ids, memberships = await _visible_team_ids(user)
    if team_ids is None:
        teams = await db.teams.find({}, {"_id": 0, "wilayah": 1}).to_list(1000)
        item_q = {"scope": {"$ne": "pusat"}, "wilayah": {"$nin": [None, ""]}}
    else:
        if not memberships:
            return []
        teams = await db.teams.find({"id": {"$in": team_ids}}, {"_id": 0, "wilayah": 1}).to_list(200)
        item_q = {"team_id": {"$in": team_ids}, "scope": {"$ne": "pusat"}, "wilayah": {"$nin": [None, ""]}}
    names = {(t.get("wilayah") or "").strip() for t in teams if (t.get("wilayah") or "").strip()}
    async for it in db.data_requests.find(item_q, {"_id": 0, "wilayah": 1}):
        w = (it.get("wilayah") or "").strip()
        if w and w != PUSAT_WILAYAH_LABEL:
            names.add(w)
    return sorted(names, key=str.lower)

@api.get("/doc-types")
async def list_doc_types(user=Depends(current_user)):
    team_ids, memberships = await _visible_team_ids(user)
    if team_ids is None:
        item_q = {"doc_type": {"$nin": [None, ""]}}
    else:
        if not memberships:
            return []
        item_q = {"team_id": {"$in": team_ids}, "doc_type": {"$nin": [None, ""]}}
    names = set()
    async for it in db.data_requests.find(item_q, {"_id": 0, "doc_type": 1}):
        t = (it.get("doc_type") or "").strip()
        if t:
            names.add(t)
    return sorted(names, key=str.lower)

@api.post("/teams")
async def create_team(data: TeamInput, user=Depends(current_user)):
    if not can_create_team(user):
        raise HTTPException(403, "Role Anda tidak dapat membuat tim")
    team = await create_team_internal(
        data.name, data.color, user, data.laporan_deadline, data.kke_deadline,
        normalize_http_url(data.laporan_link, "Link laporan"),
        normalize_http_url(data.kke_link, "Link KKE"),
        data.year, data.wilayah,
        normalize_http_url(data.kertas_link, "Link kertas kerja"),
    )
    return {**with_team_year(team), "my_role": "admin", "member_count": 1}

def _task_progress_fraction(task, lst):
    if lst and lst.get("is_done"): return 1.0
    if lst and lst.get("is_cancelled"): return 0.0
    bits = []
    for c in task.get("checklist") or []:
        bits.append(bool(c.get("done")))
        for s in c.get("subitems") or []:
            bits.append(bool(s.get("done")))
    return (sum(bits) / len(bits)) if bits else 0.0

DATA_STATUS_SHORT = {
    "diminta": "Diminta",
    "diterima_sebagian": "Sebagian",
    "tidak_tersedia": "Tidak tersedia",
    "diterima_lengkap": "Lengkap",
    "tidak_relevan": "Tidak relevan",
}

def _empty_dashboard(year, years, scope="mine"):
    kpis = {
        "teams": 0, "overdue_tasks": 0, "due_today": 0, "data_pending": 0,
        "data_unavailable": 0, "deadlines_overdue": 0, "unassigned": 0,
    }
    return {
        "year": year, "years": years or [current_year()], "all_years": year is None,
        "scope": scope, "kpis": kpis, "counts": kpis, "attention": [], "teams": [],
        "deadlines": [], "mine": {"overdue": [], "today": [], "upcoming": [], "mentions": []},
    }

def _dash_task_preview(task, team, lst):
    return {
        "id": task.get("id"), "title": task.get("title") or "", "team_id": team.get("id"),
        "team_name": team.get("name"), "team_color": team.get("color"),
        "list_name": (lst or {}).get("name"), "due_date": task.get("due_date") or "",
        "priority": task.get("priority") or "", "is_done": False, "is_cancelled": False,
    }

@api.get("/dashboard")
async def workspace_dashboard(year: Optional[int] = None, all_years: bool = False, user=Depends(current_user)):
    """One-page HQ: KPIs, exceptions, team health, personal work, upcoming deadlines."""
    scope = "all" if can_view_all_teams(user) else "mine"
    team_ids_filter, memberships = await _visible_team_ids(user)
    role_by_team = {m["team_id"]: m["role"] for m in memberships}
    if team_ids_filter is None:
        teams = await db.teams.find({}, {"_id": 0}).to_list(1000)
        default_role = "admin" if user.get("role") == ROLE_SUPER_ADMIN else "member"
    else:
        if not memberships:
            return _empty_dashboard(None if all_years else (year or current_year()), [current_year()], scope)
        teams = await db.teams.find({"id": {"$in": team_ids_filter}}, {"_id": 0}).to_list(200)
        default_role = "member"
    teams = [with_team_year(t) for t in teams]
    years = sorted({t["year"] for t in teams} | {current_year()}, reverse=True)
    if all_years:
        chosen = None
        visible = teams
    else:
        chosen = year if year is not None else current_year()
        if chosen not in years:
            years = sorted({*years, chosen}, reverse=True)
        visible = [t for t in teams if t["year"] == chosen]
    if not visible:
        return _empty_dashboard(chosen, years, scope)

    ids = [t["id"] for t in visible]
    team_map = {t["id"]: t for t in visible}
    lists_by_id = {l["id"]: l async for l in db.lists.find({"team_id": {"$in": ids}}, {"_id": 0})}
    tasks = await db.tasks.find({"team_id": {"$in": ids}, "archived": False}, {"_id": 0}).to_list(50000)
    data_items = await db.data_requests.find({"team_id": {"$in": ids}}, {"_id": 0}).to_list(50000)

    today = datetime.now(WIB).date()
    today_iso = today.isoformat()
    horizon = (today + timedelta(days=14)).isoformat()
    uid = user["id"]

    buckets = {
        tid: {
            "task_total": 0, "task_done": 0, "task_progress": 0.0, "task_overdue": 0,
            "due_today": 0, "unassigned": 0, "data_total": 0, "data_complete": 0,
            "data_pending": 0, "data_unavailable": 0,
        } for tid in ids
    }
    overdue_tasks, data_flags, mine_overdue, mine_today, mine_upcoming, deadlines = [], [], [], [], [], []

    for task in tasks:
        team = team_map.get(task.get("team_id"))
        if not team:
            continue
        role = role_by_team.get(task["team_id"], default_role)
        if not task_visible(task, user, role):
            continue
        lst = lists_by_id.get(task.get("list_id"))
        st = buckets[team["id"]]
        st["task_total"] += 1
        st["task_progress"] += _task_progress_fraction(task, lst)
        done = bool(lst and lst.get("is_done"))
        cancelled = bool(lst and lst.get("is_cancelled"))
        if done:
            st["task_done"] += 1
        open_task = not done and not cancelled
        due = task.get("due_date") or ""
        assignees = task.get("assignees") or []
        if open_task and not assignees:
            st["unassigned"] += 1
        if open_task and due and due < today_iso:
            st["task_overdue"] += 1
            overdue_tasks.append(_dash_task_preview(task, team, lst))
        if open_task and due == today_iso:
            st["due_today"] += 1
        if open_task and uid in assignees:
            item = _dash_task_preview(task, team, lst)
            if due and due < today_iso:
                mine_overdue.append(item)
            elif due == today_iso:
                mine_today.append(item)
            elif due and due <= horizon:
                mine_upcoming.append(item)
        if open_task and due and due <= horizon and (scope == "all" or uid in assignees):
            deadlines.append({
                "kind": "task", "title": task.get("title") or "", "date": due,
                "team_id": team["id"], "team_name": team.get("name"),
                "team_color": team.get("color"), "overdue": due < today_iso,
                "task_id": task.get("id"), "tab": "tasks",
            })

    for it in data_items:
        team = team_map.get(it.get("team_id"))
        if not team:
            continue
        st = buckets[team["id"]]
        st["data_total"] += 1
        status = it.get("status") if it.get("status") in DATA_REQUEST_STATUSES else "diminta"
        if status == "diterima_lengkap":
            st["data_complete"] += 1
        elif status in ("diminta", "diterima_sebagian"):
            st["data_pending"] += 1
        elif status == "tidak_tersedia":
            st["data_unavailable"] += 1
        if status in ("tidak_tersedia", "diminta", "diterima_sebagian"):
            data_flags.append({
                "kind": "data", "tone": "danger" if status == "tidak_tersedia" else "warning",
                "title": it.get("name") or "Permintaan data",
                "detail": f"{DATA_STATUS_SHORT.get(status, status)} · {team.get('name')}",
                "team_id": team["id"], "team_name": team.get("name"),
                "tab": "data-requests", "status": status,
            })

    attention = []
    deadlines_overdue = 0
    for t in visible:
        st = buckets[t["id"]]
        for kind, label, field in (("laporan", "Upload Laporan", "laporan_deadline"), ("kke", "KKE", "kke_deadline")):
            d = t.get(field) or ""
            if not d:
                continue
            overdue = d < today_iso
            if overdue:
                deadlines_overdue += 1
                attention.append({
                    "kind": "deadline", "tone": "danger", "title": f"{label} lewat tenggat",
                    "detail": t.get("name"), "date": d, "team_id": t["id"],
                    "team_name": t.get("name"), "tab": "overview",
                })
            if overdue or d <= horizon:
                deadlines.append({
                    "kind": kind, "title": f"{label} · {t.get('name')}", "date": d,
                    "team_id": t["id"], "team_name": t.get("name"),
                    "team_color": t.get("color"), "overdue": overdue, "tab": "overview",
                })
        if st["unassigned"]:
            attention.append({
                "kind": "unassigned", "tone": "warning",
                "title": f"{st['unassigned']} tugas tanpa PIC",
                "detail": t.get("name"), "team_id": t["id"], "team_name": t.get("name"), "tab": "tasks",
            })

    overdue_tasks.sort(key=lambda x: x.get("due_date") or "")
    for item in overdue_tasks[:8]:
        attention.append({
            "kind": "task", "tone": "danger", "title": item["title"],
            "detail": item.get("team_name") or "", "date": item.get("due_date"),
            "team_id": item.get("team_id"), "team_name": item.get("team_name"),
            "task_id": item.get("id"), "tab": "tasks",
        })
    data_flags.sort(key=lambda x: (0 if x["status"] == "tidak_tersedia" else 1, x["title"]))
    attention.extend(data_flags[:8])
    rank = {"deadline": 0, "task": 1, "data": 2, "unassigned": 3}
    attention.sort(key=lambda a: (rank.get(a["kind"], 9), a.get("date") or "9999"))
    attention = attention[:20]

    team_rows = []
    for t in visible:
        st = buckets[t["id"]]
        total = st["task_total"]
        task_pct = round((st["task_progress"] / total) * 100) if total else 0
        data_pct = round((st["data_complete"] / st["data_total"]) * 100) if st["data_total"] else 0
        lap_over = bool(t.get("laporan_deadline") and t["laporan_deadline"] < today_iso)
        kke_over = bool(t.get("kke_deadline") and t["kke_deadline"] < today_iso)
        team_rows.append({
            "team_id": t["id"], "team_name": t.get("name"), "team_color": t.get("color"),
            "wilayah": t.get("wilayah") or "", "year": t.get("year"),
            "task_total": total, "task_done": st["task_done"], "task_pct": task_pct,
            "task_overdue": st["task_overdue"], "unassigned": st["unassigned"],
            "data_total": st["data_total"], "data_complete": st["data_complete"],
            "data_pct": data_pct, "data_pending": st["data_pending"],
            "data_unavailable": st["data_unavailable"],
            "laporan_deadline": t.get("laporan_deadline"), "kke_deadline": t.get("kke_deadline"),
            "laporan_overdue": lap_over, "kke_overdue": kke_over,
        })
    team_rows.sort(key=lambda r: (
        0 if (r["laporan_overdue"] or r["kke_overdue"]) else 1,
        -r["task_overdue"], -r["data_unavailable"], r["task_pct"], r["data_pct"],
        r["team_name"] or "",
    ))

    kpis = {
        "teams": len(visible),
        "overdue_tasks": sum(b["task_overdue"] for b in buckets.values()),
        "due_today": sum(b["due_today"] for b in buckets.values()),
        "data_pending": sum(b["data_pending"] for b in buckets.values()),
        "data_unavailable": sum(b["data_unavailable"] for b in buckets.values()),
        "deadlines_overdue": deadlines_overdue,
        "unassigned": sum(b["unassigned"] for b in buckets.values()),
    }
    mine_overdue.sort(key=lambda t: t.get("due_date") or "")
    mine_today.sort(key=lambda t: t.get("title") or "")
    mine_upcoming.sort(key=lambda t: t.get("due_date") or "")
    deadlines.sort(key=lambda d: (0 if d.get("overdue") else 1, d.get("date") or "9999"))
    mentions = await db.notifications.find(
        {"user_id": uid, "type": "mention", "read": False}, {"_id": 0}
    ).sort("created_at", -1).to_list(8)
    return {
        "year": chosen, "years": years, "all_years": all_years, "scope": scope,
        "kpis": kpis, "counts": kpis, "attention": attention, "teams": team_rows,
        "deadlines": deadlines[:16],
        "mine": {
            "overdue": mine_overdue[:15], "today": mine_today[:15],
            "upcoming": mine_upcoming[:8], "mentions": mentions,
        },
    }

@api.get("/teams/tasks-monitoring")
async def tasks_monitoring(user=Depends(current_user)):
    if not can_view_all_teams(user): raise HTTPException(403, "Tidak diizinkan mengakses ringkasan ini")
    teams = await db.teams.find({}, {"_id": 0}).to_list(1000)
    team_ids = [t["id"] for t in teams]
    lists_by_id = {l["id"]: l async for l in db.lists.find({"team_id": {"$in": team_ids}}, {"_id": 0})}
    tasks = await db.tasks.find({"team_id": {"$in": team_ids}, "archived": False}, {"_id": 0}).to_list(50000)
    by_team = {}
    for t in tasks:
        by_team.setdefault(t["team_id"], []).append(t)
    today = datetime.now(timezone(timedelta(hours=7))).date().isoformat()
    result = []
    for t in teams:
        rows = by_team.get(t["id"], [])
        total = len(rows)
        progress_sum, done_count, overdue_count = 0.0, 0, 0
        for task in rows:
            lst = lists_by_id.get(task.get("list_id"))
            progress_sum += _task_progress_fraction(task, lst)
            if lst and lst.get("is_done"): done_count += 1
            elif not (lst and lst.get("is_cancelled")):
                due = task.get("due_date")
                if due and due < today: overdue_count += 1
        pct = round((progress_sum / total) * 100) if total else 0
        result.append({"team_id": t["id"], "team_name": t["name"], "team_color": t.get("color"),
                        "total": total, "done": done_count, "overdue": overdue_count,
                        "pct_complete": pct, "created_at": t.get("created_at"), "year": infer_team_year(t),
                        "laporan_deadline": t.get("laporan_deadline"), "kke_deadline": t.get("kke_deadline"),
                        "laporan_link": t.get("laporan_link"), "kke_link": t.get("kke_link")})
    result.sort(key=lambda r: (r["pct_complete"], -r["total"]))
    return result

@api.get("/teams/members-monitoring")
async def members_monitoring(user=Depends(current_user)):
    if not can_view_all_teams(user):
        raise HTTPException(403, "Tidak diizinkan mengakses ringkasan ini")
    teams = await db.teams.find({}, {"_id": 0}).to_list(1000)
    team_map = {t["id"]: t for t in teams}
    team_ids = list(team_map)
    lists_by_id = {l["id"]: l async for l in db.lists.find({"team_id": {"$in": team_ids}}, {"_id": 0})}
    tasks = await db.tasks.find({"team_id": {"$in": team_ids}, "archived": False}, {"_id": 0}).to_list(50000)
    memberships = await db.team_members.find({"team_id": {"$in": team_ids}}, {"_id": 0}).to_list(5000)
    user_ids = list({m["user_id"] for m in memberships})
    users = {u["id"]: u async for u in db.users.find({"id": {"$in": user_ids}}, {"_id": 0, "id": 1, "name": 1, "avatar": 1})}
    today = datetime.now(timezone(timedelta(hours=7))).date().isoformat()
    by_team = {}
    for t in tasks:
        by_team.setdefault(t["team_id"], []).append(t)
    unassigned = []
    for tid, tlist in by_team.items():
        team = team_map.get(tid)
        if not team:
            continue
        n = 0
        for task in tlist:
            lst = lists_by_id.get(task.get("list_id"))
            if lst and (lst.get("is_done") or lst.get("is_cancelled")):
                continue
            if not (task.get("assignees") or []):
                n += 1
        if n:
            unassigned.append({"team_id": tid, "team_name": team.get("name"), "count": n, "year": infer_team_year(team)})
    rows = []
    for m in memberships:
        team = team_map.get(m["team_id"])
        if not team:
            continue
        uid = m["user_id"]
        u = users.get(uid) or {}
        assigned = [t for t in by_team.get(m["team_id"], []) if uid in (t.get("assignees") or [])]
        done = overdue = open_n = 0
        progress_sum = 0.0
        for task in assigned:
            lst = lists_by_id.get(task.get("list_id"))
            progress_sum += _task_progress_fraction(task, lst)
            if lst and lst.get("is_done"):
                done += 1
            elif not (lst and lst.get("is_cancelled")):
                open_n += 1
                due = task.get("due_date")
                if due and due < today:
                    overdue += 1
        total = len(assigned)
        rows.append({
            "user_id": uid, "user_name": u.get("name") or "", "user_avatar": u.get("avatar"),
            "team_id": m["team_id"], "team_name": team.get("name"), "team_color": team.get("color"),
            "year": infer_team_year(team), "total": total, "done": done, "open": open_n,
            "overdue": overdue, "pct_complete": round((progress_sum / total) * 100) if total else 0,
        })
    rows.sort(key=lambda r: (-r["overdue"], -r["open"], r["pct_complete"], r["user_name"] or ""))
    unassigned.sort(key=lambda r: -r["count"])
    return {"members": rows, "unassigned": unassigned}

@api.get("/teams/{team_id}")
async def get_team(team_id: str, user=Depends(current_user)):
    role = await require_member(team_id, user)
    team = await db.teams.find_one({"id": team_id}, {"_id": 0})
    if not team: raise HTTPException(404, "Tim tidak ditemukan")
    return {**with_team_year(team), "my_role": role}

@api.patch("/teams/{team_id}")
async def update_team(team_id: str, data: TeamInput, user=Depends(current_user)):
    await require_admin(team_id, user)
    fields = {
        "name": data.name, "color": data.color,
        "laporan_deadline": data.laporan_deadline, "kke_deadline": data.kke_deadline,
        "laporan_link": normalize_http_url(data.laporan_link, "Link laporan"),
        "kke_link": normalize_http_url(data.kke_link, "Link KKE"),
        "kertas_link": normalize_http_url(data.kertas_link, "Link kertas kerja"),
    }
    if data.year is not None:
        fields["year"] = data.year
    if data.wilayah is not None:
        fields["wilayah"] = data.wilayah.strip() or None
    await db.teams.update_one({"id": team_id}, {"$set": fields})
    team = await db.teams.find_one({"id": team_id}, {"_id": 0})
    return with_team_year(team) if team else team

@api.delete("/teams/{team_id}")
async def delete_team(team_id: str, user=Depends(current_user)):
    await require_admin(team_id, user)
    await purge_team(team_id)
    return {"ok": True}

@api.get("/teams/{team_id}/members")
async def team_members_list(team_id: str, user=Depends(current_user)):
    await require_member(team_id, user)
    return await load_team_members(team_id)

@api.get("/teams/{team_id}/board")
async def get_team_board(team_id: str, user=Depends(current_user)):
    role = await require_member(team_id, user)
    lists, tasks, members, labels = await asyncio.gather(
        db.lists.find({"team_id": team_id, "archived": False}, {"_id": 0}).sort("order", 1).to_list(100),
        db.tasks.find({"team_id": team_id, "archived": False}, {"_id": 0}).sort("order", 1).to_list(1000),
        load_team_members(team_id),
        db.labels.find({"team_id": team_id}, {"_id": 0}).sort("created_at", 1).to_list(200),
    )
    return {
        "lists": lists,
        "tasks": await with_linked_data_requests([t for t in tasks if task_visible(t, user, role)]),
        "members": members,
        "labels": labels,
    }

@api.get("/teams/{team_id}/available-members")
async def available_members(team_id: str, user=Depends(current_user)):
    await require_member(team_id, user)
    existing = {m["user_id"] async for m in db.team_members.find({"team_id": team_id}, {"_id": 0})}
    return [public_user(u) async for u in db.users.find({"id": {"$nin": list(existing)}}, {"_id": 0})]

@api.post("/teams/{team_id}/members")
async def add_team_member(team_id: str, data: MemberAdd, user=Depends(current_user)):
    await require_admin(team_id, user)
    if await db.team_members.find_one({"team_id": team_id, "user_id": data.user_id}): raise HTTPException(409, "Sudah menjadi anggota")
    await db.team_members.insert_one({"id": str(uuid.uuid4()), "team_id": team_id, "user_id": data.user_id, "role": "member", "joined_at": now()})
    team = await db.teams.find_one({"id": team_id}, {"_id": 0})
    await notify(data.user_id, "team_add", f"Anda ditambahkan ke tim {team['name']}", team_id=team_id)
    return {"ok": True}

@api.patch("/teams/{team_id}/members/{member_id}")
async def update_team_member(team_id: str, member_id: str, data: MemberUpdate, user=Depends(current_user)):
    await require_admin(team_id, user)
    if data.role not in ["admin", "member"]: raise HTTPException(400, "Role tidak valid")
    result = await db.team_members.update_one({"team_id": team_id, "user_id": member_id}, {"$set": {"role": data.role}})
    if not result.matched_count: raise HTTPException(404, "Anggota tidak ditemukan")
    return {"ok": True}

@api.delete("/teams/{team_id}/members/{member_id}")
async def remove_team_member(team_id: str, member_id: str, user=Depends(current_user)):
    await require_admin(team_id, user)
    await db.team_members.delete_one({"team_id": team_id, "user_id": member_id})
    return {"ok": True}

# ---------- lists ----------
@api.get("/teams/{team_id}/lists")
async def get_lists(team_id: str, archived: bool = False, user=Depends(current_user)):
    await require_member(team_id, user)
    return await db.lists.find({"team_id": team_id, "archived": archived}, {"_id": 0}).sort("order", 1).to_list(100)

@api.post("/teams/{team_id}/lists")
async def create_list(team_id: str, data: ListInput, user=Depends(current_user)):
    await require_admin(team_id, user)
    count = await db.lists.count_documents({"team_id": team_id})
    item = {"id": str(uuid.uuid4()), "team_id": team_id, "name": data.name, "order": count, "archived": False, "is_done": False, "created_at": now()}
    await db.lists.insert_one(item); item.pop("_id", None); return item

@api.patch("/lists/{list_id}")
async def patch_list(list_id: str, data: ListPatch, user=Depends(current_user)):
    item = await db.lists.find_one({"id": list_id}, {"_id": 0})
    if not item: raise HTTPException(404, "List tidak ditemukan")
    await require_admin(item["team_id"], user)
    updates = data.model_dump(exclude_unset=True)
    if updates: await db.lists.update_one({"id": list_id}, {"$set": updates})
    return await db.lists.find_one({"id": list_id}, {"_id": 0})

@api.delete("/lists/{list_id}")
async def delete_list(list_id: str, user=Depends(current_user)):
    item = await db.lists.find_one({"id": list_id}, {"_id": 0})
    if not item: raise HTTPException(404, "List tidak ditemukan")
    await require_admin(item["team_id"], user)
    await db.tasks.delete_many({"list_id": list_id})
    await db.lists.delete_one({"id": list_id})
    return {"ok": True}

# ---------- tasks ----------
async def task_or_404(task_id):
    task = await db.tasks.find_one({"id": task_id}, {"_id": 0})
    if not task: raise HTTPException(404, "Task tidak ditemukan")
    return task

async def load_visible_task(task_id, user):
    task = await task_or_404(task_id)
    role = await require_member(task["team_id"], user)
    if not task_visible(task, user, role): raise HTTPException(403, "Tugas ini bersifat privat")
    return task, role

def _data_request_summary(d):
    return {
        "id": d.get("id"), "name": d.get("name") or "", "status": d.get("status") or "diminta",
        "attachments": d.get("attachments") or [], "year": d.get("year"),
        "sheets": d.get("sheets") or [], "pic": d.get("pic") or "",
        "scope": item_scope(d), "wilayah": (d.get("wilayah") or "").strip() or None,
        "wilayah_label": item_wilayah(d), "doc_year": d.get("doc_year"), "doc_type": item_doc_type(d),
    }

async def with_linked_data_requests(tasks):
    if not tasks:
        return tasks
    if isinstance(tasks, dict):
        tasks = [tasks]
        single = True
    else:
        single = False
    ids = []
    for t in tasks:
        ids.extend(t.get("data_request_ids") or [])
    by_id = {}
    if ids:
        docs = await db.data_requests.find({"id": {"$in": list(set(ids))}}, {"_id": 0}).to_list(2000)
        by_id = {d["id"]: _data_request_summary(d) for d in docs}
    for t in tasks:
        t["linked_data_requests"] = [by_id[i] for i in (t.get("data_request_ids") or []) if i in by_id]
        if "data_request_ids" not in t:
            t["data_request_ids"] = []
    return tasks[0] if single else tasks

@api.get("/teams/{team_id}/tasks")
async def list_tasks(team_id: str, archived: bool = False, user=Depends(current_user)):
    role = await require_member(team_id, user)
    tasks = await db.tasks.find({"team_id": team_id, "archived": archived}, {"_id": 0}).sort("order", 1).to_list(1000)
    return await with_linked_data_requests([t for t in tasks if task_visible(t, user, role)])

@api.get("/me/tasks")
async def my_tasks(user=Depends(current_user)):
    memberships = await db.team_members.find({"user_id": user["id"]}, {"_id": 0}).to_list(200)
    roles = {m["team_id"]: m["role"] for m in memberships}
    team_ids = list(roles.keys())
    empty = {"overdue": [], "today": [], "upcoming": [], "unscheduled": [], "mentions": []}
    if not team_ids:
        return empty
    teams = {t["id"]: t for t in await db.teams.find({"id": {"$in": team_ids}}, {"_id": 0}).to_list(200)}
    lists = {l["id"]: l for l in await db.lists.find({"team_id": {"$in": team_ids}}, {"_id": 0}).to_list(2000)}
    tasks = await db.tasks.find(
        {"team_id": {"$in": team_ids}, "archived": False, "assignees": user["id"]},
        {"_id": 0},
    ).to_list(500)
    today = datetime.now(timezone(timedelta(hours=7))).date().isoformat()

    def enrich(task):
        lst = lists.get(task.get("list_id") or "", {})
        team = teams.get(task.get("team_id") or "", {})
        return {
            **task,
            "team_name": team.get("name"),
            "team_color": team.get("color"),
            "list_name": lst.get("name"),
            "is_done": bool(lst.get("is_done")),
            "is_cancelled": bool(lst.get("is_cancelled")),
        }

    overdue, due_today, upcoming, unscheduled = [], [], [], []
    for task in tasks:
        if not task_visible(task, user, roles.get(task["team_id"])):
            continue
        item = enrich(task)
        if item["is_done"] or item["is_cancelled"]:
            continue
        due = task.get("due_date") or ""
        if due and due < today:
            overdue.append(item)
        elif due == today:
            due_today.append(item)
        elif due:
            upcoming.append(item)
        else:
            unscheduled.append(item)

    overdue.sort(key=lambda t: t.get("due_date") or "")
    due_today.sort(key=lambda t: (t.get("due_time") or "", t.get("title") or ""))
    upcoming.sort(key=lambda t: t.get("due_date") or "")
    mentions = await db.notifications.find(
        {"user_id": user["id"], "type": "mention", "read": False}, {"_id": 0}
    ).sort("created_at", -1).to_list(10)
    return {
        "overdue": overdue,
        "today": due_today,
        "upcoming": upcoming[:20],
        "unscheduled": unscheduled[:20],
        "mentions": mentions,
    }

@api.get("/tasks/{task_id}")
async def get_task(task_id: str, user=Depends(current_user)):
    task, role = await load_visible_task(task_id, user)
    return await with_linked_data_requests(task)

@api.post("/teams/{team_id}/tasks")
async def create_task(team_id: str, data: TaskCreate, user=Depends(current_user)):
    await require_member(team_id, user)
    count = await db.tasks.count_documents({"team_id": team_id, "list_id": data.list_id})
    task = data.model_dump()
    style = normalize_title_style(task.get("title_color"), task.get("title_size"))
    ids = [i for i in (task.get("data_request_ids") or []) if isinstance(i, str) and i.strip()]
    if ids:
        valid = {d["id"] async for d in db.data_requests.find({"id": {"$in": ids}, "team_id": team_id}, {"_id": 0, "id": 1})}
        ids = [i for i in ids if i in valid]
    title_html = (task.get("title_html") or "").strip()
    if title_html:
        task["title_html"] = title_html
        plain = plain_from_html(title_html)
        if plain:
            task["title"] = plain
    else:
        task["title_html"] = ""
    task.update({"id": str(uuid.uuid4()), "team_id": team_id, "order": count, "checklist": [], "attachments": [],
                  "data_request_ids": list(dict.fromkeys(ids)),
                  "title_color": style.get("title_color", ""), "title_size": style.get("title_size", "md"),
                  "cover": None, "archived": False, "created_by": user["id"], "created_by_name": user["name"], "created_at": now(), "updated_at": now()})
    await db.tasks.insert_one(task); task.pop("_id", None)
    await log_activity(task["id"], user, "created", f"membuat tugas \"{task['title']}\"", team_id=team_id)
    for a in task["assignees"]:
        if a != user["id"]: await notify(a, "assignment", f"{user['name']} menugaskan Anda ke \"{task['title']}\"", team_id=team_id, task_id=task["id"])
    return task

@api.patch("/tasks/{task_id}")
async def update_task(task_id: str, data: TaskUpdate, user=Depends(current_user)):
    task, role = await load_visible_task(task_id, user)
    updates = data.model_dump(exclude_unset=True)
    if updates.get("team_id") and updates["team_id"] != task["team_id"]:
        target_team_id = updates["team_id"]
        await require_member(target_team_id, user)
        if updates.get("list_id"):
            target_list = await db.lists.find_one({"id": updates["list_id"]}, {"_id": 0})
            if not target_list or target_list["team_id"] != target_team_id: raise HTTPException(404, "List tujuan tidak ditemukan")
        else:
            first_list = await db.lists.find_one({"team_id": target_team_id, "archived": False}, {"_id": 0}, sort=[("order", 1)])
            if not first_list: raise HTTPException(400, "Tim tujuan belum punya list")
            updates["list_id"] = first_list["id"]
        target_member_ids = {m["user_id"] async for m in db.team_members.find({"team_id": target_team_id}, {"_id": 0})}
        updates["assignees"] = [a for a in task.get("assignees", []) if a in target_member_ids]
        updates["labels"] = []  # label ids are team-scoped
        updates["data_request_ids"] = []
    if "title_html" in updates:
        html = (updates.get("title_html") or "").strip()
        updates["title_html"] = html
        if "title" not in updates:
            plain = plain_from_html(html) or task.get("title")
            if plain:
                updates["title"] = plain
    if "title_color" in updates or "title_size" in updates:
        updates.update(normalize_title_style(updates.get("title_color", task.get("title_color")), updates.get("title_size", task.get("title_size"))))
    if "data_request_ids" in updates:
        ids = [i for i in (updates["data_request_ids"] or []) if isinstance(i, str) and i.strip()]
        team_id = updates.get("team_id") or task["team_id"]
        if ids:
            valid = {d["id"] async for d in db.data_requests.find({"id": {"$in": ids}, "team_id": team_id}, {"_id": 0, "id": 1})}
            ids = [i for i in ids if i in valid]
        updates["data_request_ids"] = list(dict.fromkeys(ids))
    if updates:
        updates["updated_at"] = now()
        await db.tasks.update_one({"id": task_id}, {"$set": updates})
        new_assignees = updates.get("assignees")
        if new_assignees:
            for a in new_assignees:
                if a not in task.get("assignees", []) and a != user["id"]:
                    await notify(a, "assignment", f"{user['name']} menugaskan Anda ke \"{task['title']}\"", team_id=task["team_id"], task_id=task_id)
        if "title" in updates and updates["title"] != task.get("title"):
            await log_activity(task_id, user, "title", f"mengganti judul menjadi \"{updates['title']}\"", team_id=task["team_id"])
        if "list_id" in updates and updates["list_id"] != task.get("list_id"):
            lst = await db.lists.find_one({"id": updates["list_id"]}, {"_id": 0})
            await log_activity(task_id, user, "moved", f"memindahkan ke {lst['name'] if lst else 'list lain'}", team_id=task["team_id"])
        if "due_date" in updates and updates["due_date"] != task.get("due_date"):
            label = updates["due_date"] or "tanpa tenggat"
            await log_activity(task_id, user, "due", f"mengubah tenggat menjadi {label}", team_id=task["team_id"])
        if "archived" in updates and updates["archived"] != task.get("archived"):
            await log_activity(task_id, user, "archived", "mengarsipkan tugas" if updates["archived"] else "mengembalikan tugas dari arsip", team_id=task["team_id"])
        if "assignees" in updates:
            await log_activity(task_id, user, "assignees", "memperbarui anggota tugas", team_id=task["team_id"])
        if "description" in updates:
            await log_activity(task_id, user, "notes", "memperbarui catatan", team_id=task["team_id"])
        if "description_mentions" in updates:
            prior = set(task.get("description_mentions", []))
            for uid in updates["description_mentions"]:
                if uid not in prior and uid != user["id"]:
                    await notify(uid, "mention", f"{user['name']} menyebut Anda di catatan \"{task['title']}\"", team_id=task["team_id"], task_id=task_id)
    updated = await db.tasks.find_one({"id": task_id}, {"_id": 0})
    return await with_linked_data_requests(updated)

@api.post("/tasks/{task_id}/duplicate")
async def duplicate_task(task_id: str, data: TaskDuplicate = TaskDuplicate(), user=Depends(current_user)):
    task, role = await load_visible_task(task_id, user)
    target_team_id = data.target_team_id or task["team_id"]
    await require_member(target_team_id, user)
    if data.target_list_id:
        target_list = await db.lists.find_one({"id": data.target_list_id}, {"_id": 0})
        if not target_list or target_list["team_id"] != target_team_id: raise HTTPException(404, "List tujuan tidak ditemukan")
        list_id = data.target_list_id
    else:
        list_id = task["list_id"] if target_team_id == task["team_id"] else None
        if not list_id:
            first_list = await db.lists.find_one({"team_id": target_team_id, "archived": False}, {"_id": 0}, sort=[("order", 1)])
            if not first_list: raise HTTPException(400, "Tim tujuan belum punya list")
            list_id = first_list["id"]
    clone = dict(task)
    clone.update({"id": str(uuid.uuid4()), "title": data.title or f"{task['title']} (Salinan)", "created_by": user["id"],
                   "created_by_name": user["name"], "created_at": now(), "updated_at": now(),
                   "team_id": target_team_id, "list_id": list_id, "archived": False, "cover": None})
    if not data.keep_labels: clone["labels"] = []
    if not data.keep_assignees: clone["assignees"] = []
    if not data.keep_checklist: clone["checklist"] = []
    if not data.keep_attachments: clone["attachments"] = []
    clone.pop("_id", None)
    await db.tasks.insert_one(clone); clone.pop("_id", None)
    return clone

@api.delete("/tasks/{task_id}")
async def delete_task(task_id: str, user=Depends(current_user)):
    task, role = await load_visible_task(task_id, user)
    await db.tasks.delete_one({"id": task_id})
    await db.comments.delete_many({"task_id": task_id})
    return {"ok": True}

@api.post("/tasks/{task_id}/attachments")
async def add_attachment_link(task_id: str, data: LinkAttachmentInput, user=Depends(current_user)):
    task, role = await load_visible_task(task_id, user)
    url = normalize_http_url(data.url, "Link lampiran")
    if not url: raise HTTPException(400, "Link harus diawali http:// atau https://")
    entry = {"id": str(uuid.uuid4()), "name": data.name.strip(), "url": url, "created_at": now()}
    await db.tasks.update_one({"id": task_id}, {"$push": {"attachments": entry}})
    await log_activity(task_id, user, "attachment", f"menambahkan lampiran {entry['name'] or entry['url']}", team_id=task["team_id"])
    return entry

@api.delete("/tasks/{task_id}/attachments/{file_id}")
async def remove_attachment(task_id: str, file_id: str, user=Depends(current_user)):
    task, role = await load_visible_task(task_id, user)
    await db.tasks.update_one({"id": task_id}, {"$pull": {"attachments": {"id": file_id}}})
    return {"ok": True}

# ---------- comments ----------
@api.get("/tasks/{task_id}/comments")
async def comments(task_id: str, user=Depends(current_user)):
    task, role = await load_visible_task(task_id, user)
    return await db.comments.find({"task_id": task_id}, {"_id": 0}).sort("created_at", 1).to_list(200)

@api.post("/tasks/{task_id}/comments")
async def add_comment(task_id: str, data: CommentInput, user=Depends(current_user)):
    task, role = await load_visible_task(task_id, user)
    comment = {"id": str(uuid.uuid4()), "task_id": task_id, "body": data.body, "mentions": data.mentions, "author": user["name"], "author_id": user["id"], "created_at": now()}
    await db.comments.insert_one(comment); comment.pop("_id", None)
    await log_activity(task_id, user, "comment", "menulis komentar", team_id=task["team_id"])
    for m in data.mentions:
        if m != user["id"]: await notify(m, "mention", f"{user['name']} menyebut Anda di \"{task['title']}\"", team_id=task["team_id"], task_id=task_id)
    return comment

# ---------- files ----------
MAX_UPLOAD_BYTES = int(os.environ.get("MAX_UPLOAD_MB", "50")) * 1024 * 1024

@api.post("/files/upload")
async def upload_file(team_id: str = Query(...), task_id: Optional[str] = Query(None), kind: str = Query("attachment"), folder: str = Query(""), file: UploadFile = File(...), user=Depends(current_user)):
    await require_member(team_id, user)
    if task_id: await load_visible_task(task_id, user)
    ext = re.sub(r"[^A-Za-z0-9]", "", file.filename.rsplit(".", 1)[-1])[:10] or "bin" if "." in file.filename else "bin"
    path = f"{APP_NAME}/uploads/{user['id']}/{uuid.uuid4()}.{ext}"
    data = await file.read()
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, f"Ukuran file melebihi batas maksimum {MAX_UPLOAD_BYTES // (1024 * 1024)}MB")
    result = put_object(path, data, file.content_type or "application/octet-stream")
    record = {"id": str(uuid.uuid4()), "storage_path": result["path"], "original_filename": file.filename,
              "content_type": file.content_type or "application/octet-stream", "size": result.get("size", len(data)),
              "is_deleted": False, "uploaded_by": user["id"], "uploaded_by_name": user["name"], "created_at": now()}
    await db.files.insert_one(record)
    entry = {"id": record["id"], "filename": record["original_filename"], "content_type": record["content_type"], "size": record["size"], "created_at": record["created_at"]}
    if kind == "attachment" and task_id:
        # Used by per-checklist-item attachments (TaskDetailModal's uploadChecklistAttachment);
        # the freeform task "Lampiran" section itself now only takes links, via /tasks/{id}/attachments.
        await db.tasks.update_one({"id": task_id}, {"$push": {"attachments": entry}})
        await log_activity(task_id, user, "attachment", f"mengunggah {entry['filename']}", team_id=team_id)
    elif kind == "cover" and task_id:
        await db.tasks.update_one({"id": task_id}, {"$set": {"cover": record["id"]}})
        await log_activity(task_id, user, "cover", "mengganti cover", team_id=team_id)
    else:
        await db.documents.insert_one({"id": str(uuid.uuid4()), "team_id": team_id, "file_id": record["id"], "filename": entry["filename"],
                                         "content_type": entry["content_type"], "size": entry["size"], "uploaded_by_name": user["name"], "task_id": task_id,
                                         "folder": (folder or "").strip(), "created_at": now()})
    return entry

INLINE_SAFE_TYPES = {"image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf"}

def _safe_download_filename(name):
    name = re.sub(r'[\r\n"]', "", name or "file").strip()
    return name[:200] or "file"

@api.get("/files/{file_id}")
async def download_file(file_id: str, user=Depends(current_user)):
    record = await db.files.find_one({"id": file_id, "is_deleted": False}, {"_id": 0})
    if not record: raise HTTPException(404, "File tidak ditemukan")
    data, _guessed_type = get_object(record["storage_path"])
    stored_type = record.get("content_type", "")
    if stored_type in INLINE_SAFE_TYPES:
        return Response(content=data, media_type=stored_type)
    filename = _safe_download_filename(record.get("original_filename"))
    return Response(content=data, media_type="application/octet-stream",
                     headers={"Content-Disposition": f'attachment; filename="{filename}"'})

@api.get("/teams/{team_id}/documents")
async def team_documents(team_id: str, user=Depends(current_user)):
    await require_member(team_id, user)
    docs = await db.documents.find({"team_id": team_id}, {"_id": 0}).to_list(500)
    file_ids = [d["file_id"] for d in docs]
    files_by_id = {f["id"]: f async for f in db.files.find({"id": {"$in": file_ids}}, {"_id": 0, "id": 1, "uploaded_by": 1})}
    for d in docs:
        d["uploaded_by"] = files_by_id.get(d["file_id"], {}).get("uploaded_by")
    tasks = await db.tasks.find({"team_id": team_id, "attachments": {"$ne": []}}, {"_id": 0}).to_list(500)
    for t in tasks:
        for a in t.get("attachments", []):
            docs.append({"id": a["id"], "team_id": team_id, "file_id": a["id"], "filename": a["filename"], "content_type": a["content_type"],
                          "size": a["size"], "uploaded_by_name": t.get("created_by_name", ""), "uploaded_by": None, "task_id": t["id"], "task_title": t["title"], "created_at": a.get("created_at", t["created_at"])})
    docs.sort(key=lambda d: d["created_at"], reverse=True)
    return docs

@api.patch("/documents/{document_id}")
async def patch_document(document_id: str, data: DocumentPatch, user=Depends(current_user)):
    doc = await db.documents.find_one({"id": document_id}, {"_id": 0})
    if not doc: raise HTTPException(404, "Dokumen tidak ditemukan")
    await require_member(doc["team_id"], user)
    updates = data.model_dump(exclude_unset=True)
    if "folder" in updates:
        updates["folder"] = (updates["folder"] or "").strip()
    if updates:
        await db.documents.update_one({"id": document_id}, {"$set": updates})
    return await db.documents.find_one({"id": document_id}, {"_id": 0})

@api.get("/tasks/{task_id}/activity")
async def task_activity(task_id: str, user=Depends(current_user)):
    task, role = await load_visible_task(task_id, user)
    return await db.task_activity.find({"task_id": task_id}, {"_id": 0}).sort("created_at", -1).to_list(100)

@api.delete("/documents/{document_id}")
async def delete_document(document_id: str, user=Depends(current_user)):
    doc = await db.documents.find_one({"id": document_id}, {"_id": 0})
    if not doc: raise HTTPException(404, "Dokumen tidak ditemukan")
    role = await require_member(doc["team_id"], user)
    file_record = await db.files.find_one({"id": doc["file_id"]}, {"_id": 0})
    uploader_id = file_record.get("uploaded_by") if file_record else None
    if uploader_id != user["id"] and role != "admin": raise HTTPException(403, "Tidak diizinkan menghapus dokumen ini")
    await db.documents.delete_one({"id": document_id})
    if file_record: await db.files.update_one({"id": doc["file_id"]}, {"$set": {"is_deleted": True}})
    return {"ok": True}

# ---------- data requests (permintaan data) ----------
async def data_request_or_404(item_id):
    item = await db.data_requests.find_one({"id": item_id}, {"_id": 0})
    if not item: raise HTTPException(404, "Item data tidak ditemukan")
    return item

@api.get("/teams/{team_id}/data-requests")
async def list_data_requests(team_id: str, user=Depends(current_user)):
    await require_member(team_id, user)
    team = await db.teams.find_one({"id": team_id}, {"_id": 0})
    items = await db.data_requests.find({"team_id": team_id}, {"_id": 0}).to_list(2000)
    for i in items:
        decorate_data_request(i, team)
    items.sort(key=lambda i: (i.get("year") or 0, i.get("doc_year") or 0, i.get("created_at") or ""))
    return items

@api.post("/teams/{team_id}/data-requests")
async def create_data_request(team_id: str, data: DataRequestCreate, user=Depends(current_user)):
    await require_member(team_id, user)
    if data.status not in DATA_REQUEST_STATUSES: raise HTTPException(400, "Status tidak valid")
    team = await db.teams.find_one({"id": team_id}, {"_id": 0})
    if not team: raise HTTPException(404, "Tim tidak ditemukan")
    sheets = [s.strip() for s in data.sheets if s.strip()]
    year = data.year if data.year is not None else infer_team_year(team)
    scope = normalize_scope(data.scope)
    wilayah = (data.wilayah or "").strip() or None
    if scope == "pusat":
        wilayah = None
    elif not wilayah:
        wilayah = (team.get("wilayah") or "").strip() or None
    doc_year = data.doc_year if data.doc_year is not None else year
    item = {"id": str(uuid.uuid4()), "team_id": team_id, "name": data.name.strip(), "sheets": sheets,
            "status": data.status, "pic": data.pic.strip(), "notes": data.notes.strip(), "year": year,
            "doc_year": doc_year, "doc_type": (data.doc_type or "").strip(),
            "scope": scope, "wilayah": wilayah,
            "requested_at": now(), "received_at": now() if data.status in DATA_REQUEST_RECEIVED_STATUSES else None,
            "attachments": [], "created_by": user["id"], "created_by_name": user["name"], "created_at": now()}
    await db.data_requests.insert_one(dict(item))
    item.pop("_id", None)
    return decorate_data_request(item, team)

@api.patch("/data-requests/{item_id}")
async def update_data_request(item_id: str, data: DataRequestPatch, user=Depends(current_user)):
    item = await data_request_or_404(item_id)
    await require_member(item["team_id"], user)
    updates = data.model_dump(exclude_unset=True)
    if "status" in updates:
        if updates["status"] not in DATA_REQUEST_STATUSES: raise HTTPException(400, "Status tidak valid")
        updates["received_at"] = now() if updates["status"] in DATA_REQUEST_RECEIVED_STATUSES else item.get("received_at")
    if "sheets" in updates: updates["sheets"] = [s.strip() for s in updates["sheets"] if s.strip()]
    if "name" in updates: updates["name"] = updates["name"].strip()
    if "pic" in updates: updates["pic"] = updates["pic"].strip()
    if "notes" in updates: updates["notes"] = updates["notes"].strip()
    if "doc_type" in updates: updates["doc_type"] = (updates["doc_type"] or "").strip()
    if "year" in updates and updates["year"] is None:
        updates.pop("year")
    if "doc_year" in updates and updates["doc_year"] is None:
        updates.pop("doc_year")
    scope = normalize_scope(updates["scope"] if "scope" in updates else item.get("scope"))
    if "scope" in updates:
        updates["scope"] = scope
    if scope == "pusat":
        updates["wilayah"] = None
    elif "wilayah" in updates:
        updates["wilayah"] = (updates.get("wilayah") or "").strip() or None
    if updates: await db.data_requests.update_one({"id": item_id}, {"$set": updates})
    team = await db.teams.find_one({"id": item["team_id"]}, {"_id": 0})
    updated = await db.data_requests.find_one({"id": item_id}, {"_id": 0})
    if "status" in updates:
        await notify_linked_tasks_data_status(updated or item, item.get("status"), updates.get("status"), user)
    return decorate_data_request(updated, team)

@api.post("/teams/{team_id}/data-requests/apply-year")
async def apply_year_to_all_data_requests(team_id: str, data: ApplyYearInput, user=Depends(current_user)):
    await require_member(team_id, user)
    result = await db.data_requests.update_many({"team_id": team_id}, {"$set": {"year": data.year}})
    return {"ok": True, "updated": result.modified_count, "year": data.year}

@api.post("/teams/{team_id}/data-requests/rename-sheet")
async def rename_data_request_sheet(team_id: str, data: RenameSheetInput, user=Depends(current_user)):
    await require_member(team_id, user)
    old = data.from_name.strip()
    new = data.to_name.strip()
    if not old or not new:
        raise HTTPException(400, "Nama sheet tidak boleh kosong")
    if old == new:
        return {"ok": True, "updated": 0, "from_name": old, "to_name": new}
    items = await db.data_requests.find({"team_id": team_id}, {"_id": 0, "id": 1, "sheets": 1}).to_list(2000)
    updated = 0
    for it in items:
        sheets = [s for s in (it.get("sheets") or []) if isinstance(s, str) and s.strip()]
        if old in sheets:
            next_sheets = []
            seen = set()
            for s in sheets:
                name = new if s == old else s
                if name not in seen:
                    seen.add(name)
                    next_sheets.append(name)
            await db.data_requests.update_one({"id": it["id"]}, {"$set": {"sheets": next_sheets}})
            updated += 1
        elif not sheets and old in ("(Tanpa sheet)", "(Tanpa klasifikasi)"):
            await db.data_requests.update_one({"id": it["id"]}, {"$set": {"sheets": [new]}})
            updated += 1
    return {"ok": True, "updated": updated, "from_name": old, "to_name": new}

@api.get("/data-packages")
async def list_data_packages(user=Depends(current_user)):
    rows = await db.data_packages.find({}, {"_id": 0}).sort("name", 1).to_list(200)
    return rows

@api.post("/data-packages")
async def create_data_package(data: DataPackageIn, user=Depends(current_user)):
    if not can_manage_data_packages(user):
        raise HTTPException(403, "Tidak diizinkan mengelola paket data")
    items = []
    for it in data.items:
        name = it.name.strip()
        if not name:
            continue
        items.append({
            "name": name, "doc_type": (it.doc_type or "").strip(),
            "scope": normalize_scope(it.scope), "sheets": [s.strip() for s in (it.sheets or []) if s.strip()],
            "notes": (it.notes or "").strip(),
        })
    if not items:
        raise HTTPException(400, "Paket harus berisi minimal satu data")
    doc = {
        "id": str(uuid.uuid4()), "name": data.name.strip(), "description": (data.description or "").strip(),
        "items": items, "created_by": user["id"], "created_at": now(),
    }
    await db.data_packages.insert_one(dict(doc))
    return _package_public(doc)

@api.patch("/data-packages/{package_id}")
async def update_data_package(package_id: str, data: DataPackageIn, user=Depends(current_user)):
    if not can_manage_data_packages(user):
        raise HTTPException(403, "Tidak diizinkan mengelola paket data")
    existing = await db.data_packages.find_one({"id": package_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Paket tidak ditemukan")
    items = []
    for it in data.items:
        name = it.name.strip()
        if not name:
            continue
        items.append({
            "name": name, "doc_type": (it.doc_type or "").strip(),
            "scope": normalize_scope(it.scope), "sheets": [s.strip() for s in (it.sheets or []) if s.strip()],
            "notes": (it.notes or "").strip(),
        })
    if not items:
        raise HTTPException(400, "Paket harus berisi minimal satu data")
    await db.data_packages.update_one({"id": package_id}, {"$set": {
        "name": data.name.strip(), "description": (data.description or "").strip(), "items": items,
    }})
    return await db.data_packages.find_one({"id": package_id}, {"_id": 0})

@api.delete("/data-packages/{package_id}")
async def delete_data_package(package_id: str, user=Depends(current_user)):
    if not can_manage_data_packages(user):
        raise HTTPException(403, "Tidak diizinkan mengelola paket data")
    result = await db.data_packages.delete_one({"id": package_id})
    if not result.deleted_count:
        raise HTTPException(404, "Paket tidak ditemukan")
    return {"ok": True}

@api.post("/teams/{team_id}/data-requests/from-package")
async def apply_data_package(team_id: str, data: ApplyPackageInput, user=Depends(current_user)):
    await require_member(team_id, user)
    pkg = await db.data_packages.find_one({"id": data.package_id}, {"_id": 0})
    if not pkg:
        raise HTTPException(404, "Paket tidak ditemukan")
    team = await db.teams.find_one({"id": team_id}, {"_id": 0})
    if not team:
        raise HTTPException(404, "Tim tidak ditemukan")
    year = infer_team_year(team)
    doc_year = data.doc_year if data.doc_year is not None else year
    existing = await db.data_requests.find({"team_id": team_id}, {"_id": 0, "name": 1, "doc_year": 1, "scope": 1, "year": 1}).to_list(2000)
    seen = {(normalize_data_name(i.get("name")), infer_doc_year(i, team), item_scope(i)) for i in existing}
    created = []
    skipped = 0
    team_wil = (team.get("wilayah") or "").strip() or None
    for it in pkg.get("items") or []:
        name = (it.get("name") or "").strip()
        if not name:
            continue
        scope = normalize_scope(it.get("scope"))
        key = (normalize_data_name(name), doc_year, scope)
        if key in seen:
            skipped += 1
            continue
        seen.add(key)
        item = {
            "id": str(uuid.uuid4()), "team_id": team_id, "name": name,
            "sheets": [s.strip() for s in (it.get("sheets") or []) if s and str(s).strip()],
            "status": "diminta", "pic": "", "notes": (it.get("notes") or "").strip(),
            "year": year, "doc_year": doc_year, "doc_type": (it.get("doc_type") or "").strip(),
            "scope": scope, "wilayah": None if scope == "pusat" else team_wil,
            "requested_at": now(), "received_at": None, "attachments": [],
            "created_by": user["id"], "created_by_name": user["name"], "created_at": now(),
        }
        await db.data_requests.insert_one(dict(item))
        item.pop("_id", None)
        created.append(decorate_data_request(item, team))
    return {"ok": True, "created": len(created), "skipped": skipped, "items": created}

@api.delete("/data-requests/{item_id}")
async def delete_data_request(item_id: str, user=Depends(current_user)):
    item = await data_request_or_404(item_id)
    await require_admin(item["team_id"], user)
    await db.data_requests.delete_one({"id": item_id})
    return {"ok": True}

@api.post("/data-requests/{item_id}/attachments")
async def add_data_request_attachment_link(item_id: str, data: LinkAttachmentInput, user=Depends(current_user)):
    item = await data_request_or_404(item_id)
    await require_member(item["team_id"], user)
    url = normalize_http_url(data.url, "Link lampiran")
    if not url: raise HTTPException(400, "Link harus diawali http:// atau https://")
    entry = {"id": str(uuid.uuid4()), "name": data.name.strip(), "url": url, "created_at": now()}
    await db.data_requests.update_one({"id": item_id}, {"$push": {"attachments": entry}})
    return entry

@api.delete("/data-requests/{item_id}/attachments/{file_id}")
async def remove_data_request_attachment(item_id: str, file_id: str, user=Depends(current_user)):
    item = await data_request_or_404(item_id)
    await require_member(item["team_id"], user)
    await db.data_requests.update_one({"id": item_id}, {"$pull": {"attachments": {"id": file_id}}})
    return {"ok": True}

@api.patch("/teams/{team_id}/surat-defaults")
async def update_surat_defaults(team_id: str, data: SuratDefaultsInput, user=Depends(current_user)):
    await require_member(team_id, user)
    payload = data.model_dump()
    payload["link_upload"] = normalize_http_url(payload.get("link_upload"), "Link unggah") or ""
    await db.teams.update_one({"id": team_id}, {"$set": {"surat_defaults": payload}})
    return {"ok": True}

@api.get("/data-requests/monitoring")
async def data_requests_monitoring(user=Depends(current_user)):
    if not can_view_all_teams(user): raise HTTPException(403, "Tidak diizinkan mengakses ringkasan ini")
    teams = await db.teams.find({}, {"_id": 0}).to_list(1000)
    team_ids = [t["id"] for t in teams]
    items = await db.data_requests.find({"team_id": {"$in": team_ids}}, {"_id": 0}).to_list(50000)
    by_team = {}
    for it in items:
        by_team.setdefault(it["team_id"], []).append(it)
    result = []
    for t in teams:
        rows = by_team.get(t["id"], [])
        total = len(rows)
        counts = {s: 0 for s in DATA_REQUEST_STATUSES}
        for r in rows: counts[r["status"]] = counts.get(r["status"], 0) + 1
        pct = round((counts["diterima_lengkap"] / total) * 100) if total else 0
        result.append({"team_id": t["id"], "team_name": t["name"], "team_color": t.get("color"),
                        "total": total, "counts": counts, "pct_complete": pct, "created_at": t.get("created_at"),
                        "year": infer_team_year(t),
                        "laporan_deadline": t.get("laporan_deadline"), "kke_deadline": t.get("kke_deadline")})
    result.sort(key=lambda r: (r["pct_complete"], -r["total"]))
    return result

def _empty_recap(year):
    return {
        "year": year, "years": [year], "total_requests": 0, "unique_count": 0, "name_count": 0,
        "team_count": 0, "wilayah_count": 0, "wilayahs": [], "regions": [], "groups": [],
        "doc_years": [], "doc_types": [], "pusat_count": 0, "items": [],
        "complete_count": 0, "pending_count": 0, "no_link_count": 0, "all_years": False,
    }

@api.get("/data-recap")
async def data_requests_recap(year: Optional[int] = None, all_years: bool = False, user=Depends(current_user)):
    """Unique catalog keyed by document wilayah + name + doc year (not team wilayah)."""
    memberships = await db.team_members.find({"user_id": user["id"]}, {"_id": 0}).to_list(200)
    role_by_team = {m["team_id"]: m["role"] for m in memberships}
    if can_view_all_teams(user):
        teams = await db.teams.find({}, {"_id": 0}).to_list(1000)
    else:
        if not memberships:
            return _empty_recap(year or current_year())
        teams = await db.teams.find({"id": {"$in": list(role_by_team.keys())}}, {"_id": 0}).to_list(200)
    teams = [with_team_year(t) for t in teams]
    team_map_all = {t["id"]: t for t in teams}
    team_ids_all = list(team_map_all.keys())
    raw_items = await db.data_requests.find({"team_id": {"$in": team_ids_all}}, {"_id": 0}).to_list(50000) if team_ids_all else []
    item_years = {infer_item_year(it, team_map_all.get(it.get("team_id"))) for it in raw_items}
    years = sorted({t["year"] for t in teams} | item_years | {current_year()}, reverse=True)
    if all_years:
        chosen = None
        items = raw_items
    elif year is None:
        chosen = current_year()
        items = [it for it in raw_items if infer_item_year(it, team_map_all.get(it.get("team_id"))) == chosen]
    else:
        chosen = year
        if chosen not in years:
            years = sorted({*years, chosen}, reverse=True)
        items = [it for it in raw_items if infer_item_year(it, team_map_all.get(it.get("team_id"))) == chosen]
    used_ids = {it.get("team_id") for it in items}
    team_map = {tid: team_map_all[tid] for tid in used_ids if tid in team_map_all}
    year_teams = [t for t in teams if t["id"] in team_map or (chosen is not None and t["year"] == chosen)]

    buckets = {}
    rank = {s: i for i, s in enumerate(["tidak_relevan", "diminta", "tidak_tersedia", "diterima_sebagian", "diterima_lengkap"])}
    for it in items:
        key = normalize_data_name(it.get("name") or "")
        if not key:
            continue
        team = team_map.get(it.get("team_id"))
        wilayah = item_wilayah(it, team)
        scope = item_scope(it)
        doc_year = infer_doc_year(it, team)
        doc_type = item_doc_type(it)
        b = buckets.setdefault((wilayah, key, doc_year), {
            "key": key, "wilayah": wilayah, "scope": scope, "doc_year": doc_year,
            "names": [], "sheets": set(), "doc_types": [],
            "status_counts": {s: 0 for s in DATA_REQUEST_STATUSES},
            "teams": {}, "attachments": [], "notes": [],
        })
        b["names"].append(it.get("name") or "")
        if doc_type:
            b["doc_types"].append(doc_type)
        if scope == "pusat":
            b["scope"] = "pusat"
        for sh in (it.get("sheets") or []):
            if sh and sh.strip():
                b["sheets"].add(sh.strip())
        status = it.get("status") if it.get("status") in DATA_REQUEST_STATUSES else "diminta"
        b["status_counts"][status] = b["status_counts"].get(status, 0) + 1
        if team and team["id"] not in b["teams"]:
            b["teams"][team["id"]] = {
                "team_id": team["id"], "team_name": team.get("name"), "team_color": team.get("color"),
                "wilayah": wilayah, "status": status, "pic": it.get("pic") or "", "item_id": it.get("id"),
            }
        elif team and team["id"] in b["teams"]:
            prev = b["teams"][team["id"]]["status"]
            if rank.get(status, 0) > rank.get(prev, 0):
                b["teams"][team["id"]]["status"] = status
                b["teams"][team["id"]]["item_id"] = it.get("id")
            if it.get("pic") and not b["teams"][team["id"]].get("pic"):
                b["teams"][team["id"]]["pic"] = it["pic"]
        for att in it.get("attachments") or []:
            url = (att.get("url") or "").strip()
            name = att.get("name") or att.get("filename") or url
            if url and not any(a.get("url") == url for a in b["attachments"]):
                b["attachments"].append({"name": name, "url": url, "team_name": team.get("name") if team else "", "wilayah": wilayah})
        note = (it.get("notes") or "").strip()
        if note and note not in b["notes"]:
            b["notes"].append(note)

    unique_items = []
    for b in buckets.values():
        counts = b["status_counts"]
        unique_items.append({
            "key": f"{normalize_data_name(b['wilayah'])}::{b['key']}::{b['doc_year']}",
            "name_key": b["key"],
            "name": _most_common_name(b["names"]),
            "wilayah": b["wilayah"],
            "scope": b["scope"],
            "doc_year": b["doc_year"],
            "doc_type": _most_common_name(b["doc_types"]) if b["doc_types"] else "",
            "sheets": sorted(b["sheets"]),
            "status_counts": counts,
            "weakest_status": weakest_status(counts),
            "complete_teams": counts.get("diterima_lengkap") or 0,
            "has_link": bool(b["attachments"]),
            "team_count": len(b["teams"]),
            "teams": sorted(b["teams"].values(), key=lambda t: t.get("team_name") or ""),
            "attachments": b["attachments"][:100],
            "notes": b["notes"][:8],
        })
    unique_items.sort(key=lambda i: (*_region_sort_key(i["wilayah"]), -(i.get("doc_year") or 0), i["name"].lower(), i["key"]))

    def sheet_groups(rows):
        by_sheet = {}
        for item in rows:
            labels = item["sheets"] or [NO_SHEET_LABEL]
            for sh in labels:
                by_sheet.setdefault(sh, []).append(item)
        out = []
        for sh in sorted(by_sheet.keys(), key=_region_sort_key):
            out.append({"sheet": sh, "count": len(by_sheet[sh]), "items": by_sheet[sh]})
        return out

    by_wilayah = {}
    for item in unique_items:
        by_wilayah.setdefault(item["wilayah"], []).append(item)
    regions = []
    for w in sorted(by_wilayah.keys(), key=_region_sort_key):
        rows = by_wilayah[w]
        regions.append({"wilayah": w, "count": len(rows), "groups": sheet_groups(rows)})

    doc_years = sorted({i["doc_year"] for i in unique_items if i.get("doc_year")}, reverse=True)
    doc_types = sorted({i["doc_type"] for i in unique_items if i.get("doc_type")}, key=str.lower)
    complete_count = sum(1 for i in unique_items if i["weakest_status"] == "diterima_lengkap")
    pending_count = sum(1 for i in unique_items if i["weakest_status"] in ("diminta", "diterima_sebagian"))
    no_link_count = sum(1 for i in unique_items if not i["has_link"])
    return {
        "year": chosen,
        "all_years": all_years,
        "years": years,
        "total_requests": len(items),
        "unique_count": len(unique_items),
        "name_count": len({i["name_key"] for i in unique_items}),
        "team_count": len(year_teams),
        "wilayah_count": len([w for w in by_wilayah if w != PUSAT_WILAYAH_LABEL]),
        "wilayahs": [r["wilayah"] for r in regions],
        "regions": regions,
        "groups": sheet_groups(unique_items),
        "items": unique_items,
        "doc_years": doc_years,
        "doc_types": doc_types,
        "pusat_count": len(by_wilayah.get(PUSAT_WILAYAH_LABEL, [])),
        "complete_count": complete_count,
        "pending_count": pending_count,
        "no_link_count": no_link_count,
    }

# ---------- calendar sync (iCal) ----------
def _ics_escape(text):
    return (text or "").replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")

@api.get("/teams/{team_id}/calendar-link")
async def calendar_link(team_id: str, user=Depends(current_user)):
    await require_member(team_id, user)
    tok = jwt.encode({"sub": user["id"], "team_id": team_id, "type": "calendar",
                       "exp": datetime.now(timezone.utc) + timedelta(days=365)}, os.environ["JWT_SECRET"], algorithm=JWT_ALGORITHM)
    return {"path": f"/api/teams/{team_id}/calendar.ics?token={tok}"}

@api.get("/teams/{team_id}/calendar.ics")
async def team_calendar_ics(team_id: str, token: str):
    try:
        payload = jwt.decode(token, os.environ["JWT_SECRET"], algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "calendar" or payload.get("team_id") != team_id: raise HTTPException(401, "Token tidak valid")
    except jwt.PyJWTError:
        raise HTTPException(401, "Token tidak valid")
    if not await can_access_team(team_id, payload["sub"]): raise HTTPException(403, "Bukan anggota tim ini")
    team = await db.teams.find_one({"id": team_id}, {"_id": 0})
    tasks = await db.tasks.find({"team_id": team_id, "due_date": {"$nin": [None, ""]}, "archived": False}, {"_id": 0}).to_list(1000)
    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Project Management//ID", f"X-WR-CALNAME:{_ics_escape(team['name'] if team else 'Tim')} - Tugas"]
    for t in tasks:
        date_val = t["due_date"].replace("-", "")
        dtstamp = now().replace("-", "").replace(":", "").split(".")[0]
        lines += ["BEGIN:VEVENT", f"UID:{t['id']}@project-mng", f"DTSTAMP:{dtstamp}Z",
                  f"DTSTART;VALUE=DATE:{date_val}", f"SUMMARY:{_ics_escape(t['title'])}", f"DESCRIPTION:{_ics_escape(t.get('description', ''))}", "END:VEVENT"]
    lines.append("END:VCALENDAR")
    return Response(content="\r\n".join(lines), media_type="text/calendar; charset=utf-8")

@app.websocket("/api/ws/notifications")
async def notif_websocket(websocket: WebSocket):
    user = await user_from_token(websocket.cookies.get("access_token"))
    if not user:
        await websocket.close(code=4401); return
    await websocket.accept()
    notif_connections.setdefault(user["id"], []).append(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        notif_connections.get(user["id"], []).remove(websocket) if websocket in notif_connections.get(user["id"], []) else None

# ---------- labels ----------
@api.get("/teams/{team_id}/labels")
async def get_labels(team_id: str, user=Depends(current_user)):
    await require_member(team_id, user)
    return await db.labels.find({"team_id": team_id}, {"_id": 0}).sort("created_at", 1).to_list(200)

@api.post("/teams/{team_id}/labels")
async def create_label(team_id: str, data: LabelInput, user=Depends(current_user)):
    await require_admin(team_id, user)
    existing = await db.labels.find_one({"team_id": team_id, "name": data.name, "color": data.color}, {"_id": 0})
    if existing: return existing
    item = {"id": str(uuid.uuid4()), "team_id": team_id, "name": data.name, "color": data.color, "created_at": now()}
    await db.labels.insert_one(item); item.pop("_id", None); return item

@api.patch("/labels/{label_id}")
async def update_label(label_id: str, data: LabelPatch, user=Depends(current_user)):
    item = await db.labels.find_one({"id": label_id}, {"_id": 0})
    if not item: raise HTTPException(404, "Label tidak ditemukan")
    await require_admin(item["team_id"], user)
    updates = data.model_dump(exclude_unset=True)
    if updates: await db.labels.update_one({"id": label_id}, {"$set": updates})
    return await db.labels.find_one({"id": label_id}, {"_id": 0})

@api.delete("/labels/{label_id}")
async def delete_label(label_id: str, user=Depends(current_user)):
    item = await db.labels.find_one({"id": label_id}, {"_id": 0})
    if not item: raise HTTPException(404, "Label tidak ditemukan")
    await require_admin(item["team_id"], user)
    await db.labels.delete_one({"id": label_id})
    await db.tasks.update_many({"team_id": item["team_id"]}, {"$pull": {"labels": label_id}})
    return {"ok": True}

# ---------- announcements ----------
@api.get("/teams/{team_id}/announcements")
async def get_announcements(team_id: str, user=Depends(current_user)):
    await require_member(team_id, user)
    return await db.announcements.find({"team_id": team_id}, {"_id": 0}).sort("created_at", -1).to_list(200)

@api.post("/teams/{team_id}/announcements")
async def post_announcement(team_id: str, data: AnnouncementInput, user=Depends(current_user)):
    await require_member(team_id, user)
    item = {"id": str(uuid.uuid4()), "team_id": team_id, "title": data.title, "body": data.body, "mentions": data.mentions, "author": user["name"], "author_id": user["id"], "created_at": now()}
    await db.announcements.insert_one(item); item.pop("_id", None)
    members = await db.team_members.find({"team_id": team_id}, {"_id": 0}).to_list(200)
    for m in members:
        if m["user_id"] != user["id"]: await notify(m["user_id"], "announcement", f"Pengumuman baru: {data.title}", team_id=team_id)
    return item

@api.patch("/announcements/{announcement_id}")
async def update_announcement(announcement_id: str, data: AnnouncementPatch, user=Depends(current_user)):
    item = await db.announcements.find_one({"id": announcement_id}, {"_id": 0})
    if not item: raise HTTPException(404, "Pengumuman tidak ditemukan")
    role = await require_member(item["team_id"], user)
    if item["author_id"] != user["id"] and role != "admin": raise HTTPException(403, "Tidak diizinkan mengubah pengumuman ini")
    updates = data.model_dump(exclude_unset=True)
    if updates: await db.announcements.update_one({"id": announcement_id}, {"$set": updates})
    return await db.announcements.find_one({"id": announcement_id}, {"_id": 0})

@api.delete("/announcements/{announcement_id}")
async def delete_announcement(announcement_id: str, user=Depends(current_user)):
    item = await db.announcements.find_one({"id": announcement_id}, {"_id": 0})
    if not item: raise HTTPException(404, "Pengumuman tidak ditemukan")
    role = await require_member(item["team_id"], user)
    if item["author_id"] != user["id"] and role != "admin": raise HTTPException(403, "Tidak diizinkan menghapus pengumuman ini")
    await db.announcements.delete_one({"id": announcement_id})
    return {"ok": True}

# ---------- questions ----------
@api.get("/teams/{team_id}/questions")
async def get_questions(team_id: str, user=Depends(current_user)):
    await require_member(team_id, user)
    items = await db.questions.find({"team_id": team_id}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return [q for q in items if not q.get("secret") or user["id"] in q.get("recipients", []) or user["id"] == q.get("author_id")]

@api.post("/teams/{team_id}/questions")
async def post_question(team_id: str, data: QuestionInput, user=Depends(current_user)):
    await require_member(team_id, user)
    item = {"id": str(uuid.uuid4()), "team_id": team_id, "title": data.title, "body": data.body, "mentions": data.mentions, "author": user["name"], "author_id": user["id"], "answers": [], "created_at": now()}
    await db.questions.insert_one(item); item.pop("_id", None)
    for m in data.mentions:
        if m != user["id"]: await notify(m, "mention", f"{user['name']} menyebut Anda di pertanyaan \"{data.title}\"", team_id=team_id)
    return item

@api.patch("/questions/{question_id}")
async def update_question(question_id: str, data: QuestionPatch, user=Depends(current_user)):
    item = await db.questions.find_one({"id": question_id}, {"_id": 0})
    if not item: raise HTTPException(404, "Pertanyaan tidak ditemukan")
    role = await require_member(item["team_id"], user)
    if item["author_id"] != user["id"] and role != "admin": raise HTTPException(403, "Tidak diizinkan mengubah pertanyaan ini")
    updates = data.model_dump(exclude_unset=True)
    if updates: await db.questions.update_one({"id": question_id}, {"$set": updates})
    return await db.questions.find_one({"id": question_id}, {"_id": 0})

@api.delete("/questions/{question_id}")
async def delete_question(question_id: str, user=Depends(current_user)):
    item = await db.questions.find_one({"id": question_id}, {"_id": 0})
    if not item: raise HTTPException(404, "Pertanyaan tidak ditemukan")
    role = await require_member(item["team_id"], user)
    if item["author_id"] != user["id"] and role != "admin": raise HTTPException(403, "Tidak diizinkan menghapus pertanyaan ini")
    await db.questions.delete_one({"id": question_id})
    return {"ok": True}

@api.post("/questions/{question_id}/answers")
async def post_answer(question_id: str, data: AnswerInput, user=Depends(current_user)):
    q = await db.questions.find_one({"id": question_id}, {"_id": 0})
    if not q: raise HTTPException(404, "Pertanyaan tidak ditemukan")
    await require_member(q["team_id"], user)
    answer = {"id": str(uuid.uuid4()), "body": data.body, "author": user["name"], "author_id": user["id"], "created_at": now()}
    await db.questions.update_one({"id": question_id}, {"$push": {"answers": answer}})
    if q["author_id"] != user["id"]: await notify(q["author_id"], "answer", f"{user['name']} menjawab pertanyaan \"{q['title']}\"", team_id=q["team_id"])
    return answer

@api.get("/teams/{team_id}/question-schedules")
async def get_question_schedules(team_id: str, user=Depends(current_user)):
    await require_member(team_id, user)
    return await db.question_schedules.find({"team_id": team_id}, {"_id": 0}).sort("created_at", -1).to_list(100)

@api.post("/teams/{team_id}/question-schedules")
async def create_question_schedule(team_id: str, data: QuestionScheduleInput, user=Depends(current_user)):
    await require_member(team_id, user)
    item = {"id": str(uuid.uuid4()), "team_id": team_id, "title": data.title, "body": data.body, "days": data.days,
            "time": data.time, "recipients": data.recipients, "secret": data.secret, "created_by": user["id"],
            "created_by_name": user["name"], "last_fired_date": None, "created_at": now()}
    await db.question_schedules.insert_one(item); item.pop("_id", None); return item

@api.delete("/question-schedules/{schedule_id}")
async def delete_question_schedule(schedule_id: str, user=Depends(current_user)):
    item = await db.question_schedules.find_one({"id": schedule_id}, {"_id": 0})
    if not item: raise HTTPException(404, "Jadwal tidak ditemukan")
    await require_member(item["team_id"], user)
    await db.question_schedules.delete_one({"id": schedule_id})
    return {"ok": True}

async def question_scheduler_loop():
    while True:
        try:
            local_now = datetime.now()
            weekday = local_now.weekday()  # 0=Senin .. 6=Minggu, matches our days convention
            hhmm = local_now.strftime("%H:%M")
            today_str = local_now.strftime("%Y-%m-%d")
            due = await db.question_schedules.find({"days": weekday, "time": hhmm, "last_fired_date": {"$ne": today_str}}, {"_id": 0}).to_list(200)
            for sched in due:
                # Atomically claim this schedule before firing it, so a concurrent worker/tick
                # racing on the same due item can't send the same routine question twice.
                claimed = await db.question_schedules.find_one_and_update(
                    {"id": sched["id"], "last_fired_date": {"$ne": today_str}}, {"$set": {"last_fired_date": today_str}})
                if not claimed: continue
                item = {"id": str(uuid.uuid4()), "team_id": sched["team_id"], "title": sched["title"], "body": sched["body"],
                         "author": sched["created_by_name"], "author_id": sched["created_by"], "answers": [],
                         "secret": sched["secret"], "recipients": sched["recipients"], "created_at": now()}
                await db.questions.insert_one(item)
                for r in sched["recipients"]:
                    await notify(r, "question", f"Pertanyaan rutin: \"{sched['title']}\"", team_id=sched["team_id"])
        except Exception as e:
            logging.error(f"question_scheduler_loop error: {e}")
        await asyncio.sleep(60)

async def deadline_reminder_loop():
    while True:
        try:
            today_str = datetime.now().strftime("%Y-%m-%d")
            done_list_ids = {l["id"] async for l in db.lists.find({"is_done": True}, {"_id": 0, "id": 1})}
            tasks = await db.tasks.find({"due_date": {"$nin": [None, ""], "$lte": today_str}, "archived": False,
                                          "last_reminder_date": {"$ne": today_str}}, {"_id": 0}).to_list(500)
            for t in tasks:
                if t["list_id"] in done_list_ids: continue
                # Atomically claim this task's reminder before sending it, so a concurrent
                # worker/tick racing on the same overdue task can't double-notify assignees.
                claimed = await db.tasks.find_one_and_update(
                    {"id": t["id"], "last_reminder_date": {"$ne": today_str}}, {"$set": {"last_reminder_date": today_str}})
                if not claimed: continue
                overdue = t["due_date"] < today_str
                text = f"Tugas \"{t['title']}\" {'sudah lewat tenggat' if overdue else 'jatuh tempo hari ini'}"
                for a in t.get("assignees", []):
                    await notify(a, "deadline", text, team_id=t["team_id"], task_id=t["id"])
        except Exception as e:
            logging.error(f"deadline_reminder_loop error: {e}")
        await asyncio.sleep(300)

# ---------- notifications ----------
@api.get("/notifications")
async def get_notifications(skip: int = Query(0, ge=0), limit: int = Query(20, ge=1, le=100), user=Depends(current_user)):
    total = await db.notifications.count_documents({"user_id": user["id"]})
    items = await db.notifications.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    unread = await db.notifications.count_documents({"user_id": user["id"], "read": False})
    return {"items": items, "unread": unread, "has_more": skip + len(items) < total}

@api.patch("/notifications/{notif_id}/read")
async def read_notification(notif_id: str, user=Depends(current_user)):
    await db.notifications.update_one({"id": notif_id, "user_id": user["id"]}, {"$set": {"read": True}})
    return {"ok": True}

@api.patch("/notifications/read-all")
async def read_all_notifications(user=Depends(current_user)):
    await db.notifications.update_many({"user_id": user["id"], "read": False}, {"$set": {"read": True}})
    return {"ok": True}

# ---------- web push ----------
@api.get("/push/vapid-public-key")
async def get_vapid_public_key():
    return {"key": os.environ.get("VAPID_PUBLIC_KEY", "")}

@api.post("/push/subscribe")
async def push_subscribe(subscription: dict, user=Depends(current_user)):
    endpoint = subscription.get("endpoint")
    if not endpoint: raise HTTPException(400, "Subscription tidak valid")
    await db.push_subscriptions.update_one({"endpoint": endpoint},
        {"$set": {"endpoint": endpoint, "user_id": user["id"], "subscription": subscription, "created_at": now()}}, upsert=True)
    return {"ok": True}

@api.post("/push/unsubscribe")
async def push_unsubscribe(data: dict, user=Depends(current_user)):
    endpoint = data.get("endpoint")
    if endpoint: await db.push_subscriptions.delete_one({"endpoint": endpoint, "user_id": user["id"]})
    return {"ok": True}

# ---------- global members / search ----------
@api.get("/members")
async def members(user=Depends(current_user)):
    if user["role"] != ROLE_SUPER_ADMIN: raise HTTPException(403, "Hanya super admin yang dapat melihat daftar pengguna")
    return [public_user(x) async for x in db.users.find({}, {"_id": 0})]

@api.post("/members")
async def create_member(data: MemberCreate, user=Depends(current_user)):
    if user["role"] != ROLE_SUPER_ADMIN: raise HTTPException(403, "Hanya super admin yang dapat membuat akun")
    if data.role not in USER_ROLES: raise HTTPException(400, "Role tidak valid")
    email = str(data.email).lower()
    if await db.users.find_one({"email": email}): raise HTTPException(409, "Email sudah terdaftar")
    new_user = {"id": str(uuid.uuid4()), "email": email, "name": data.name.strip(), "role": data.role,
                "password_hash": hash_password(data.password), "created_at": now()}
    await db.users.insert_one(new_user)
    return public_user(new_user)

@api.patch("/members/{member_id}")
async def update_member(member_id: str, data: MemberUpdate, user=Depends(current_user)):
    if user["role"] != ROLE_SUPER_ADMIN: raise HTTPException(403, "Hanya super admin yang dapat mengubah role")
    if data.role not in USER_ROLES: raise HTTPException(400, "Role tidak valid")
    result = await db.users.update_one({"id": member_id}, {"$set": {"role": data.role}})
    if not result.matched_count: raise HTTPException(404, "Member tidak ditemukan")
    return {"ok": True}

@api.patch("/members/{member_id}/password")
async def update_member_password(member_id: str, data: MemberPasswordUpdate, user=Depends(current_user)):
    if user["role"] != ROLE_SUPER_ADMIN: raise HTTPException(403, "Hanya super admin yang dapat mengubah password akun")
    result = await db.users.update_one({"id": member_id}, {"$set": {"password_hash": hash_password(data.new_password)}})
    if not result.matched_count: raise HTTPException(404, "Pengguna tidak ditemukan")
    return {"ok": True}

@api.delete("/members/{member_id}")
async def delete_member(member_id: str, user=Depends(current_user)):
    if user["role"] != ROLE_SUPER_ADMIN: raise HTTPException(403, "Hanya super admin yang dapat menghapus akun")
    if member_id == user["id"]: raise HTTPException(400, "Tidak bisa menghapus akun sendiri")
    result = await db.users.delete_one({"id": member_id})
    if not result.deleted_count: raise HTTPException(404, "Pengguna tidak ditemukan")
    await db.team_members.delete_many({"user_id": member_id})
    return {"ok": True}

@api.get("/search")
async def search(q: str = "", user=Depends(current_user)):
    if not q.strip(): return {"tasks": [], "documents": [], "teams": []}
    memberships = await db.team_members.find({"user_id": user["id"]}, {"_id": 0}).to_list(200)
    roles = {m["team_id"]: m["role"] for m in memberships}
    team_ids = list(roles.keys())
    regex = {"$regex": re.escape(q), "$options": "i"}
    tasks = await db.tasks.find({"team_id": {"$in": team_ids}, "$or": [{"title": regex}, {"description": regex}]}, {"_id": 0}).to_list(30)
    visible_tasks = [t for t in tasks if task_visible(t, user, roles.get(t["team_id"]))]
    docs = await db.documents.find({"team_id": {"$in": team_ids}, "filename": regex}, {"_id": 0}).to_list(20)
    teams = await db.teams.find({"id": {"$in": team_ids}, "name": regex}, {"_id": 0}).to_list(10)
    return {"tasks": visible_tasks, "documents": docs, "teams": teams}

@api.get("/")
async def root(): return {"message": "FallenStar Workspace API"}
app.include_router(api)
configured_origins = set(x.strip() for x in os.environ["CORS_ORIGINS"].split(",") if x.strip() and x.strip() != "*")
configured_origins.update({os.environ["FRONTEND_URL"], "http://localhost:3000"})

@app.middleware("http")
async def strict_cors(request: Request, call_next):
    origin = request.headers.get("origin")
    if request.method == "OPTIONS":
        if origin not in configured_origins: return Response(status_code=403)
        return Response(status_code=204, headers={"Access-Control-Allow-Origin": origin, "Access-Control-Allow-Credentials": "true", "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS", "Access-Control-Allow-Headers": request.headers.get("access-control-request-headers", "Content-Type, Authorization"), "Vary": "Origin"})
    response = await call_next(request)
    if origin in configured_origins:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
        response.headers["Vary"] = "Origin"
    return response
logging.basicConfig(level=logging.INFO)
@app.on_event("shutdown")
async def shutdown(): client.close()
