import { useEffect, useState } from "react";
import { Bell, ChevronLeft, ChevronRight, CheckCircle2, CalendarClock, Link2, Check } from "lucide-react";
import { client } from "../lib/api";

export function Schedule({ team, lists, onReload }) {
  const [tasks, setTasks] = useState([]);
  const [today] = useState(new Date());
  const [month, setMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
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
    if (!newDate) return;
    await client.patch(`/tasks/${task.id}`, { due_date: newDate });
    setReschedulingId(null);
    load(); onReload?.();
  };

  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const offset = (first.getDay() + 6) % 7;
  const cells = Array.from({ length: Math.ceil((offset + days) / 7) * 7 }, (_, i) => { const d = i - offset + 1; return d > 0 && d <= days ? new Date(month.getFullYear(), month.getMonth(), d) : null; });
  const key = d => d?.toISOString().slice(0, 10);
  const upcoming = tasks.filter(t => t.due_date && t.due_date >= today.toISOString().slice(0, 10) && !listsById[t.list_id]?.is_done).sort((a, b) => a.due_date.localeCompare(b.due_date)).slice(0, 6);

  return (
    <div className="page calendar-page">
      <div className="page-heading">
        <div><p className="eyebrow">JADWAL TIM</p><h1>Jadwal</h1><p className="muted">Lihat semua tenggat tugas dalam satu tampilan.</p></div>
        <div className="calendar-nav">
          <button className="icon-button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} data-testid="schedule-prev-month"><ChevronLeft size={18} /></button>
          <strong data-testid="schedule-month-label">{month.toLocaleDateString("id-ID", { month: "long", year: "numeric" })}</strong>
          <button className="icon-button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} data-testid="schedule-next-month"><ChevronRight size={18} /></button>
        </div>
      </div>
      <button className="calendar-sync-link" onClick={syncCalendar} data-testid="schedule-sync-button">
        {syncCopied ? <><Check size={13} /> Tautan disalin! Tempel di aplikasi kalendermu</> : <><Link2 size={13} /> Sinkronisasi kalender ini ke kalender Google/Apple-mu…</>}
      </button>
      <div className="calendar-layout">
        <section className="calendar-grid" data-testid="schedule-calendar">
          <div className="calendar-weekdays">{["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"].map(x => <b key={x}>{x}</b>)}</div>
          <div className="calendar-days">
            {cells.map((d, i) => (
              <div className={`calendar-day ${d && key(d) === key(today) ? "today" : ""}`} key={i} data-testid={d ? `schedule-day-${d.getDate()}` : `schedule-empty-${i}`}>
                {d && <><span>{d.getDate()}</span>{tasks.filter(t => t.due_date === key(d)).map(t => <span className={`calendar-task ${t.priority?.toLowerCase()} ${listsById[t.list_id]?.is_done ? "is-done" : ""}`} key={t.id} data-testid={`schedule-task-${t.id}`}>{t.title}</span>)}</>}
              </div>
            ))}
          </div>
        </section>
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
                  <small>{new Date(t.due_date).toLocaleDateString("id-ID", { day: "numeric", month: "short" })} · Prioritas {t.priority}</small>
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
