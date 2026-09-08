import { ClipboardList, Megaphone, CalendarClock, HelpCircle, FolderOpen, AlertCircle, Link2 } from "lucide-react";
import { shortDate, localISODate } from "../lib/api";

const CARDS = [
  { key: "announcements", label: "Pengumuman", icon: Megaphone, tone: "amber" },
  { key: "schedule", label: "Jadwal", icon: CalendarClock, tone: "violet" },
  { key: "questions", label: "Check-in", icon: HelpCircle, tone: "pink" },
  { key: "documents", label: "Dokumen", icon: FolderOpen, tone: "indigo" },
];

function deadlineTone(date, today) {
  if (!date) return "";
  if (date < today) return "overdue";
  const soon = new Date(today); soon.setDate(soon.getDate() + 7);
  if (date <= soon.toISOString().slice(0, 10)) return "soon";
  return "";
}

function taskProgressFraction(task, list) {
  if (list?.is_done) return 1;
  if (list?.is_cancelled) return 0;
  const bits = [];
  (task.checklist || []).forEach(c => {
    bits.push(!!c.done);
    (c.subitems || []).forEach(s => bits.push(!!s.done));
  });
  return bits.length ? bits.filter(Boolean).length / bits.length : 0;
}

export function TeamOverview({ team, tasks, listsById, onNavigate, onOpenTask }) {
  const today = localISODate();
  const open = tasks.filter(t => !listsById[t.list_id]?.is_done && !listsById[t.list_id]?.is_cancelled);
  const total = tasks.length;
  const done = tasks.filter(t => listsById[t.list_id]?.is_done).length;
  const progressSum = tasks.reduce((sum, t) => sum + taskProgressFraction(t, listsById[t.list_id]), 0);
  const pct = total ? Math.round((progressSum / total) * 100) : 0;
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
      {(team.laporan_deadline || team.kke_deadline || team.laporan_link || team.kke_link) && (
        <div className="overview-deadlines" data-testid="overview-deadlines">
          {(team.laporan_deadline || team.laporan_link) && (
            <div className={`overview-deadline ${deadlineTone(team.laporan_deadline, today)}`} data-testid="overview-deadline-laporan">
              <span>Tenggat Upload Laporan</span>
              {team.laporan_deadline && <b>{shortDate(team.laporan_deadline)}</b>}
              {team.laporan_link && <a href={team.laporan_link} target="_blank" rel="noreferrer" data-testid="overview-laporan-link"><Link2 size={11} /> Link upload</a>}
            </div>
          )}
          {(team.kke_deadline || team.kke_link) && (
            <div className={`overview-deadline ${deadlineTone(team.kke_deadline, today)}`} data-testid="overview-deadline-kke">
              <span>Tenggat KKE</span>
              {team.kke_deadline && <b>{shortDate(team.kke_deadline)}</b>}
              {team.kke_link && <a href={team.kke_link} target="_blank" rel="noreferrer" data-testid="overview-kke-link"><Link2 size={11} /> Link upload</a>}
            </div>
          )}
        </div>
      )}
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
                  <span className="due overdue">Hari ini</span>
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
