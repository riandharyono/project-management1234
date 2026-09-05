import { useEffect, useState } from "react";
import { HelpCircle, Plus, ChevronDown, ChevronUp, Clock, Trash2, Pencil } from "lucide-react";
import { client, initials, avatarColor, fileUrl, timeAgo, apiError } from "../lib/api";
import { Avatar } from "./Avatar";
import { useConfirm } from "./ConfirmDialog";
import { EmptyState } from "./EmptyState";

const DAYS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];

export function Questions({ team, members, currentUser, myRole }) {
  const [items, setItems] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [mode, setMode] = useState(null); // null | "once" | "schedule"
  const [form, setForm] = useState({ title: "", body: "" });
  const [schedForm, setSchedForm] = useState({ title: "", body: "", days: [0], time: "09:00", recipients: [], secret: false });
  const [expanded, setExpanded] = useState(null);
  const [answerText, setAnswerText] = useState("");
  const [editingQId, setEditingQId] = useState(null);
  const [editQForm, setEditQForm] = useState({ title: "", body: "" });
  const [error, setError] = useState("");
  const confirm = useConfirm();

  const canModify = q => q.author_id === currentUser.id || myRole === "admin";

  const load = () => client.get(`/teams/${team.id}/questions`).then(r => setItems(r.data));
  const loadSchedules = () => client.get(`/teams/${team.id}/question-schedules`).then(r => setSchedules(r.data));
  useEffect(() => { load(); loadSchedules(); }, [team.id]);

  const submit = async e => {
    e.preventDefault();
    try { await client.post(`/teams/${team.id}/questions`, form); setForm({ title: "", body: "" }); setMode(null); load(); }
    catch (x) { setError(apiError(x)); }
  };
  const submitSchedule = async e => {
    e.preventDefault();
    try {
      await client.post(`/teams/${team.id}/question-schedules`, schedForm);
      setSchedForm({ title: "", body: "", days: [0], time: "09:00", recipients: [], secret: false });
      setMode(null); loadSchedules();
    } catch (x) { setError(apiError(x)); }
  };
  const removeSchedule = async id => { await client.delete(`/question-schedules/${id}`); loadSchedules(); };
  const toggleDay = d => setSchedForm(f => ({ ...f, days: f.days.includes(d) ? f.days.filter(x => x !== d) : [...f.days, d].sort() }));
  const toggleRecipient = id => setSchedForm(f => ({ ...f, recipients: f.recipients.includes(id) ? f.recipients.filter(x => x !== id) : [...f.recipients, id] }));
  const answer = async id => { if (!answerText.trim()) return; await client.post(`/questions/${id}/answers`, { body: answerText }); setAnswerText(""); load(); };
  const startEditQuestion = q => { setEditingQId(q.id); setEditQForm({ title: q.title, body: q.body }); setExpanded(q.id); };
  const saveEditQuestion = async () => {
    try { await client.patch(`/questions/${editingQId}`, editQForm); setEditingQId(null); load(); }
    catch (x) { setError(apiError(x)); }
  };
  const removeQuestion = async id => {
    const ok = await confirm({ title: "Hapus pertanyaan ini?", body: "Semua jawaban akan ikut terhapus.", confirmLabel: "Hapus", danger: true });
    if (!ok) return;
    try { await client.delete(`/questions/${id}`); load(); }
    catch (x) { setError(apiError(x)); }
  };

  return (
    <div className="page">
      <div className="page-heading">
        <div><p className="eyebrow">PERTANYAAN</p><h1>Pertanyaan tim</h1><p className="muted">Ajukan pertanyaan dan dapatkan jawaban dari anggota tim.</p></div>
        <div className="kb-toolbar-actions">
          <button className="secondary" onClick={() => setMode(mode === "schedule" ? null : "schedule")} data-testid="schedule-question-button"><Clock size={14} /> Jadwalkan</button>
          <button className="primary" onClick={() => setMode(mode === "once" ? null : "once")} data-testid="create-question-button"><Plus size={16} /> Ajukan Pertanyaan</button>
        </div>
      </div>
      {mode === "once" && (
        <form className="inline-form" onSubmit={submit} data-testid="question-form">
          <input placeholder="Judul pertanyaan" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} data-testid="question-title-input" />
          <textarea placeholder="Detail pertanyaan" value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} data-testid="question-body-input" />
          {error && <div className="error">{error}</div>}
          <div><button className="primary" data-testid="submit-question-button">Kirim</button><button type="button" className="secondary" onClick={() => setMode(null)}>Batal</button></div>
        </form>
      )}
      {mode === "schedule" && (
        <form className="inline-form schedule-form" onSubmit={submitSchedule} data-testid="question-schedule-form">
          <label className="sf-label">Pertanyaan rutin apa yang ingin kamu tanyakan?</label>
          <input placeholder="Berapa data penjualan hari ini? Apa yang kamu kerjakan minggu ini?, dll" value={schedForm.title}
            onChange={e => setSchedForm({ ...schedForm, title: e.target.value })} data-testid="schedule-title-input" required />

          <label className="sf-label">Pada hari apa aja pertanyaan ini dikirim?</label>
          <div className="sf-days">
            {DAYS.map((d, i) => (
              <button type="button" key={d} className={`sf-day ${schedForm.days.includes(i) ? "active" : ""}`} onClick={() => toggleDay(i)} data-testid={`schedule-day-${i}`}>{d}</button>
            ))}
          </div>

          <label className="sf-label">Jam berapa?</label>
          <input type="time" value={schedForm.time} onChange={e => setSchedForm({ ...schedForm, time: e.target.value })} data-testid="schedule-time-input" />

          <label className="sf-label">Siapa aja Penerimanya?</label>
          <div className="sf-recipients">
            {members.filter(m => m.id !== currentUser.id).map(m => (
              <button type="button" key={m.id} className={`avatar ${schedForm.recipients.includes(m.id) ? "sf-picked" : "sf-unpicked"}`}
                style={m.avatar ? undefined : { background: avatarColor(m.id) }} title={m.name} onClick={() => toggleRecipient(m.id)} data-testid={`schedule-recipient-${m.id}`}>
                {m.avatar ? <img src={fileUrl(m.avatar)} alt="" style={{ width: "100%", height: "100%", borderRadius: "inherit", objectFit: "cover" }} /> : initials(m.name)}
              </button>
            ))}
          </div>

          <label className="sf-toggle-row">
            <span>Apakah pertanyaan ini Rahasia untuk Penerima aja?</span>
            <button type="button" className={`sf-switch ${schedForm.secret ? "on" : ""}`} onClick={() => setSchedForm(f => ({ ...f, secret: !f.secret }))} data-testid="schedule-secret-toggle">
              <i />
            </button>
          </label>

          {error && <div className="error">{error}</div>}
          <div><button className="primary" data-testid="publish-schedule-button">Publikasikan</button><button type="button" className="danger-link" onClick={() => setMode(null)}>Batal</button></div>
        </form>
      )}

      {!!schedules.length && (
        <div className="schedule-list" data-testid="question-schedules-list">
          {schedules.map(s => (
            <div className="schedule-row" key={s.id} data-testid={`question-schedule-${s.id}`}>
              <Clock size={14} />
              <div><b>{s.title}</b><small>{s.days.map(d => DAYS[d]).join(", ")} · {s.time} · {s.recipients.length} penerima{s.secret ? " · rahasia" : ""}</small></div>
              <button className="danger-link" onClick={() => removeSchedule(s.id)} data-testid={`delete-schedule-${s.id}`}><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      )}

      <div className="question-list" data-testid="questions-list">
        {items.map(q => (
          <div className="question-card" key={q.id} data-testid={`question-${q.id}`}>
            <div className="question-head" onClick={() => setExpanded(expanded === q.id ? null : q.id)} data-testid={`question-toggle-${q.id}`}>
              <div className="question-icon"><HelpCircle size={16} /></div>
              <div><h3>{q.title}</h3><small>{q.author} · {timeAgo(q.created_at)} · {q.answers.length} jawaban{q.secret ? " · 🔒 rahasia" : ""}</small></div>
              {canModify(q) && (
                <div className="question-actions" onClick={e => e.stopPropagation()}>
                  <button className="icon-button" onClick={() => startEditQuestion(q)} data-testid={`edit-question-${q.id}`}><Pencil size={13} /></button>
                  <button className="icon-button" onClick={() => removeQuestion(q.id)} data-testid={`delete-question-${q.id}`}><Trash2 size={13} /></button>
                </div>
              )}
              {expanded === q.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </div>
            {expanded === q.id && (
              <div className="question-body">
                {editingQId === q.id ? (
                  <div className="inline-form" data-testid={`question-edit-form-${q.id}`}>
                    <input value={editQForm.title} onChange={e => setEditQForm({ ...editQForm, title: e.target.value })} data-testid={`question-edit-title-${q.id}`} />
                    <textarea value={editQForm.body} onChange={e => setEditQForm({ ...editQForm, body: e.target.value })} data-testid={`question-edit-body-${q.id}`} />
                    <div><button className="primary" onClick={saveEditQuestion} data-testid={`save-question-${q.id}`}>Simpan</button><button type="button" className="secondary" onClick={() => setEditingQId(null)} data-testid={`cancel-edit-question-${q.id}`}>Batal</button></div>
                  </div>
                ) : <p>{q.body}</p>}
                {q.answers.map(a => (
                  <div className="comment" key={a.id}><Avatar id={a.author_id} name={a.author} photo={members.find(m => m.id === a.author_id)?.avatar} /><p><b>{a.author}</b>{a.body}<small>{timeAgo(a.created_at)}</small></p></div>
                ))}
                <div className="comment-compose"><input value={answerText} onChange={e => setAnswerText(e.target.value)} placeholder="Tulis jawaban…" data-testid={`answer-input-${q.id}`} /><button className="primary" onClick={() => answer(q.id)} data-testid={`answer-submit-${q.id}`}>Kirim</button></div>
              </div>
            )}
          </div>
        ))}
        {!items.length && (
          <EmptyState
            icon={<HelpCircle size={22} />}
            title="Belum ada pertanyaan"
            body="Ajukan pertanyaan ke tim, atau jadwalkan pertanyaan rutin harian."
            action={<button className="primary" onClick={() => setMode("once")}><Plus size={16} /> Ajukan pertanyaan</button>}
          />
        )}
      </div>
    </div>
  );
}
