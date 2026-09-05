import { ClipboardList, MessageSquare, Megaphone, CalendarClock, HelpCircle, FolderOpen, AlertCircle } from "lucide-react";
import { shortDate } from "../lib/api";

const CARDS = [
  { key: "chat", label: "Chat", icon: MessageSquare, tone: "teal" },
  { key: "announcements", label: "Pengumuman", icon: Megaphone, tone: "amber" },
  { key: "schedule", label: "Jadwal", icon: CalendarClock, tone: "violet" },
  { key: "questions", label: "Pertanyaan", icon: HelpCircle, tone: "pink" },
  { key: "documents", label: "Dokumen", icon: FolderOpen, tone: "indigo" },
];

export function TeamOverview({ team, tasks, listsById, onNavigate, onOpenTask }) {
  const today = new Date().toISOString().slice(0, 10);
  const open = tasks.filter(t => !listsById[t.list_id]?.is_done && !listsById[t.list_id]?.is_cancelled);
  const total = tasks.length;
  const done = tasks.filter(t => listsById[t.list_id]?.is_done).length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const overdue = open.filter(t => t.due_date && t.due_date < today);
  const dueToday = open.filter(t => t.due_date === today);
  return (
    <div className="page overview-page">
      <div className="page-heading">
        <div>
          <h1>{team.name}</h1>
          <p className="muted">{total ? `${pct}% selesai · ${open.length} masih berjalan` : "Belum ada tugas di tim ini."}</p>
        </div>
        <button className="primary" onClick={() => onNavigate("tasks")} data-testid="overview-goto-tasks">Buka papan</button>
      </div>
      {total > 0 && (
        <div className="overview-progress" data-testid="overview-progress">
          <div className="overview-progress-bar"><div style={{ width: `${pct}%` }} /></div>
          <span data-testid="overview-progress-pct">{done}/{total} selesai</span>
        </div>
      )}
      <div className="overview-work">
        <div className="overview-work-col" data-testid="overview-card-tasks" onClick={() => onNavigate("tasks")}>
          <header><AlertCircle size={14} /><h3>Perlu perhatian</h3></header>
          {overdue.length || dueToday.length ? (
            <div className="overview-task-preview">
              {overdue.map(t => (
                <button key={t.id} className="overview-task-row" onClick={e => { e.stopPropagation(); onOpenTask?.(t); }}>
                  <span className="due overdue">{shortDate(t.due_date)}</span>
                  <span className="ot-title">{t.title}</span>
                </button>
              ))}
              {dueToday.map(t => (
                <button key={t.id} className="overview-task-row" onClick={e => { e.stopPropagation(); onOpenTask?.(t); }}>
                  <span className="badge-status">Hari ini</span>
                  <span className="ot-title">{t.title}</span>
                </button>
              ))}
            </div>
          ) : <p className="muted">Tidak ada tenggat mendesak.</p>}
        </div>
        <div className="overview-work-col">
          <header><ClipboardList size={14} /><h3>Tugas berjalan</h3></header>
          {open.length ? (
            <div className="overview-task-preview">
              {open.slice(0, 6).map(t => (
                <button key={t.id} className="overview-task-row" onClick={() => onOpenTask?.(t)}>
                  <span className="badge-status">{listsById[t.list_id]?.name || "-"}</span>
                  <span className="ot-title">{t.title}</span>
                </button>
              ))}
            </div>
          ) : <p className="muted">Semua tugas sudah selesai, atau belum ada yang dibuat.</p>}
        </div>
      </div>
      <div className="overview-shortcuts" data-testid="overview-grid">
        {CARDS.map(c => (
          <button key={c.key} className={`overview-shortcut tone-${c.tone}`} onClick={() => onNavigate(c.key)} data-testid={`overview-card-${c.key}`}>
            <c.icon size={16} /> {c.label}
          </button>
        ))}
      </div>
    </div>
  );
}
