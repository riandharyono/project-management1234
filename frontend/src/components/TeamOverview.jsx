import { ClipboardList, MessageSquare, Megaphone, CalendarClock, HelpCircle, FolderOpen } from "lucide-react";

const CARDS = [
  { key: "chat", label: "Chat Grup", icon: MessageSquare, tone: "teal" },
  { key: "announcements", label: "Pengumuman", icon: Megaphone, tone: "amber" },
  { key: "schedule", label: "Jadwal", icon: CalendarClock, tone: "violet" },
  { key: "questions", label: "Pertanyaan", icon: HelpCircle, tone: "pink" },
  { key: "documents", label: "Dokumen & File", icon: FolderOpen, tone: "indigo" },
];

export function TeamOverview({ team, tasks, listsById, onNavigate }) {
  const preview = tasks.slice(0, 4);
  const total = tasks.length;
  const done = tasks.filter(t => listsById[t.list_id]?.is_done).length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="page overview-page">
      <div className="page-heading">
        <div><p className="eyebrow">RINGKASAN TIM</p><h1>{team.name}</h1><p className="muted">Pantau seluruh aktivitas tim dalam satu tampilan.</p></div>
      </div>
      <div className="overview-grid" data-testid="overview-grid">
        <div className="overview-card overview-card-tasks" onClick={() => onNavigate("tasks")} data-testid="overview-card-tasks">
          <div className="overview-card-head"><ClipboardList size={18} /><h3>Tugas</h3></div>
          {total > 0 && (
            <div className="overview-progress" data-testid="overview-progress">
              <div className="overview-progress-bar"><div style={{ width: `${pct}%` }} /></div>
              <span data-testid="overview-progress-pct">{pct}% selesai ({done}/{total})</span>
            </div>
          )}
          <div className="overview-task-preview">
            {preview.length ? preview.map(t => (
              <div key={t.id} className="overview-task-row">
                <span className="badge-status">{listsById[t.list_id]?.name || "-"}</span>
                <span className="ot-title">{t.title}</span>
              </div>
            )) : <p className="muted">Belum ada tugas</p>}
          </div>
        </div>
        {CARDS.map(c => (
          <div key={c.key} className={`overview-card tone-${c.tone}`} onClick={() => onNavigate(c.key)} data-testid={`overview-card-${c.key}`}>
            <div className="overview-icon"><c.icon size={26} /></div>
            <h3>{c.label}</h3>
          </div>
        ))}
      </div>
    </div>
  );
}
