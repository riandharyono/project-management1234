import { useEffect, useMemo, useRef, useState } from "react";
import "@/App.css"; import "@/extra.css"; import "@/team.css";
import { CheckCircle2, Eye, EyeOff } from "lucide-react";
import { client, apiError } from "./lib/api";
import { canCreateTeam, canViewAllTeams } from "./lib/roles";
import { BrandMark } from "./components/BrandMark";
import loginPhoto from "./assets/login-photo.jpg";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { TeamOverview } from "./components/TeamOverview";
import { KanbanBoard } from "./components/KanbanBoard";
import { Announcements } from "./components/Announcements";
import { Schedule } from "./components/Schedule";
import { Questions } from "./components/Questions";
import { Documents } from "./components/Documents";
import { DataRequests } from "./components/DataRequests";
import { DataRecapPage } from "./components/DataRecapPage";
import { MonitoringPage } from "./components/MonitoringPage";
import { NewTaskModal } from "./components/NewTaskModal";
import { TaskDetailModal } from "./components/TaskDetailModal";
import { MembersModal } from "./components/MembersModal";
import { CreateTeamModal } from "./components/CreateTeamModal";
import { ProfileModal } from "./components/ProfileModal";
import { NotificationsPanel } from "./components/NotificationsPanel";
import { UserAdminPage } from "./components/UserAdminPage";
import { MyWork } from "./components/MyWork";
import { CommandPalette } from "./components/CommandPalette";

const NOTIF_TITLES = { mention: "Anda Disebut", announcement: "Pengumuman Baru", answer: "Check-in dijawab", assignment: "Ditugaskan ke Anda", deadline: "Tenggat Tugas", question: "Check-in rutin" };
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

const boardCache = new Map();
const boardPrefetching = new Set();
const EMPTY_BOARD = { lists: [], tasks: [], members: [], labels: [] };

function Auth({ onLogin }) {
  const [form, setForm] = useState({ email: "", password: "" }), [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const submit = async e => { e.preventDefault(); try { const r = await client.post("/auth/login", form); onLogin(r.data); } catch (x) { setError(apiError(x)); } };
  return (
    <main className="auth-shell">
      <section className="auth-brand" style={{ backgroundImage: `linear-gradient(180deg, rgba(30,20,60,.5) 0%, rgba(20,14,48,.72) 55%, rgba(14,10,36,.92) 100%), url(${loginPhoto})` }}>
        <BrandMark size={40} />
        <p className="eyebrow">FALLENSTAR</p>
        <h1>Kerja tim, <em>lebih terarah.</em></h1>
        <p className="auth-copy">Satu ruang kerja untuk menyusun prioritas, menjaga ritme, dan menyelesaikan hal penting bersama tim Anda.</p>
        <div className="auth-signal"><CheckCircle2 size={18} /> Semua progres tim, terlihat jelas</div>
      </section>
      <section className="auth-panel">
        <div className="mobile-logo"><BrandMark size={28} /><b>FallenStar</b></div>
        <p className="eyebrow">SELAMAT DATANG</p>
        <h2>Masuk ke FallenStar</h2>
        <p className="muted">Lanjutkan pekerjaan terbaik Anda hari ini.</p>
        <form onSubmit={submit} data-testid="auth-form">
          <label>Email<input data-testid="auth-email-input" type="email" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="nama@perusahaan.com" /></label>
          <label>Password
            <div className="password-field">
              <input data-testid="auth-password-input" type={showPassword ? "text" : "password"} required value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })} placeholder="Minimal 6 karakter" />
              <button type="button" className="password-toggle" onClick={() => setShowPassword(v => !v)}
                data-testid="auth-password-toggle" aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}>
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </label>
          {error && <div className="error" data-testid="auth-error">{error}</div>}
          <button className="primary wide" data-testid="auth-submit-button">Masuk<span>→</span></button>
        </form>
        <p className="fineprint">Belum punya akun? Hubungi admin Anda untuk dibuatkan akun.</p>
      </section>
    </main>
  );
}

