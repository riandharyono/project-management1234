import { useEffect, useState } from "react";
import { Megaphone, Plus, Pencil, Trash2 } from "lucide-react";
import { client, timeAgo, apiError } from "../lib/api";
import { Avatar } from "./Avatar";

export function Announcements({ team, members, currentUser, myRole }) {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", body: "" });
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ title: "", body: "" });
  const [error, setError] = useState("");

  const load = () => client.get(`/teams/${team.id}/announcements`).then(r => setItems(r.data));
  useEffect(() => { load(); }, [team.id]);

  const canModify = a => a.author_id === currentUser.id || myRole === "admin";

  const submit = async e => {
    e.preventDefault();
    try { await client.post(`/teams/${team.id}/announcements`, form); setForm({ title: "", body: "" }); setOpen(false); load(); }
    catch (x) { setError(apiError(x)); }
  };
  const startEdit = a => { setEditingId(a.id); setEditForm({ title: a.title, body: a.body }); };
  const saveEdit = async () => {
    try { await client.patch(`/announcements/${editingId}`, editForm); setEditingId(null); load(); }
    catch (x) { setError(apiError(x)); }
  };
  const remove = async id => {
    if (!window.confirm("Hapus pengumuman ini?")) return;
    try { await client.delete(`/announcements/${id}`); load(); }
    catch (x) { setError(apiError(x)); }
  };

  return (
    <div className="page">
      <div className="page-heading">
        <div><p className="eyebrow">PENGUMUMAN</p><h1>Pengumuman tim</h1><p className="muted">Informasi penting untuk seluruh anggota tim.</p></div>
        <button className="primary" onClick={() => setOpen(!open)} data-testid="create-announcement-button"><Plus size={16} /> Buat Pengumuman</button>
      </div>
      {open && (
        <form className="inline-form" onSubmit={submit} data-testid="announcement-form">
          <input placeholder="Judul pengumuman" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} data-testid="announcement-title-input" />
          <textarea placeholder="Isi pengumuman" value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} data-testid="announcement-body-input" />
          {error && <div className="error">{error}</div>}
          <div><button className="primary" data-testid="submit-announcement-button">Kirim</button><button type="button" className="secondary" onClick={() => setOpen(false)}>Batal</button></div>
        </form>
      )}
      <div className="announcement-list" data-testid="announcements-list">
        {items.map(a => (
          <div className="announcement-card" key={a.id} data-testid={`announcement-${a.id}`}>
            <div className="announcement-icon"><Megaphone size={18} /></div>
            {editingId === a.id ? (
              <div className="inline-form" data-testid={`announcement-edit-form-${a.id}`}>
                <input value={editForm.title} onChange={e => setEditForm({ ...editForm, title: e.target.value })} data-testid={`announcement-edit-title-${a.id}`} />
                <textarea value={editForm.body} onChange={e => setEditForm({ ...editForm, body: e.target.value })} data-testid={`announcement-edit-body-${a.id}`} />
                <div><button className="primary" onClick={saveEdit} data-testid={`save-announcement-${a.id}`}>Simpan</button><button type="button" className="secondary" onClick={() => setEditingId(null)} data-testid={`cancel-edit-announcement-${a.id}`}>Batal</button></div>
              </div>
            ) : (
              <div>
                <div className="announcement-card-head">
                  <h3>{a.title}</h3>
                  {canModify(a) && (
                    <div className="announcement-actions">
                      <button className="icon-button" onClick={() => startEdit(a)} data-testid={`edit-announcement-${a.id}`}><Pencil size={13} /></button>
                      <button className="icon-button" onClick={() => remove(a.id)} data-testid={`delete-announcement-${a.id}`}><Trash2 size={13} /></button>
                    </div>
                  )}
                </div>
                <p>{a.body}</p>
                <div className="announcement-meta"><Avatar id={a.author_id} name={a.author} photo={members?.find(m => m.id === a.author_id)?.avatar} />{a.author} · {timeAgo(a.created_at)}</div>
              </div>
            )}
          </div>
        ))}
        {!items.length && <p className="muted">Belum ada pengumuman.</p>}
      </div>
    </div>
  );
}
