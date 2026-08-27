import { useState } from "react";
import { Search, Bell, ChevronDown, Settings, UserPlus, ShieldCheck, Users, ClipboardList, MessageSquare, Megaphone, CalendarClock, HelpCircle, FolderOpen } from "lucide-react";
import { initials, avatarColor } from "../lib/api";

const MAIN_TABS = [
  { key: "overview", label: "Ringkasan", icon: Users },
  { key: "tasks", label: "Tugas", icon: ClipboardList },
  { key: "chat", label: "Chat Grup", icon: MessageSquare },
  { key: "announcements", label: "Pengumuman", icon: Megaphone },
];
const MORE_TABS = [
  { key: "schedule", label: "Jadwal", icon: CalendarClock },
  { key: "questions", label: "Pertanyaan", icon: HelpCircle },
  { key: "documents", label: "Dokumen & File", icon: FolderOpen },
];

export function TopBar({ team, tab, onTabChange, onOpenHQ, members, myRole, onOpenAddMember, onOpenAccess, onOpenSettings, notifUnread, chatUnread, notifPermission, onEnableNotif, onToggleNotif, user, onLogout, onOpenProfile, query, setQuery, searchResults, onSelectSearchResult }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const activeTabLabel = [...MAIN_TABS, ...MORE_TABS].find(t => t.key === tab)?.label || "Ringkasan";
  return (
    <div className="team-top">
      <div className="tt-row1">
        <div className="tt-crumb">
          <span onClick={onOpenHQ} data-testid="breadcrumb-home">Beranda</span>
          {team && <><b>›</b><span className="tt-current">{team.name}</span></>}
          {team && tab !== "overview" && <><b>›</b><span className="tt-current">{activeTabLabel}</span></>}
        </div>
        <div className="tt-search">
          <Search size={14} />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Cari tugas…" data-testid="global-search-input" />
          {searchResults?.length > 0 && (
            <div className="tt-search-results" data-testid="search-results">
              {searchResults.map(r => <button key={r.id} onClick={() => onSelectSearchResult(r)} data-testid={`search-result-${r.id}`}>{r.title}</button>)}
            </div>
          )}
        </div>
        <div className="tt-actions">
          {notifPermission === "default" && (
            <button className="secondary enable-notif-button" onClick={onEnableNotif} data-testid="enable-notifications-button">
              <Bell size={13} /> Aktifkan Notifikasi
            </button>
          )}
          <button className="icon-button" onClick={onToggleNotif} data-testid="notifications-button"><Bell size={18} />{notifUnread > 0 && <i className="tt-badge" data-testid="notif-unread-badge">{notifUnread}</i>}</button>
          <button className="tt-user" onClick={onOpenProfile} data-testid="open-profile-button" title="Edit profil">
            <span className="avatar" style={{ background: avatarColor(user.id) }}>{initials(user.name)}</span>
            <span className="tt-user-name">{user.name}</span>
          </button>
          <button className="secondary tt-logout" onClick={onLogout} data-testid="topbar-logout-button">Keluar</button>
        </div>
      </div>
      {team && (
        <div className="tt-row2">
          <div className="tt-tabs">
            {MAIN_TABS.map(t => (
              <button key={t.key} className={tab === t.key ? "active" : ""} onClick={() => onTabChange(t.key)} data-testid={`tab-${t.key}`}>
                <span className="tab-icon-wrap"><t.icon size={15} />{t.key === "chat" && chatUnread && <i className="tab-unread-dot" data-testid="chat-unread-dot" />}</span> {t.label}
              </button>
            ))}
            <div className="tt-more">
              <button onClick={() => setMoreOpen(!moreOpen)} data-testid="tab-more-button">{MORE_TABS.some(m => m.key === tab) ? activeTabLabel : "3 lagi…"} <ChevronDown size={13} /></button>
              {moreOpen && (
                <div className="tt-more-menu" data-testid="tab-more-menu">
                  {MORE_TABS.map(t => (
                    <button key={t.key} className={tab === t.key ? "active" : ""} onClick={() => { onTabChange(t.key); setMoreOpen(false); }} data-testid={`tab-${t.key}`}>
                      <t.icon size={14} /> {t.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="tt-team-actions">
            {myRole === "admin" && <button className="secondary" onClick={onOpenAddMember} data-testid="add-member-button"><UserPlus size={14} /> Tambah Anggota</button>}
            <div className="tt-avatars">
              {members.slice(0, 4).map(m => <span key={m.id} className="avatar" style={{ background: avatarColor(m.id) }}>{initials(m.name)}</span>)}
              {members.length > 4 && <span className="avatar more">+{members.length - 4}</span>}
            </div>
            <button className="secondary" onClick={onOpenAccess} data-testid="access-button"><ShieldCheck size={14} /> Akses</button>
            {myRole === "admin" && <button className="icon-button" onClick={onOpenSettings} data-testid="team-settings-button"><Settings size={16} /></button>}
          </div>
        </div>
      )}
    </div>
  );
}