function App() {
  const [user, setUser] = useState(null), [checking, setChecking] = useState(true);
  useEffect(() => { client.get("/auth/me").then(r => setUser(r.data)).catch(() => { }).finally(() => setChecking(false)); }, []);
  useEffect(() => { const onExpired = () => { boardCache.clear(); boardPrefetching.clear(); setUser(null); }; window.addEventListener("session-expired", onExpired); return () => window.removeEventListener("session-expired", onExpired); }, []);
  if (checking) return <div className="loading-screen">Memuat workspace…</div>;
  return user ? <Workspace user={user} onLogout={() => { client.post("/auth/logout"); boardCache.clear(); boardPrefetching.clear(); setUser(null); }} onUserUpdate={setUser} /> : <Auth onLogin={setUser} />;
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
  const [notifPermission, setNotifPermission] = useState("Notification" in window ? Notification.permission : "unsupported");
  const [taskModal, setTaskModal] = useState(null);
  const [membersModal, setMembersModal] = useState(null);
  const [createTeamOpen, setCreateTeamOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [toast, setToast] = useState("");
  const [userAdminOpen, setUserAdminOpen] = useState(urlParams.get("page") === "users");
  const [monitoringOpen, setMonitoringOpen] = useState(urlParams.get("page") === "monitoring");
  const [recapOpen, setRecapOpen] = useState(urlParams.get("page") === "recap");
  const [profileOpen, setProfileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [boardLoading, setBoardLoading] = useState(!!urlParams.get("team"));
  const skipUrl = useRef(false);
  const bootUrl = useRef(true);
  const loadGen = useRef(0);

  const activeTeam = teams.find(t => t.id === activeTeamId);

  const applyBoard = (data) => {
    setLists(data.lists || []);
    setTasks(data.tasks || []);
    setMembers(data.members || []);
    setLabels(data.labels || []);
  };
  const fetchBoard = (teamId) => client.get(`/teams/${teamId}/board`).then(r => r.data).catch(e => {
    if (e.response?.status !== 404) throw e;
    return Promise.all([
      client.get(`/teams/${teamId}/lists`), client.get(`/teams/${teamId}/tasks`),
      client.get(`/teams/${teamId}/members`), client.get(`/teams/${teamId}/labels`),
    ]).then(([l, t, m, la]) => ({ lists: l.data, tasks: t.data, members: m.data, labels: la.data }));
  });
  const loadTeams = () => client.get("/teams").then(r => {
    setTeams(r.data);
    if (activeTeamId && !r.data.some(t => t.id === activeTeamId)) setActiveTeamId(null);
  });
  const loadTeamData = (teamId, { silent } = {}) => {
    if (!teamId) return Promise.resolve(EMPTY_BOARD);
    const gen = ++loadGen.current;
    if (!silent && !boardCache.has(teamId)) setBoardLoading(true);
    return fetchBoard(teamId).then(data => {
      boardCache.set(teamId, data);
      if (loadGen.current !== gen) return data;
      applyBoard(data);
      setBoardLoading(false);
      return data;
    }).catch(e => {
      if (loadGen.current !== gen) return EMPTY_BOARD;
      setBoardLoading(false);
      setToast(apiError(e));
      setTimeout(() => setToast(""), 2200);
      return EMPTY_BOARD;
    });
  };
  const prefetchTeam = (teamId) => {
    if (!teamId || boardCache.has(teamId) || boardPrefetching.has(teamId)) return;
    boardPrefetching.add(teamId);
    fetchBoard(teamId).then(data => boardCache.set(teamId, data)).catch(() => {}).finally(() => boardPrefetching.delete(teamId));
  };
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
    if (!process.env.REACT_APP_BACKEND_URL) return;
    let closed = false, retry = 0, ws;
    const connect = () => {
      const wsUrl = process.env.REACT_APP_BACKEND_URL.replace(/^http/, "ws") + "/api/ws/notifications";
      ws = new WebSocket(wsUrl);
      ws.onopen = () => { retry = 0; };
      ws.onmessage = e => {
        let data; try { data = JSON.parse(e.data); } catch (err) { return; }
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
    document.title = notif.unread > 0 ? `(${notif.unread}) ${ORIGINAL_TITLE}` : ORIGINAL_TITLE;
  }, [notif.unread]);
  useEffect(() => {
    if (!activeTeamId) { setBoardLoading(false); return; }
    const cached = boardCache.get(activeTeamId);
    if (cached) { applyBoard(cached); setBoardLoading(false); loadTeamData(activeTeamId, { silent: true }); }
    else loadTeamData(activeTeamId);
  }, [activeTeamId]);
  useEffect(() => {
    const taskId = urlParams.get("task");
    if (!taskId) return;
    client.get(`/tasks/${taskId}`).then(r => {
      skipUrl.current = true;
      setActiveTeamId(r.data.team_id);
      setTab("tasks");
      setTaskModal({ mode: "detail", task: r.data });
    }).catch(() => {});
  }, []);
  const taskIdInUrl = taskModal?.mode === "detail" ? taskModal.task?.id : null;
  useEffect(() => {
    const params = new URLSearchParams();
    if (userAdminOpen) params.set("page", "users");
    else if (monitoringOpen) params.set("page", "monitoring");
    else if (recapOpen) params.set("page", "recap");
    else {
      if (activeTeamId) params.set("team", activeTeamId);
      if (activeTeamId && tab) params.set("tab", tab);
      if (taskIdInUrl) params.set("task", taskIdInUrl);
    }
    const next = params.toString() ? `?${params.toString()}` : window.location.pathname;
    const current = window.location.pathname + window.location.search;
    if (next === current) return;
    const replace = bootUrl.current || skipUrl.current;
    bootUrl.current = false;
    skipUrl.current = false;
    if (replace) window.history.replaceState(null, "", next);
    else window.history.pushState(null, "", next);
  }, [activeTeamId, tab, taskIdInUrl, userAdminOpen, monitoringOpen, recapOpen]);
  useEffect(() => {
    const onPop = () => {
      const p = new URLSearchParams(window.location.search);
      skipUrl.current = true;
      setUserAdminOpen(p.get("page") === "users");
      setMonitoringOpen(p.get("page") === "monitoring");
      setRecapOpen(p.get("page") === "recap");
      setActiveTeamId(p.get("team"));
      setTab(p.get("tab") || "overview");
      const task = p.get("task");
      if (task) client.get(`/tasks/${task}`).then(r => setTaskModal({ mode: "detail", task: r.data })).catch(() => setTaskModal(null));
      else setTaskModal(null);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  useEffect(() => {
    const onKey = e => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    if (!query.trim()) { setSearchResults([]); return; }
    const t = setTimeout(() => client.get("/search", { params: { q: query } }).then(r => setSearchResults(r.data.tasks || [])), 300);
    return () => clearTimeout(t);
  }, [query]);

  const showToast = msg => { setToast(msg); setTimeout(() => setToast(""), 2200); };
  const selectTeam = (id, initialTab = "tasks") => {
    const cached = boardCache.get(id);
    if (cached) { applyBoard(cached); setBoardLoading(false); }
    else { applyBoard(EMPTY_BOARD); setBoardLoading(true); }
    setActiveTeamId(id); setTab(initialTab); setUserAdminOpen(false); setMonitoringOpen(false); setRecapOpen(false); setTaskModal(null);
  };
  const goHQ = () => { setActiveTeamId(null); setUserAdminOpen(false); setMonitoringOpen(false); setRecapOpen(false); setTaskModal(null); setBoardLoading(false); };
  const openRecap = () => { setActiveTeamId(null); setUserAdminOpen(false); setMonitoringOpen(false); setRecapOpen(true); setTaskModal(null); setBoardLoading(false); };
  const openTask = (task) => {
    if (task.team_id && task.team_id !== activeTeamId) {
      const cached = boardCache.get(task.team_id);
      if (cached) { applyBoard(cached); setBoardLoading(false); }
      setActiveTeamId(task.team_id);
    }
    setUserAdminOpen(false);
    setMonitoringOpen(false);
    setRecapOpen(false);
    setTab("tasks");
    setTaskModal({ mode: "detail", task });
  };
  const closeTask = () => setTaskModal(null);
  const listsById = useMemo(() => Object.fromEntries(lists.map(l => [l.id, l])), [lists]);

  const openNotification = async n => {
    setNotifOpen(false);
    if (n.team_id && n.team_id !== activeTeamId) {
      const cached = boardCache.get(n.team_id);
      if (cached) { applyBoard(cached); setBoardLoading(false); }
      setActiveTeamId(n.team_id);
    }
    if (n.type === "announcement") { setTab("announcements"); return; }
    if (n.type === "answer" || n.type === "question") { setTab("questions"); return; }
    if (n.task_id) {
      setTab("tasks");
      try { const r = await client.get(`/tasks/${n.task_id}`); setTaskModal({ mode: "detail", task: r.data }); } catch (e) { }
    }
  };

  return (
    <div className="app-frame">
      <Sidebar teams={teams} activeTeamId={activeTeamId} onSelectHQ={goHQ} onSelectTeam={selectTeam}
        onPrefetchTeam={prefetchTeam}
        onCreateTeam={() => canCreateTeam(user) && setCreateTeamOpen(true)} user={user}
        userAdminOpen={userAdminOpen} onOpenUserAdmin={() => { setActiveTeamId(null); setUserAdminOpen(true); setMonitoringOpen(false); setRecapOpen(false); }}
        monitoringOpen={monitoringOpen} onOpenMonitoring={() => { setActiveTeamId(null); setMonitoringOpen(true); setUserAdminOpen(false); setRecapOpen(false); }}
        recapOpen={recapOpen} onOpenRecap={openRecap}
        onOpenProfile={() => setProfileOpen(true)} />
      <main className="content" data-tab={userAdminOpen ? "users" : monitoringOpen ? "monitoring" : recapOpen ? "recap" : (activeTeam ? tab : "hq")}>
        <TopBar team={activeTeam} tab={tab} onTabChange={setTab} onOpenHQ={goHQ} members={members} myRole={activeTeam?.my_role}
          onOpenAddMember={() => setMembersModal("add")} onOpenAccess={() => setMembersModal("access")}
          onOpenSettings={() => setMembersModal("settings")} notifUnread={notif.unread}
          notifPermission={notifPermission} onEnableNotif={enableNotifications}
          onToggleNotif={() => setNotifOpen(!notifOpen)} user={user} onLogout={onLogout} onOpenProfile={() => setProfileOpen(true)}
          query={query} setQuery={setQuery} searchResults={searchResults}
          onOpenPalette={() => setPaletteOpen(true)}
          onSelectSearchResult={async r => { setQuery(""); setSearchResults([]); openTask(r); }} />
        {notifOpen && <NotificationsPanel items={notif.items} hasMore={notif.has_more} onLoadMore={loadMoreNotif} onRead={markNotifRead} onReadAll={markAllNotifRead} onSelect={openNotification} />}

        {userAdminOpen ? (
          <UserAdminPage currentUser={user} />
        ) : monitoringOpen ? (
          <MonitoringPage onOpenTeam={(id, initialTab) => selectTeam(id, initialTab)} />
        ) : recapOpen ? (
          <DataRecapPage onOpenTeam={(id, initialTab) => selectTeam(id, initialTab)} onOpenTask={openTask} />
        ) : !activeTeam ? (
          <MyWork user={user} teams={teams} onOpenTeam={selectTeam}
            onPrefetchTeam={prefetchTeam}
            onOpenTask={openTask}
            onOpenMention={openNotification}
            onCreateTeam={() => canCreateTeam(user) && setCreateTeamOpen(true)} />
        ) : tab === "overview" ? (
          <TeamOverview team={activeTeam} tasks={tasks.filter(t => !t.archived)} listsById={listsById} members={members} onNavigate={setTab}
            onOpenTask={openTask} />
        ) : tab === "tasks" ? (
          <KanbanBoard team={activeTeam} teams={teams} lists={lists} tasks={tasks} members={members} labels={labels} myRole={activeTeam.my_role}
            boardLoading={boardLoading}
            onOpenTask={openTask}
            onCreateTask={listId => setTaskModal({ mode: "new", listId })}
            onReload={() => loadTeamData(activeTeamId)} />
        ) : tab === "data-requests" ? (
          <DataRequests team={activeTeam} members={members} myRole={activeTeam.my_role} currentUser={user} onTeamUpdated={() => loadTeams()} onOpenTask={openTask} />
        ) : tab === "data-recap" ? (
          <DataRecapPage onOpenTeam={(id, initialTab) => selectTeam(id, initialTab)} onOpenTask={openTask} />
        ) : tab === "announcements" ? (
          <Announcements team={activeTeam} members={members} currentUser={user} myRole={activeTeam.my_role} />
        ) : tab === "schedule" ? (
          <Schedule team={activeTeam} lists={lists} onReload={() => loadTeamData(activeTeamId)} onOpenTask={openTask} />
        ) : tab === "questions" ? (
          <Questions team={activeTeam} members={members} currentUser={user} myRole={activeTeam.my_role} />
        ) : tab === "documents" ? (
          <Documents team={activeTeam} currentUser={user} myRole={activeTeam.my_role} />
        ) : null}

        {taskModal?.mode === "new" && (
          <NewTaskModal teamId={activeTeamId} lists={lists} listId={taskModal.listId} members={members}
            onClose={() => setTaskModal(null)} onCreated={() => { setTaskModal(null); loadTeamData(activeTeamId); showToast("Tugas berhasil dibuat"); }} />
        )}
        {taskModal?.mode === "detail" && (activeTeam || teams.find(t => t.id === taskModal.task?.team_id)) && (
          <TaskDetailModal task={taskModal.task} team={activeTeam || teams.find(t => t.id === taskModal.task?.team_id)} teams={teams} lists={lists} members={members} teamLabels={labels} myRole={(activeTeam || teams.find(t => t.id === taskModal.task?.team_id))?.my_role}
            onLabelCreated={(label) => setLabels(prev => [...prev, label])}
            currentUser={user} onClose={closeTask} onReload={() => loadTeamData(activeTeamId || taskModal.task?.team_id)} />
        )}
        {membersModal && activeTeam && (
          <MembersModal team={activeTeam} mode={membersModal} members={members} myRole={activeTeam.my_role}
            currentUser={user} onClose={() => setMembersModal(null)} onChanged={() => loadTeamData(activeTeamId)}
            onTeamUpdated={() => loadTeams()}
            onTeamDeleted={() => { setMembersModal(null); goHQ(); loadTeams(); showToast("Tim berhasil dihapus"); }} />
        )}
        {createTeamOpen && canCreateTeam(user) && (
          <CreateTeamModal onClose={() => setCreateTeamOpen(false)} onCreated={(team) => { setCreateTeamOpen(false); loadTeams(); setActiveTeamId(team.id); setTab("tasks"); }} />
        )}
        {profileOpen && (
          <ProfileModal user={user} onClose={() => setProfileOpen(false)} onUpdated={onUserUpdate} />
        )}
        {toast && <div className="toast" data-testid="success-toast">{toast}</div>}
        <CommandPalette
          open={paletteOpen}
          onClose={() => setPaletteOpen(false)}
          teams={teams}
          team={activeTeam}
          onSelectTeam={selectTeam}
          onOpenTask={openTask}
          onCreateTeam={() => canCreateTeam(user) && setCreateTeamOpen(true)}
          canCreateTeam={canCreateTeam(user)}
          onCreateTask={() => { if (activeTeamId) setTaskModal({ mode: "new", listId: lists[0]?.id }); }}
          onGoHQ={goHQ}
          onOpenRecap={openRecap}
          onTab={setTab}
          onOpenDocuments={d => { if (d.team_id) { setActiveTeamId(d.team_id); setTab("documents"); } }}
        />
      </main>
    </div>
  );
}
export default App;
