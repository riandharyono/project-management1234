import { useState } from "react";
import { X } from "lucide-react";
import { client, apiError } from "../lib/api";

export function ProfileModal({ user, onClose, onUpdated }) {
  const [name, setName] = useState(user.name);
  const [error, setError] = useState("");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState(false);

  const submit = async e => {
    e.preventDefault();
    try { const r = await client.patch("/auth/me", { name }); onUpdated(r.data); onClose(); }
    catch (x) { setError(apiError(x)); }
  };

  const submitPassword = async e => {
    e.preventDefault();
    setPwError(""); setPwSuccess(false);
    if (newPassword !== confirmPassword) { setPwError("Konfirmasi password baru tidak cocok"); return; }
    try {
      await client.patch("/auth/password", { current_password: currentPassword, new_password: newPassword });
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword(""); setPwSuccess(true);
    } catch (x) { setPwError(apiError(x)); }
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

        <hr className="profile-divider" />

        <form onSubmit={submitPassword}>
          <h3 className="profile-subhead">Ganti Password</h3>
          <label>Password saat ini<input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} placeholder="Password saat ini" data-testid="current-password-input" /></label>
          <label>Password baru<input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Minimal 6 karakter" data-testid="new-password-input" /></label>
          <label>Konfirmasi password baru<input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Ulangi password baru" data-testid="confirm-password-input" /></label>
          {pwError && <div className="error" data-testid="password-error">{pwError}</div>}
          {pwSuccess && <div className="success" data-testid="password-success">Password berhasil diganti</div>}
          <div className="modal-foot"><span /><button className="primary" disabled={!currentPassword || newPassword.length < 6} data-testid="submit-password-button">Ganti Password</button></div>
        </form>
      </section>
    </div>
  );
}
