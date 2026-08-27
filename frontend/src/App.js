import { useEffect, useMemo, useState } from "react";
import "@/App.css"; import "@/extra.css"; import "@/team.css";
import { CheckCircle2 } from "lucide-react";
import { client, apiError } from "./lib/api";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { TeamOverview } from "./components/TeamOverview";
import { KanbanBoard } from "./components/KanbanBoard";
import { ChatGroup } from "./components/ChatGroup";
import { Announcements } from "./components/Announcements";
import { Schedule } from "./components/Schedule";
import { Questions } from "./components/Questions";
import { Documents } from "./components/Documents";
import { NewTaskModal } from "./components/NewTaskModal";
import { TaskDetailModal } from "./components/TaskDetailModal";
import { MembersModal } from "./components/MembersModal";
import { CreateTeamModal } from "./components/CreateTeamModal";
import { ProfileModal } from "./components/ProfileModal";
import { NotificationsPanel } from "./components/NotificationsPanel";
import { UserAdminPage } from "./components/UserAdminPage";

const NOTIF_TITLES = { mention: "Disebut di Chat", announcement: "Pengumuman Baru", answer: "Pertanyaan Dijawab", assignment: "Ditugaskan ke Anda", deadline: "Tenggat Tugas", question: "Pertanyaan Rutin" };
const ORIGINAL_TITLE = document.title;

let audioCtx = null;
function playChime() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
    const t0 = audioCtx.currentTime;
    [880, 1320].forEach((freq, i) => {
      const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
      osc.type = "sine"; osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, t0 + i * 0.09);
      gain.gain.linearRampToValueAtTime(0.15, t0 + i * 0.09 + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + i * 0.09 + 0.22);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t0 + i * 0.09); osc.stop(t0 + i * 0.09 + 0.24);
    });
  } catch (e) { /* audio unsupported/blocked, ignore */ }
}

function urlBase64ToUint8Array(base64) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = window.atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

async function subscribeWebPush() {
  try {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      const { data } = await client.get("/push/vapid-public-key");
      if (!data.key) return;
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(data.key) });
    }
    await client.post("/push/subscribe", sub.toJSON());
  } catch (e) { /* push unsupported or permission not granted, ignore */ }
}

function notifyBrowser(title, body, onClick) {
  playChime();
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const n = new Notification(title, { body, tag: title + body });
  if (onClick) n.onclick = () => { window.focus(); onClick(); n.close(); };
}

const unreadTeamsKey = userId => `pmng_unread_chat_${userId}`;
function loadUnreadTeams(userId) {
  try { return new Set(JSON.parse(localStorage.getItem(unreadTeamsKey(userId)) || "[]")); } catch (e) { return new Set(); }
}
function saveUnreadTeams(userId, set) {
  try { localStorage.setItem(unreadTeamsKey(userId), JSON.stringify([...set])); } catch (e) { /* ignore */ }
}

function Auth({ onLogin }) {
  const [form, setForm] = useState({ email: "", password: "" }), [error, setError] = useState("");
  const submit = async e => { e.preventDefault(); try { const r = await client.post("/auth/login", form); onLogin(r.data); } catch (x) { setError(apiError(x)); } };
  return (
    <main className="auth-shell">
      <section className="auth-brand">
        <div className="brand-mark">P</div>
        <p className="eyebrow">PROJECT MANAGEMENT · CREATED BY R</p>
        <h1>Kerja tim, <em>lebih terarah.</em></h1>
        <p className="auth-copy">Satu ruang kerja untuk menyusun prioritas, menjaga ritme, dan menyelesaikan hal penting bersama tim Anda.</p>
        <div className="auth-signal"><CheckCircle2 size={18} /> Semua progres tim, terlihat jelas</div>
      </section>
      <section className="auth-panel">
        <div className="mobile-logo"><div className="brand-mark">P</div><b>Project Management</b></div>
        <p className="eyebrow">SELAMAT DATANG KEMBALI</p>
        <h2>Masuk ke ruang kerja Anda</h2>
        <p className="muted">Lanjutkan pekerjaan terbaik Anda hari ini.</p>
        <form onSubmit={submit} data-testid="auth-form">
          <label>Email<input data-testid="auth-email-input" type="email" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="nama@perusahaan.com" /></label>
          <label>Password<input data-testid="auth-password-input" type="password" required value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="Minimal 6 karakter" /></label>
          {error && <div className="error" data-testid="auth-error">{error}</div>}
          <button className="primary wide" data-testid="auth-submit-button">Masuk ke workspace<span>→</span></button>
        </form>
        <p className="fineprint">Belum punya akun? Hubungi admin workspace Anda untuk dibuatkan akun.</p>
      </section>
    </main>
  );
}

