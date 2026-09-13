import { ClipboardList, Megaphone, CalendarClock, HelpCircle, FolderOpen, AlertCircle, Link2 } from "lucide-react";
import { shortDate, localISODate, safeHttpUrl } from "../lib/api";
import { currentYear, teamYear } from "../lib/years";

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

export function TeamOverview({ team, tasks, listsById, members, onNavigate, onOpenTask }) {
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
          <h1>{team.name} <small className="year-badge">{teamYear(team)}{teamYear(team) < currentYear() ? " · arsip" : ""}{team.wilayah ? ` · ${team.wilayah}` : ""}</small></h1>
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
              {safeHttpUrl(team.laporan_link) && <a href={safeHttpUrl(team.laporan_link)} target="_blank" rel="noopener noreferrer" data-testid="overview-laporan-link"><Link2 size={11} /> Folder laporan</a>}
            </div>
          )}
          {(team.kke_deadline || team.kke_link) && (
            <div className={`overview-deadline ${deadlineTone(team.kke_deadline, today)}`} data-testid="overview-deadline-kke">
              <span>Tenggat KKE</span>
              {team.kke_deadline && <b>{shortDate(team.kke_deadline)}</b>}
              {safeHttpUrl(team.kke_link) && <a href={safeHttpUrl(team.kke_link)} target="_blank" rel="noopener noreferrer" data-testid="overview-kke-link"><Link2 size={11} /> Folder KKE</a>}
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
      {!!(members || []).length && (
        <div className="overview-members" data-testid="overview-member-progress">
          <header><h3>Progres anggota</h3></header>
          {(members || []).map(m => {
            const mine = tasks.filter(t => (t.assignees || []).includes(m.id));
            const mDone = mine.filter(t => listsById[t.list_id]?.is_done).length;
            const mOpen = mine.filter(t => !listsById[t.list_id]?.is_done && !listsById[t.list_id]?.is_cancelled);
            const mOverdue = mOpen.filter(t => t.due_date && t.due_date < today).length;
            const pct = mine.length ? Math.round((mDone / mine.length) * 100) : 0;
            return (
              <button key={m.id} type="button" className="overview-member-row" onClick={() => onNavigate("tasks")}>
                <span className="ot-title">{m.name}</span>
                <span className="muted">{mDone}/{mine.length} selesai{mOverdue ? ` · ${mOverdue} terlambat` : ""}</span>
                <span className="overview-member-pct">{pct}%</span>
              </button>
            );
          })}
          {tasks.filter(t => !listsById[t.list_id]?.is_done && !listsById[t.list_id]?.is_cancelled && !(t.assignees || []).length).length > 0 && (
            <p className="muted">Ada tugas berjalan yang belum ditugaskan ke siapa pun.</p>
          )}
        </div>
      )}
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
