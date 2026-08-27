import { useState } from "react";
import { Search, Plus, Home, LogOut, Users } from "lucide-react";
import { initials } from "../lib/api";

export function Sidebar({ teams, activeTeamId, onSelectHQ, onSelectTeam, onCreateTeam, user, onLogout, userAdminOpen, onOpenUserAdmin }) {
  const [q, setQ] = useState("");
  const filtered = teams.filter(t => t.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <aside className="team-sidebar">
      <div className="ts-brand">
        <div className="brand-mark small">P</div>
        <div className="ts-brand-text"><b>Project Management</b><small>created by R</small></div>
      </div>
      <div className="ts-search">
        <Search size={14} />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Cari Tim" data-testid="sidebar-team-search" />
        <button className="icon-button" onClick={onCreateTeam} data-testid="sidebar-create-team-button"><Plus size={15} /></button>
      </div>
      <nav className="ts-nav">
        <a className={`ts-item ${!activeTeamId && !userAdminOpen ? "active" : ""}`} onClick={onSelectHQ} data-testid="sidebar-hq-item">
          <Home size={16} /> <span>HQ</span>
        </a>
        {user.role === "admin" && (
          <a className={`ts-item ${userAdminOpen ? "active" : ""}`} onClick={onOpenUserAdmin} data-testid="sidebar-user-admin-item">
            <Users size={16} /> <span>Kelola Pengguna</span>
          </a>
        )}
        <p className="ts-label">TIM SAYA</p>
        {filtered.map(t => (
          <a key={t.id} className={`ts-item ${activeTeamId === t.id ? "active" : ""}`} onClick={() => onSelectTeam(t.id)} data-testid={`sidebar-team-${t.id}`}>
            <i className="ts-dot" style={{ background: t.color }} /> <span>{t.name}</span>
          </a>
        ))}
        {!filtered.length && <p className="ts-empty">Tim tidak ditemukan</p>}
      </nav>
      <div className="ts-bottom">
        <div className="ts-user"><span className="avatar" style={{ background: "#E8531F" }}>{initials(user.name)}</span><span>{user.name}</span></div>
        <button onClick={onLogout} data-testid="sidebar-logout-button"><LogOut size={15} /> <span>Keluar</span></button>
      </div>
    </aside>
  );
}