function App() {
  const [user, setUser] = useState(null), [checking, setChecking] = useState(true);
  useEffect(() => { client.get("/auth/me").then(r => setUser(r.data)).catch(() => { }).finally(() => setChecking(false)); }, []);
  useEffect(() => { const onExpired = () => setUser(null); window.addEventListener("session-expired", onExpired); return () => window.removeEventListener("session-expired", onExpired); }, []);
  if (checking) return <div className="loading-screen">Memuat workspace…</div>;
  return user ? <Workspace user={user} onLogout={() => { client.post("/auth/logout"); setUser(null); }} onUserUpdate={setUser} /> : <Auth onLogin={setUser} />;
}

function Workspace({ user, onLogout, onUserUpdate }) {
  const urlParams = new URLSearchParams(window.location.search);
  const [teams, setTeams] = useState([]);
  const [activeTeamId, setActiveTeamId] = useState(urlParams.get("team") || null);
  const [tab, setTab] = useState(urlParams.get("tab") || "overview");
  const [lists, setLists] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [members, setMembers] = useState([]);
  const [labels, setLabels] = useState([]);
  const [notif, setNotif] = useState({ items: [], unread: 0 });
  const [notifOpen, setNotifOpen] = useState(false);
  const [chatUnread, setChatUnread] = useState(() => loadUnreadTeams(user.id).has(activeTeamId));
  const [notifPermission, setNotifPermission] = useState("Notification" in window ? Notification.permission : "unsupported");
  const [taskModal, setTaskModal] = useState(null);
  const [membersModal, setMembersModal] = useState(null);
  const [createTeamOpen, setCreateTeamOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [toast, setToast] = useState("");
  const [userAdminOpen, setUserAdminOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const activeTeam = teams.find(t => t.id === activeTeamId);

  const loadTeams = () => client.get("/teams").then(r => {
    setTeams(r.data);
    if (activeTeamId && !r.data.some(t => t.id === activeTeamId)) setActiveTeamId(r.data[0]?.id || null);
    else if (!activeTeamId && r.data.length) setActiveTeamId(r.data[0].id);
  });
  const loadTeamData = (teamId) => Promise.all([
    client.get(`/teams/${teamId}/lists`), client.get(`/teams/${teamId}/tasks`), client.get(`/teams/${teamId}/members`), client.get(`/teams/${teamId}/labels`)
  ]).then(([l, t, m, la]) => { setLists(l.data); setTasks(t.data); setMembers(m.data); setLabels(la.data); });
  const loadNotif = () => client.get("/notifications", { params: { skip: 0, limit: 20 } }).then(r => setNotif(r.data));
  const enableNotifications = () => {
    if (!("Notification" in window)) return;
    Notification.requestPermission().then(p => { setNotifPermission(p); if (p === "granted") subscribeWebPush(); });
  };
  const loadMoreNotif = () => client.get("/notifications", { params: { skip: notif.items.length, limit: 20 } }).then(r => setNotif(prev => ({ items: [...prev.items, ...r.data.items], unread: r.data.unread, has_more: r.data.has_more })));
  const markNotifRead = (id) => { client.patch(`/notifications/${id}/read`).catch(loadNotif); setNotif(prev => ({ ...prev, items: prev.items.map(n => n.id === id ? { ...n, read: true } : n), unread: Math.max(0, prev.unread - (prev.items.find(n => n.id === id && !n.read) ? 1 : 0)) })); };
  const markAllNotifRead = () => { client.patch("/notifications/read-all").catch(loadNotif); setNotif(prev => ({ ...prev, items: prev.items.map(n => ({ ...n, read: true })), unread: 0 })); };

  useEffect(() => { loadTeams(); loadNotif(); }, []);
  useEffect(() => {
    if (!("Notification" in window)) return;
    if (Notification.permission === "granted") { subscribeWebPush(); return; }
    if (Notification.permission !== "default") return;
    Notification.requestPermission().then(p => { setNotifPermission(p); if (p === "granted") subscribeWebPush(); });
  }, []);
  useEffect(() => {
    const unreadSet = loadUnreadTeams(user.id);
    if (activeTeamId && tab === "chat" && unreadSet.has(activeTeamId)) {
      unreadSet.delete(activeTeamId); saveUnreadTeams(user.id, unreadSet);
    }
    setChatUnread(activeTeamId ? unreadSet.has(activeTeamId) : false);
    if (!activeTeamId || tab === "chat" || !process.env.REACT_APP_BACKEND_URL) return;
    const wsUrl = process.env.REACT_APP_BACKEND_URL.replace(/^http/, "ws") + `/api/ws/chat/${activeTeamId}`;
    const ws = new WebSocket(wsUrl);
    ws.onmessage = e => {
      const data = JSON.parse(e.data);
      if (data.type === "message" && data.author_id !== user.id) {
        setChatUnread(true);
        const set = loadUnreadTeams(user.id); set.add(activeTeamId); saveUnreadTeams(user.id, set);
        notifyBrowser(`Pesan baru dari ${data.author}`, data.body, () => { setTab("chat"); });
      }
    };
    return () => ws.close();
  }, [activeTeamId, tab, user.id]);
  useEffect(() => {
    if (!process.env.REACT_APP_BACKEND_URL) return;
    let closed = false, retry = 0, ws;
    const connect = () => {
      const wsUrl = process.env.REACT_APP_BACKEND_URL.replace(/^http/, "ws") + "/api/ws/notifications";
      ws = new WebSocket(wsUrl);
      ws.onopen = () => { retry = 0; };
      ws.onmessage = e => {
        const data = JSON.parse(e.data);
        if (data.type !== "notification") return;
        setNotif(prev => prev.items.some(n => n.id === data.item.id) ? prev : { ...prev, items: [data.item, ...prev.items], unread: data.unread });
        notifyBrowser(NOTIF_TITLES[data.item.type] || "Notifikasi Baru", data.item.text, () => setNotifOpen(true));
      };
      ws.onclose = () => { if (closed) return; const delay = Math.min(1000 * 2 ** retry, 10000); retry += 1; setTimeout(connect, delay); };
      ws.onerror = () => ws.close();
    };
    connect();
    return () => { closed = true; ws?.close(); };
  }, []);
  useEffect(() => {
    const total = notif.unread + (chatUnread ? 1 : 0);
    document.title = total > 0 ? `(${total}) ${ORIGINAL_TITLE}` : ORIGINAL_TITLE;
  }, [notif.unread, chatUnread]);
  useEffect(() => { if (activeTeamId) loadTeamData(activeTeamId); }, [activeTeamId]);
  useEffect(() => {
    const params = new URLSearchParams();
    if (activeTeamId) params.set("team", activeTeamId);
    if (tab) params.set("tab", tab);
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [activeTeamId, tab]);
  useEffect(() => {
    if (!query.trim()) { setSearchResults([]); return; }
    const t = setTimeout(() => client.get("/search", { params: { q: query } }).then(r => setSearchResults(r.data.tasks)), 300);
    return () => clearTimeout(t);
  }, [query]);

  const showToast = msg => { setToast(msg); setTimeout(() => setToast(""), 2200); };
  const selectTeam = id => { setActiveTeamId(id); setTab("overview"); setUserAdminOpen(false); };
  const goHQ = () => { setActiveTeamId(null); setUserAdminOpen(false); };
  const listsById = useMemo(() => Object.fromEntries(lists.map(l => [l.id, l])), [lists]);

  const openNotification = async n => {
    setNotifOpen(false);
    if (n.team_id && n.team_id !== activeTeamId) { setActiveTeamId(n.team_id); await loadTeamData(n.team_id); }
    if (n.type === "announcement") { setTab("announcements"); return; }
    if (n.type === "answer") { setTab("questions"); return; }
    if (n.task_id) {
      setTab("tasks");
      try { const r = await client.get(`/tasks/${n.task_id}`); setTaskModal({ mode: "detail", task: r.data }); } catch (e) { }
    }
  };

  return (
    <div className="app-frame">
      <Sidebar teams={teams} activeTeamId={activeTeamId} onSelectHQ={goHQ} onSelectTeam={selectTeam}
        onCreateTeam={() => setCreateTeamOpen(true)} user={user} onLogout={onLogout}
        userAdminOpen={userAdminOpen} onOpenUserAdmin={() => { setActiveTeamId(null); setUserAdminOpen(true); }} />
      <main className="content">
        <TopBar team={activeTeam} tab={tab} onTabChange={setTab} onOpenHQ={goHQ} members={members} myRole={activeTeam?.my_role}
          onOpenAddMember={() => setMembersModal("add")} onOpenAccess={() => setMembersModal("access")}
          onOpenSettings={() => setMembersModal("settings")} notifUnread={notif.unread} chatUnread={chatUnread}
          notifPermission={notifPermission} onEnableNotif={enableNotifications}
          onToggleNotif={() => setNotifOpen(!notifOpen)} user={user} onLogout={onLogout} onOpenProfile={() => setProfileOpen(true)}
          query={query} setQuery={setQuery} searchResults={searchResults}
          onSelectSearchResult={async r => { if (r.team_id !== activeTeamId) { setActiveTeamId(r.team_id); await loadTeamData(r.team_id); } setTab("tasks"); setTaskModal({ mode: "detail", task: r }); setQuery(""); setSearchResults([]); }} />
        {notifOpen && <NotificationsPanel items={notif.items} hasMore={notif.has_more} onLoadMore={loadMoreNotif} onRead={markNotifRead} onReadAll={markAllNotifRead} onSelect={openNotification} />}

        {userAdminOpen ? (
          <UserAdminPage currentUser={user} />
        ) : !activeTeam ? (
          <div className="page">
            <div className="page-heading">
              <div><p className="eyebrow">BERANDA</p><h1>Selamat datang, {user.name}</h1><p className="muted">Pilih tim untuk mulai bekerja, atau buat tim baru.</p></div>
              <button className="primary" onClick={() => setCreateTeamOpen(true)} data-testid="hq-create-team-button">+ Buat Tim</button>
            </div>
            <div className="hq-team-grid" data-testid="hq-team-grid">
              {teams.map(t => (
                <div className="hq-team-card" key={t.id} onClick={() => selectTeam(t.id)} data-testid={`hq-team-card-${t.id}`}>
                  <span className="hq-team-dot" style={{ background: t.color }} />
                  <b>{t.name}</b><small>{t.member_count} anggota</small>
                </div>
              ))}
              {!teams.length && <p className="muted">Anda belum memiliki tim. Buat tim pertama Anda.</p>}
            </div>
          </div>
        ) : tab === "overview" ? (
          <TeamOverview team={activeTeam} tasks={tasks.filter(t => !t.archived)} listsById={listsById} onNavigate={setTab} />
        ) : tab === "tasks" ? (
          <KanbanBoard team={activeTeam} teams={teams} lists={lists} tasks={tasks} members={members} labels={labels} myRole={activeTeam.my_role}
            onOpenTask={(task) => setTaskModal({ mode: "detail", task })}
            onCreateTask={listId => setTaskModal({ mode: "new", listId })}
            onReload={() => loadTeamData(activeTeamId)} />
        ) : tab === "chat" ? (
          <ChatGroup team={activeTeam} members={members} currentUser={user} myRole={activeTeam.my_role} />
        ) : tab === "announcements" ? (
          <Announcements team={activeTeam} currentUser={user} myRole={activeTeam.my_role} />
        ) : tab === "schedule" ? (
          <Schedule team={activeTeam} lists={lists} onReload={() => loadTeamData(activeTeamId)} />
        ) : tab === "questions" ? (
          <Questions team={activeTeam} members={members} currentUser={user} myRole={activeTeam.my_role} />
        ) : tab === "documents" ? (
          <Documents team={activeTeam} currentUser={user} myRole={activeTeam.my_role} />
        ) : null}

        {taskModal?.mode === "new" && (
          <NewTaskModal teamId={activeTeamId} lists={lists} listId={taskModal.listId} members={members}
            onClose={() => setTaskModal(null)} onCreated={() => { setTaskModal(null); loadTeamData(activeTeamId); showToast("Tugas berhasil dibuat"); }} />
        )}
        {taskModal?.mode === "detail" && (
          <TaskDetailModal task={taskModal.task} team={activeTeam} teams={teams} lists={lists} members={members} teamLabels={labels} myRole={activeTeam.my_role}
            onLabelCreated={(label) => setLabels(prev => [...prev, label])}
            currentUser={user} onClose={() => setTaskModal(null)} onReload={() => loadTeamData(activeTeamId)} />
        )}
        {membersModal && activeTeam && (
          <MembersModal team={activeTeam} mode={membersModal} members={members} myRole={activeTeam.my_role}
            currentUser={user} onClose={() => setMembersModal(null)} onChanged={() => loadTeamData(activeTeamId)}
            onTeamUpdated={() => loadTeams()}
            onTeamDeleted={() => { setMembersModal(null); goHQ(); loadTeams(); showToast("Tim berhasil dihapus"); }} />
        )}
        {createTeamOpen && (
          <CreateTeamModal onClose={() => setCreateTeamOpen(false)} onCreated={(team) => { setCreateTeamOpen(false); loadTeams(); setActiveTeamId(team.id); }} />
        )}
        {profileOpen && (
          <ProfileModal user={user} onClose={() => setProfileOpen(false)} onUpdated={onUserUpdate} />
        )}
        {toast && <div className="toast" data-testid="success-toast">{toast}</div>}
      </main>
    </div>
  );
}
export default App;
