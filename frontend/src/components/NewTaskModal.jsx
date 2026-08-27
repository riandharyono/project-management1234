import { useState } from "react";
import { X } from "lucide-react";
import { client, apiError } from "../lib/api";

export function NewTaskModal({ teamId, lists, listId, members, onClose, onCreated }) {
  const [form, setForm] = useState({ title: "", description: "", list_id: listId || lists[0]?.id, priority: "Medium", due_date: "", assignees: [] });
  const [error, setError] = useState("");
  const submit = async e => {
    e.preventDefault();
    try { await client.post(`/teams/${teamId}/tasks`, form); onCreated(); }
    catch (x) { setError(apiError(x)); }
  };
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="modal" data-testid="new-task-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head"><div><span className="eyebrow">TUGAS BARU</span><h2>Buat tugas baru</h2></div><button className="icon-button" onClick={onClose} data-testid="close-new-task-modal"><X size={18} /></button></div>
        <form onSubmit={submit}>
          <label>Judul tugas<input autoFocus value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} data-testid="new-task-title-input" /></label>
          <label>Deskripsi<textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} data-testid="new-task-description-input" /></label>
          <div className="form-grid">
            <label>List<select value={form.list_id} onChange={e => setForm({ ...form, list_id: e.target.value })} data-testid="new-task-list-select">{lists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
            <label>Prioritas<select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })} data-testid="new-task-priority-select"><option>Low</option><option>Medium</option><option>High</option></select></label>
            <label>Tenggat<input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} data-testid="new-task-due-date-input" /></label>
            <label>Anggota<select value={form.assignees[0] || ""} onChange={e => setForm({ ...form, assignees: e.target.value ? [e.target.value] : [] })} data-testid="new-task-assignee-select"><option value="">Belum ditugaskan</option>{members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
          </div>
          {error && <div className="error" data-testid="new-task-error">{error}</div>}
          <div className="modal-foot"><span /><button type="button" className="secondary" onClick={onClose} data-testid="cancel-new-task-button">Batal</button><button className="primary" disabled={!form.title.trim()} data-testid="create-new-task-button">Buat Tugas</button></div>
        </form>
      </section>
    </div>
  );
}
