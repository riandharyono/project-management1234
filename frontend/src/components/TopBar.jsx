import { useEffect, useRef, useState } from "react";
import { Search, Bell, Settings, UserPlus, ShieldCheck, LayoutGrid, ClipboardList, MessageSquare, Megaphone, CalendarClock, HelpCircle, FolderOpen, LogOut, User, Moon, Sun } from "lucide-react";
import { Avatar } from "./Avatar";
import { applyTheme, readTheme } from "../lib/theme";

const TABS = [
  { key: "overview", label: "Ringkasan", icon: LayoutGrid },
  { key: "tasks", label: "Tugas", icon: ClipboardList },
  { key: "chat", label: "Chat", icon: MessageSquare },
  { key: "announcements", label: "Pengumuman", icon: Megaphone },
  { key: "schedule", label: "Jadwal", icon: CalendarClock },
  { key: "questions", label: "Pertanyaan", icon: HelpCircle },
  { key: "documents", label: "Dokumen", icon: FolderOpen },
];

export function TopBar({ team, tab, onTabChange, onOpenHQ, members, myRole, onOpenAddMember, onOpenAccess, onOpenSettings, notifUnread, chatUnread, notifPermission, onEnableNotif, onToggleNotif, user, onLogout, onOpenProfile, query, setQuery, searchResults, onSelectSearchResult, onOpenPalette }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [theme, setTheme] = useState(readTheme);
  const menuRef = useRef(null);
  const activeTabLabel = TABS.find(t => t.key === tab)?.label;
  const toggleTheme = () => setTheme(applyTheme(theme === "dark" ? "light" : "dark"));

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = e => { if (!menuRef.current?.contains(e.target)) setMenuOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  return (
    <div className="team-top">
      <div className="tt-row1">
        <div className="tt-crumb">
          <span onClick={onOpenHQ} data-testid="breadcrumb-home">Tugas saya</span>
          {team && <><b>/</b><span className="tt-current">{team.name}</span></>}
          {team && tab !== "overview" && activeTabLabel && <><b>/</b><span className="tt-current">{activeTabLabel}</span></>}
        </div>
        <div className="tt-search" onClick={onOpenPalette} role="button">
          <Search size={14} />
          <input value={query} onChange={e => { setQuery(e.target.value); onOpenPalette?.(); }} onFocus={onOpenPalette} placeholder="Cari atau jalankan perintah…" data-testid="global-search-input" readOnly />
          <kbd className="tt-kbd">Ctrl K</kbd>
          {searchResults?.length > 0 && (
            <div className="tt-search-results" data-testid="search-results">
              {searchResults.map(r => <button key={r.id} onClick={() => onSelectSearchResult(r)} data-testid={`search-result-${r.id}`}>{r.title}</button>)}
            </div>
          )}
        </div>
        <div className="tt-actions">
          {notifPermission === "default" && (
            <button className="secondary enable-notif-button" onClick={onEnableNotif} data-testid="enable-notifications-button">
              <Bell size={13} /> Aktifkan notifikasi
            </button>
          )}
          <button className="icon-button" onClick={onToggleNotif} data-testid="notifications-button"><Bell size={18} />{notifUnread > 0 && <i className="tt-badge" data-testid="notif-unread-badge">{notifUnread}</i>}</button>
          <div className="tt-user-wrap" ref={menuRef}>
            <button className="tt-user" onClick={() => setMenuOpen(o => !o)} data-testid="open-profile-button" title="Akun">
              <Avatar id={user.id} name={user.name} photo={user.avatar} />
              <span className="tt-user-name">{user.name}</span>
            </button>
            {menuOpen && (
              <div className="tt-user-menu" data-testid="user-menu">
                <button onClick={() => { setMenuOpen(false); onOpenProfile(); }} data-testid="user-menu-profile"><User size={14} /> Profil</button>
                <button onClick={toggleTheme} data-testid="theme-toggle-button">
                  {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />} {theme === "dark" ? "Mode terang" : "Mode gelap"}
                </button>
                <button onClick={() => { setMenuOpen(false); onLogout(); }} data-testid="topbar-logout-button"><LogOut size={14} /> Keluar</button>
              </div>
            )}
          </div>
        </div>
      </div>
      {team && (
        <div className="tt-row2">
          <div className="tt-tabs">
            {TABS.map(t => (
              <button key={t.key} className={tab === t.key ? "active" : ""} onClick={() => onTabChange(t.key)} data-testid={`tab-${t.key}`}>
                <span className="tab-icon-wrap"><t.icon size={14} />{t.key === "chat" && chatUnread && <i className="tab-unread-dot" data-testid="chat-unread-dot" />}</span> {t.label}
              </button>
            ))}
          </div>
          <div className="tt-team-actions">
            {myRole === "admin" && <button className="secondary" onClick={onOpenAddMember} data-testid="add-member-button"><UserPlus size={14} /> Tambah</button>}
            <div className="tt-avatars">
              {members.slice(0, 4).map(m => <Avatar key={m.id} id={m.id} name={m.name} photo={m.avatar} />)}
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
