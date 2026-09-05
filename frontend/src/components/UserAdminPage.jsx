import { useEffect, useState } from "react";
import { UserPlus, Trash2, ShieldCheck } from "lucide-react";
import { client, apiError } from "../lib/api";
import { Avatar } from "./Avatar";
import { useConfirm } from "./ConfirmDialog";

export function UserAdminPage({ currentUser }) {
  const confirm = useConfirm();
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "member" });
  const [error, setError] = useState("");

  const load = () => client.get("/members").then(r => setItems(r.data));
  useEffect(() => { load(); }, []);

  const submit = async e => {
    e.preventDefault();
    try {
      await client.post("/members", form);
      setForm({ name: "", email: "", password: "", role: "member" });
      setOpen(false); setError(""); load();
    } catch (x) { setError(apiError(x)); }
  };

  const setRole = async (id, role) => { await client.patch(`/members/${id}`, { role }); load(); };
  const remove = async id => {
    const ok = await confirm({ title: "Hapus akun ini?", body: "Pengguna akan keluar dari semua tim. Tindakan ini permanen.", confirmLabel: "Hapus akun", danger: true });
    if (ok) { await client.delete(`/members/${id}`); load(); }
  };

  return (
    <div className="page">
      <div className="page-heading">
        <div><p className="eyebrow">ADMIN WORKSPACE</p><h1>Kelola Pengguna</h1><p className="muted">Buat dan kelola akun anggota workspace. Registrasi mandiri sudah dinonaktifkan.</p></div>
        <button className="primary" onClick={() => setOpen(!open)} data-testid="create-user-button"><UserPlus size={16} /> Buat Akun</button>
      </div>
      {open && (
        <form className="inline-form" onSubmit={submit} data-testid="create-user-form">
          <input placeholder="Nama lengkap" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} data-testid="create-user-name-input" required />
          <input type="email" placeholder="Email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} data-testid="create-user-email-input" required />
          <input type="password" placeholder="Password (minimal 6 karakter)" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} data-testid="create-user-password-input" required />
          <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} data-testid="create-user-role-select">
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
          {error && <div className="error" data-testid="create-user-error">{error}</div>}
          <div><button className="primary" data-testid="submit-create-user-button">Buat Akun</button><button type="button" className="secondary" onClick={() => setOpen(false)}>Batal</button></div>
        </form>
      )}
      <div className="members-list" data-testid="user-admin-list">
        {items.map(u => (
          <div className="member-row" key={u.id} data-testid={`user-admin-row-${u.id}`}>
            <Avatar id={u.id} name={u.name} photo={u.avatar} />
            <div><b>{u.name}</b><small>{u.email}</small></div>
            {u.role === "admin" && <ShieldCheck size={14} className="muted" />}
            <select value={u.role} onChange={e => setRole(u.id, e.target.value)} disabled={u.id === currentUser.id} data-testid={`user-admin-role-${u.id}`}>
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
            {u.id !== currentUser.id && <button className="danger-link" onClick={() => remove(u.id)} data-testid={`user-admin-delete-${u.id}`}><Trash2 size={13} /> Hapus</button>}
          </div>
        ))}
        {!items.length && <p className="muted">Belum ada pengguna.</p>}
      </div>
    </div>
  );
}
