import { useEffect, useState } from "react";
import { AlertCircle, CalendarDays, CheckSquare, Inbox, MessageCircle, Plus } from "lucide-react";
import { client, shortDate, timeAgo } from "../lib/api";
import { EmptyState } from "./EmptyState";

const PRIORITY_DOT = { high: "high", medium: "medium", low: "low", sedang: "medium" };

export function MyWork({ user, teams, onOpenTeam, onOpenTask, onOpenMention, onCreateTeam }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    client.get("/me/tasks").then(r => setData(r.data)).catch(() => setData({
      overdue: [], today: [], upcoming: [], unscheduled: [], mentions: [],
    }));
  }, [user.id]);

  const total = data ? data.overdue.length + data.today.length + data.upcoming.length + data.unscheduled.length : 0;
  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 11) return "Selamat pagi";
    if (h < 15) return "Selamat siang";
    if (h < 18) return "Selamat sore";
    return "Selamat malam";
  })();

  return (
    <div className="page my-work-page" data-testid="my-work-page">
      <div className="page-heading">
        <div>
          <h1>{greeting}, {user.name.split(" ")[0]}</h1>
          <p className="muted">Tugas yang ditugaskan ke Anda, lintas tim.</p>
        </div>
        <button className="primary" onClick={onCreateTeam} data-testid="hq-create-team-button"><Plus size={16} /> Buat Tim</button>
      </div>

      {!!teams.length && (
        <div className="mw-teams" data-testid="hq-team-grid">
          {teams.map(t => (
            <button key={t.id} className="mw-team-chip" onClick={() => onOpenTeam(t.id)} data-testid={`hq-team-card-${t.id}`}>
              <i style={{ background: t.color }} />
              <span>{t.name}</span>
              <small>{t.member_count}</small>
            </button>
          ))}
        </div>
      )}

      {!data ? (
        <p className="muted">Memuat tugas…</p>
      ) : (
        <div className="mw-layout">
          <div className="mw-main">
            {!total && (
              <EmptyState
                icon={<Inbox size={22} />}
                title="Belum ada tugas untuk Anda"
                body="Tugas yang ditugaskan ke Anda akan muncul di sini, dikelompokkan menurut tenggat."
                action={teams.length ? null : <button className="primary" onClick={onCreateTeam}>Buat tim pertama</button>}
                testId="my-work-empty"
              />
            )}
            <WorkSection title="Terlambat" count={data.overdue.length} tone="danger" icon={<AlertCircle size={14} />} testId="my-work-overdue">
              {data.overdue.map(t => <WorkRow key={t.id} task={t} onOpen={onOpenTask} overdue />)}
            </WorkSection>
            <WorkSection title="Hari ini" count={data.today.length} tone="warning" icon={<CalendarDays size={14} />} testId="my-work-today">
              {data.today.map(t => <WorkRow key={t.id} task={t} onOpen={onOpenTask} />)}
            </WorkSection>
            <WorkSection title="Mendatang" count={data.upcoming.length} icon={<CheckSquare size={14} />} testId="my-work-upcoming">
              {data.upcoming.map(t => <WorkRow key={t.id} task={t} onOpen={onOpenTask} />)}
            </WorkSection>
            <WorkSection title="Tanpa tenggat" count={data.unscheduled.length} testId="my-work-unscheduled">
              {data.unscheduled.map(t => <WorkRow key={t.id} task={t} onOpen={onOpenTask} />)}
            </WorkSection>
          </div>
          <aside className="mw-side">
            <div className="mw-side-card">
              <div className="mw-side-head"><MessageCircle size={14} /><b>Mention belum dibaca</b></div>
              {data.mentions.length ? data.mentions.map(n => (
                <button key={n.id} className="mw-mention" onClick={() => onOpenMention(n)} data-testid={`my-work-mention-${n.id}`}>
                  <p>{n.text}</p>
                  <small>{timeAgo(n.created_at)}</small>
                </button>
              )) : <p className="muted">Tidak ada mention baru.</p>}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

function WorkSection({ title, count, tone, icon, testId, children }) {
  if (!count) return null;
  return (
    <section className={`mw-section ${tone || ""}`} data-testid={testId}>
      <header><span>{icon}</span><h2>{title}</h2><em>{count}</em></header>
      <div className="mw-rows">{children}</div>
    </section>
  );
}

function WorkRow({ task, onOpen, overdue }) {
  const pri = PRIORITY_DOT[(task.priority || "").toLowerCase()] || "medium";
  return (
    <button className="mw-row" onClick={() => onOpen(task)} data-testid={`my-work-row-${task.id}`}>
      <i className={`kb-priority-dot ${pri}`} title={task.priority} />
      <span className="mw-row-title">{task.title}</span>
      <span className="mw-row-team"><i style={{ background: task.team_color }} />{task.team_name}</span>
      <span className="mw-row-list">{task.list_name}</span>
      {task.due_date && <span className={`due ${overdue ? "overdue" : ""}`}>{shortDate(task.due_date)}</span>}
    </button>
  );
}
