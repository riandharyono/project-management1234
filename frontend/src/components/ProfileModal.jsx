import { useState } from "react";
import { X } from "lucide-react";
import { client, apiError } from "../lib/api";

export function ProfileModal({ user, onClose, onUpdated }) {
  const [name, setName] = useState(user.name);
  const [error, setError] = useState("");

  const submit = async e => {
    e.preventDefault();
    try { const r = await client.patch("/auth/me", { name }); onUpdated(r.data); onClose(); }
    catch (x) { setError(apiError(x)); }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="modal" onClick={e => e.stopPropagation()} data-testid="profile-modal">
        <div className="modal-head"><div><span className="eyebrow">PROFIL SAYA</span><h2>Edit profil</h2></div><button className="icon-button" onClick={onClose} data-testid="close-profile-modal"><X size={18} /></button></div>
        <form onSubmit={submit}>
          <label>Nama<input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Nama Anda" data-testid="profile-name-input" /></label>
          <label>Email<input value={user.email} disabled data-testid="profile-email-input" /></label>
          {error && <div className="error" data-testid="profile-error">{error}</div>}
          <div className="modal-foot"><span /><button type="button" className="secondary" onClick={onClose} data-testid="cancel-profile-button">Batal</button><button className="primary" disabled={!name.trim()} data-testid="submit-profile-button">Simpan</button></div>
        </form>
      </section>
    </div>
  );
}
