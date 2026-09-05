import { useEffect, useState } from "react";
import { X, UserPlus, Trash2 } from "lucide-react";
import { client, apiError, LABEL_COLORS } from "../lib/api";
import { Avatar } from "./Avatar";
import { useConfirm } from "./ConfirmDialog";

export function MembersModal({ team, mode, members, myRole, currentUser, onClose, onChanged, onTeamUpdated, onTeamDeleted }) {
  const [tab, setTab] = useState(mode || "access");
  const [available, setAvailable] = useState([]);
  const [teamName, setTeamName] = useState(team.name);
  const [teamColor, setTeamColor] = useState(team.color);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");
  const isAdmin = myRole === "admin";
  const confirm = useConfirm();

  const loadAvailable = () => client.get(`/teams/${team.id}/available-members`).then(r => setAvailable(r.data));
  useEffect(() => { if (tab === "add") loadAvailable(); }, [tab, team.id]);

  const add = async id => { await client.post(`/teams/${team.id}/members`, { user_id: id }); onChanged(); loadAvailable(); };
  const setRole = async (id, role) => { await client.patch(`/teams/${team.id}/members/${id}`, { role }); onChanged(); };
  const remove = async id => {
    const ok = await confirm({ title: "Keluarkan anggota ini?", body: "Mereka kehilangan akses ke tim ini.", confirmLabel: "Keluarkan", danger: true });
    if (ok) { await client.delete(`/teams/${team.id}/members/${id}`); onChanged(); }
  };

  const saveTeam = async () => {
    if (!teamName.trim()) return;
    setError("");
    try { await client.patch(`/teams/${team.id}`, { name: teamName.trim(), color: teamColor }); onTeamUpdated(); }
    catch (e) { setError(apiError(e)); }
  };
  const deleteTeam = async () => {
    setError("");
    try { await client.delete(`/teams/${team.id}`); onTeamDeleted(); }
    catch (e) { setError(apiError(e)); setConfirmDelete(false); }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="modal" onClick={e => e.stopPropagation()} data-testid="members-modal">
        <div className="modal-head"><h2>Anggota Tim</h2><button className="icon-button" onClick={onClose} data-testid="close-members-modal"><X size={18} /></button></div>
        <div className="view-toggle">
          <button className={tab === "access" ? "selected" : ""} onClick={() => setTab("access")} data-testid="members-tab-access">Anggota</button>
          <button className={tab === "add" ? "selected" : ""} onClick={() => setTab("add")} data-testid="members-tab-add">Tambah Anggota</button>
          {isAdmin && <button className={tab === "settings" ? "selected" : ""} onClick={() => setTab("settings")} data-testid="members-tab-settings">Pengaturan</button>}
        </div>
        {tab === "access" ? (
          <div className="members-list" data-testid="team-members-list">
            {members.map(m => (
              <div className="member-row" key={m.id} data-testid={`team-member-${m.id}`}>
                <Avatar id={m.id} name={m.name} photo={m.avatar} />
                <div><b>{m.name}</b><small>{m.email}</small></div>
                {myRole === "admin" ? (
                  <>
                    <select value={m.team_role} onChange={e => setRole(m.id, e.target.value)} data-testid={`member-role-${m.id}`}><option value="member">Member</option><option value="admin">Admin</option></select>
                    {m.id !== currentUser.id && <button className="danger-link" onClick={() => remove(m.id)} data-testid={`remove-member-${m.id}`}>Keluarkan</button>}
                  </>
                ) : <span className="muted">{m.team_role === "admin" ? "Admin" : "Member"}</span>}
              </div>
            ))}
          </div>
        ) : tab === "add" ? (
          <div className="members-list" data-testid="available-members-list">
            {available.length ? available.map(u => (
              <div className="member-row" key={u.id} data-testid={`available-member-${u.id}`}>
                <Avatar id={u.id} name={u.name} photo={u.avatar} />
                <div><b>{u.name}</b><small>{u.email}</small></div>
                <button className="secondary" onClick={() => add(u.id)} data-testid={`add-member-${u.id}`}><UserPlus size={13} /> Tambah</button>
              </div>
            )) : <p className="muted" style={{ padding: "18px" }}>Semua pengguna sudah menjadi anggota.</p>}
          </div>
        ) : (
          <div className="team-settings" data-testid="team-settings-panel">
            <label className="sf-label">NAMA TIM<input value={teamName} onChange={e => setTeamName(e.target.value)} data-testid="team-name-input" /></label>
            <label className="sf-label">WARNA<div className="td-label-swatches">{LABEL_COLORS.map(c => <button type="button" key={c} style={{ background: c, outline: teamColor === c ? "2px solid #10213b" : "none" }} onClick={() => setTeamColor(c)} data-testid={`team-edit-color-${c}`} />)}</div></label>
            <button className="primary" onClick={saveTeam} disabled={!teamName.trim()} data-testid="save-team-button">Simpan Perubahan</button>

            <div className="team-danger-zone">
              <p className="sf-label">ZONA BERBAHAYA</p>
              {!confirmDelete ? (
                <button className="td-sidebar-btn danger" onClick={() => setConfirmDelete(true)} data-testid="delete-team-button"><Trash2 size={14} /> Hapus Tim</button>
              ) : (
                <div className="team-delete-confirm" data-testid="delete-team-confirm">
                  <p className="small">Yakin hapus tim "{team.name}"? Semua tugas, list, chat, pengumuman, dan dokumen di tim ini akan terhapus permanen dan tidak bisa dikembalikan.</p>
                  <div>
                    <button className="secondary" onClick={() => setConfirmDelete(false)} data-testid="cancel-delete-team-button">Batal</button>
                    <button className="td-sidebar-btn danger" onClick={deleteTeam} data-testid="confirm-delete-team-button">Ya, Hapus Permanen</button>
                  </div>
                </div>
              )}
            </div>
            {error && <div className="error" data-testid="team-settings-error">{error}</div>}
          </div>
        )}
      </section>
    </div>
  );
}
