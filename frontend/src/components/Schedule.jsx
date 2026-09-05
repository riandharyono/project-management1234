import { useEffect, useState } from "react";
import { Bell, ChevronLeft, ChevronRight, CheckCircle2, CalendarClock, Link2, Check } from "lucide-react";
import { client } from "../lib/api";
import { priorityLabel } from "../lib/priority";

const WEEKDAYS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
const startOfWeek = d => {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const offset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - offset);
  return date;
};
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const key = d => d?.toISOString().slice(0, 10);

export function Schedule({ team, lists, onReload, onOpenTask }) {
  const [tasks, setTasks] = useState([]);
  const [today] = useState(new Date());
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [view, setView] = useState("month");
  const [reschedulingId, setReschedulingId] = useState(null);
  const [syncCopied, setSyncCopied] = useState(false);

  const syncCalendar = async () => {
    const r = await client.get(`/teams/${team.id}/calendar-link`);
    const url = `${process.env.REACT_APP_BACKEND_URL}${r.data.path}`;
    try { await navigator.clipboard.writeText(url); setSyncCopied(true); setTimeout(() => setSyncCopied(false), 2500); }
    catch (e) { window.open(url.replace(/^https?/, "webcal"), "_blank"); }
  };

  const load = () => client.get(`/teams/${team.id}/tasks`).then(r => setTasks(r.data));
  useEffect(() => { load(); }, [team.id]);

  const listsById = Object.fromEntries((lists || []).map(l => [l.id, l]));

  const markDone = async (task) => {
    const done = task.list_id && listsById[task.list_id]?.is_done;
    const target = done ? (lists.find(l => !l.is_done) || lists[0]) : lists.find(l => l.is_done);
    if (!target) return;
    await client.patch(`/tasks/${task.id}`, { list_id: target.id });
    load(); onReload?.();
  };
  const reschedule = async (task, newDate) => {
    if (!newDate || newDate === task.due_date) return;
    await client.patch(`/tasks/${task.id}`, { due_date: newDate });
    setReschedulingId(null);
    load(); onReload?.();
  };

  const month = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const offset = (month.getDay() + 6) % 7;
  const cells = Array.from({ length: Math.ceil((offset + days) / 7) * 7 }, (_, i) => {
    const d = i - offset + 1;
    return d > 0 && d <= days ? new Date(month.getFullYear(), month.getMonth(), d) : null;
  });
  const weekStart = startOfWeek(cursor);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const upcoming = tasks.filter(t => t.due_date && t.due_date >= today.toISOString().slice(0, 10) && !listsById[t.list_id]?.is_done).sort((a, b) => a.due_date.localeCompare(b.due_date)).slice(0, 6);

  const shift = (dir) => {
    if (view === "week") setCursor(c => addDays(c, dir * 7));
    else setCursor(c => new Date(c.getFullYear(), c.getMonth() + dir, 1));
  };

  const onDropDay = (e, date) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("task");
    const task = tasks.find(t => t.id === id);
    if (task && date) reschedule(task, key(date));
  };

  const chip = (t) => (
    <button
      className={`calendar-task ${t.priority?.toLowerCase()} ${listsById[t.list_id]?.is_done ? "is-done" : ""}`}
      key={t.id}
      draggable
      onDragStart={e => { e.dataTransfer.setData("task", t.id); e.dataTransfer.effectAllowed = "move"; }}
      onClick={() => onOpenTask?.(t)}
      data-testid={`schedule-task-${t.id}`}
    >{t.title}</button>
  );

  const label = view === "week"
    ? `${weekDays[0].toLocaleDateString("id-ID", { day: "numeric", month: "short" })} – ${weekDays[6].toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}`
    : month.toLocaleDateString("id-ID", { month: "long", year: "numeric" });

  return (
    <div className="page calendar-page">
      <div className="page-heading">
        <div><h1>Jadwal</h1><p className="muted">Seret tugas ke tanggal lain untuk mengubah tenggat.</p></div>
        <div className="calendar-toolbar">
          <div className="view-toggle">
            <button className={view === "month" ? "selected" : ""} onClick={() => setView("month")} data-testid="schedule-month-view">Bulan</button>
            <button className={view === "week" ? "selected" : ""} onClick={() => setView("week")} data-testid="schedule-week-view">Minggu</button>
          </div>
          <div className="calendar-nav">
            <button className="icon-button" onClick={() => shift(-1)} data-testid="schedule-prev-month"><ChevronLeft size={18} /></button>
            <strong data-testid="schedule-month-label">{label}</strong>
            <button className="icon-button" onClick={() => shift(1)} data-testid="schedule-next-month"><ChevronRight size={18} /></button>
          </div>
        </div>
      </div>
      <button className="calendar-sync-link" onClick={syncCalendar} data-testid="schedule-sync-button">
        {syncCopied ? <><Check size={13} /> Tautan disalin! Tempel di aplikasi kalendermu</> : <><Link2 size={13} /> Sinkronisasi kalender ini ke kalender Google/Apple-mu…</>}
      </button>
      <div className="calendar-layout">
        {view === "month" ? (
          <section className="calendar-grid" data-testid="schedule-calendar">
            <div className="calendar-weekdays">{WEEKDAYS.map(x => <b key={x}>{x}</b>)}</div>
            <div className="calendar-days">
              {cells.map((d, i) => (
                <div
                  className={`calendar-day ${d && key(d) === key(today) ? "today" : ""}`}
                  key={i}
                  onDragOver={e => d && e.preventDefault()}
                  onDrop={e => d && onDropDay(e, d)}
                  data-testid={d ? `schedule-day-${d.getDate()}` : `schedule-empty-${i}`}
                >
                  {d && <><span>{d.getDate()}</span>{tasks.filter(t => t.due_date === key(d)).map(chip)}</>}
                </div>
              ))}
            </div>
          </section>
        ) : (
          <section className="calendar-week" data-testid="schedule-week">
            {weekDays.map(d => (
              <div
                key={key(d)}
                className={`calendar-week-col ${key(d) === key(today) ? "today" : ""}`}
                onDragOver={e => e.preventDefault()}
                onDrop={e => onDropDay(e, d)}
              >
                <header><b>{WEEKDAYS[(d.getDay() + 6) % 7]}</b><span>{d.getDate()}</span></header>
                {tasks.filter(t => t.due_date === key(d)).map(chip)}
              </div>
            ))}
          </section>
        )}
        <aside className="reminder-panel" data-testid="schedule-reminders">
          <div className="reminder-title"><Bell size={16} /><h2>Pengingat mendatang</h2></div>
          {upcoming.length ? upcoming.map(t => (
            <div className="reminder" key={t.id} data-testid={`reminder-${t.id}`}>
              <span className="status-dot" />
              <div>
                <b>{t.title}</b>
                {reschedulingId === t.id ? (
                  <input type="date" autoFocus defaultValue={t.due_date} onBlur={e => reschedule(t, e.target.value)}
                    onKeyDown={e => e.key === "Enter" && reschedule(t, e.target.value)} data-testid={`reminder-date-input-${t.id}`} />
                ) : (
                  <small>{new Date(t.due_date).toLocaleDateString("id-ID", { day: "numeric", month: "short" })} · {priorityLabel(t.priority)}</small>
                )}
              </div>
              <div className="reminder-actions">
                <button className="reminder-action-btn" onClick={() => markDone(t)} title="Tandai selesai" data-testid={`reminder-done-${t.id}`}><CheckCircle2 size={14} /></button>
                <button className="reminder-action-btn" onClick={() => setReschedulingId(reschedulingId === t.id ? null : t.id)} title="Geser tanggal" data-testid={`reminder-reschedule-${t.id}`}><CalendarClock size={14} /></button>
              </div>
            </div>
          )) : <div className="empty-reminder">Tidak ada tenggat mendatang</div>}
        </aside>
      </div>
    </div>
  );
}
