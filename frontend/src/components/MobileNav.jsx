import { Bell, ClipboardList, Home, Menu, Search } from "lucide-react";

export function MobileNav({ active, unread, onHome, onNotif, onTasks, onSearch, onMenu }) {
  const items = [
    { key: "home", label: "Beranda", icon: Home, onClick: onHome },
    { key: "notif", label: "Notifikasi", icon: Bell, onClick: onNotif, badge: unread },
    { key: "tasks", label: "Tugas", icon: ClipboardList, onClick: onTasks },
    { key: "search", label: "Cari", icon: Search, onClick: onSearch },
    { key: "menu", label: "Menu", icon: Menu, onClick: onMenu },
  ];
  return (
    <nav className="m-nav" data-testid="mobile-nav">
      {items.map(it => (
        <button
          key={it.key}
          type="button"
          className={active === it.key ? "on" : ""}
          onClick={it.onClick}
          data-testid={`mobile-nav-${it.key}`}
        >
          <span className="m-nav-icon">
            <it.icon size={22} />
            {it.badge > 0 && <i className="m-nav-badge">{it.badge > 9 ? "9+" : it.badge}</i>}
          </span>
          {it.label}
        </button>
      ))}
    </nav>
  );
}
