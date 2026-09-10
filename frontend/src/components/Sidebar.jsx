import { useState } from "react";
import { Search, Plus, Inbox, Users, BarChart3, ChevronRight, Database } from "lucide-react";
import { Avatar } from "./Avatar";
import { BrandMark } from "./BrandMark";
import { canCreateTeam, canViewAllTeams, isSuperAdmin } from "../lib/roles";
import { groupTeamsByYear, isCurrentOrUpcomingYear, teamYear } from "../lib/years";

const ARCHIVE_KEY = "fs-open-archive-years";

function readOpenArchives() {
  try {
    const raw = JSON.parse(localStorage.getItem(ARCHIVE_KEY) || "[]");
    return new Set((Array.isArray(raw) ? raw : []).map(Number).filter(n => Number.isInteger(n)));
  } catch {
    return new Set();
  }
}

function TeamRow({ team, active, onSelect, onPrefetch }) {
  return (
    <a className={`ts-item ${active ? "active" : ""}`} onClick={() => onSelect(team.id)} onMouseEnter={() => onPrefetch?.(team.id)} onFocus={() => onPrefetch?.(team.id)} data-testid={`sidebar-team-${team.id}`}>
      <i className="ts-dot" style={{ background: team.color }} /> <span>{team.name}</span>
    </a>
  );
}

export function Sidebar({ teams, activeTeamId, onSelectHQ, onSelectTeam, onPrefetchTeam, onCreateTeam, user, userAdminOpen, onOpenUserAdmin, monitoringOpen, onOpenMonitoring, recapOpen, onOpenRecap, onOpenProfile }) {
  const [q, setQ] = useState("");
  const [openArchives, setOpenArchives] = useState(readOpenArchives);
  const searching = q.trim().length > 0;
  const filtered = teams.filter(t => t.name.toLowerCase().includes(q.toLowerCase()));
  const groups = groupTeamsByYear(filtered);
  const currentGroups = groups.filter(([year]) => isCurrentOrUpcomingYear(year));
  const archiveGroups = groups.filter(([year]) => !isCurrentOrUpcomingYear(year));
  const activeTeam = teams.find(t => t.id === activeTeamId);

  const yearIsOpen = year => {
    if (searching || isCurrentOrUpcomingYear(year)) return true;
    if (activeTeam && teamYear(activeTeam) === year) return true;
    return openArchives.has(year);
  };

  const toggleArchive = year => {
    setOpenArchives(prev => {
      const next = new Set(prev);
      if (next.has(year)) next.delete(year); else next.add(year);
      localStorage.setItem(ARCHIVE_KEY, JSON.stringify([...next]));
      return next;
    });
  };

  return (
    <aside className="team-sidebar">
      <div className="ts-brand">
        <BrandMark size={28} />
        <div className="ts-brand-text"><b>FallenStar</b><small>Workspace</small></div>
      </div>
      <div className="ts-search">
        <Search size={14} />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Cari tim" data-testid="sidebar-team-search" />
        {canCreateTeam(user) && (
          <button className="icon-button" onClick={onCreateTeam} data-testid="sidebar-create-team-button"><Plus size={15} /></button>
        )}
      </div>
      <nav className="ts-nav">
        <a className={`ts-item ${!activeTeamId && !userAdminOpen && !monitoringOpen && !recapOpen ? "active" : ""}`} onClick={onSelectHQ} data-testid="sidebar-hq-item">
          <Inbox size={16} /> <span>Tugas saya</span>
        </a>
        <a className={`ts-item ${recapOpen ? "active" : ""}`} onClick={onOpenRecap} data-testid="sidebar-recap-item">
          <Database size={16} /> <span>Rekap Data</span>
        </a>
        {canViewAllTeams(user) && (
          <a className={`ts-item ${monitoringOpen ? "active" : ""}`} onClick={onOpenMonitoring} data-testid="sidebar-monitoring-item">
            <BarChart3 size={16} /> <span>Monitoring</span>
          </a>
        )}
        {isSuperAdmin(user) && (
          <a className={`ts-item ${userAdminOpen ? "active" : ""}`} onClick={onOpenUserAdmin} data-testid="sidebar-user-admin-item">
            <Users size={16} /> <span>Pengguna</span>
          </a>
        )}
        {currentGroups.map(([year, list]) => (
          <div key={year} className="ts-year-group" data-testid={`sidebar-year-${year}`}>
            <p className="ts-label">Tim {year}</p>
            {list.map(t => (
              <TeamRow key={t.id} team={t} active={activeTeamId === t.id} onSelect={onSelectTeam} onPrefetch={onPrefetchTeam} />
            ))}
          </div>
        ))}
        {!currentGroups.length && !archiveGroups.length && <p className="ts-label">Tim</p>}
        {archiveGroups.length > 0 && (
          <div className="ts-archive" data-testid="sidebar-archive">
            <p className="ts-label">Arsip</p>
            {archiveGroups.map(([year, list]) => {
              const open = yearIsOpen(year);
              return (
                <div key={year} className="ts-archive-year" data-testid={`sidebar-archive-${year}`}>
                  <button type="button" className={`ts-archive-toggle ${open ? "open" : ""}`} onClick={() => toggleArchive(year)} data-testid={`sidebar-archive-toggle-${year}`}>
                    <ChevronRight size={13} />
                    <span>{year}</span>
                    <small>{list.length} tim</small>
                  </button>
                  {open && list.map(t => (
                    <TeamRow key={t.id} team={t} active={activeTeamId === t.id} onSelect={onSelectTeam} onPrefetch={onPrefetchTeam} />
                  ))}
                </div>
              );
            })}
          </div>
        )}
        {!filtered.length && <p className="ts-empty">Tim tidak ditemukan</p>}
      </nav>
      <div className="ts-bottom">
        <button className="ts-user" onClick={onOpenProfile} data-testid="sidebar-profile-button" title="Edit profil">
          <Avatar id={user.id} name={user.name} photo={user.avatar} />
          <span>{user.name}</span>
        </button>
      </div>
    </aside>
  );
}
