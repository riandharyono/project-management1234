import { Bell } from "lucide-react";
import { timeAgo } from "../lib/api";

export function NotificationsPanel({ items, hasMore, onRead, onReadAll, onSelect, onLoadMore }) {
  return (
    <div className="notif-dropdown" data-testid="notifications-dropdown">
      <div className="notif-head"><b>Notifikasi</b><button onClick={onReadAll} data-testid="mark-all-read-button">Tandai semua dibaca</button></div>
      <div className="notif-list">
        {items.length ? items.map(n => (
          <button key={n.id} className={`notif-item ${n.read ? "" : "unread"}`} onClick={() => { onRead(n.id); onSelect(n); }} data-testid={`notification-${n.id}`}>
            <Bell size={14} />
            <div><p>{n.text}</p><small>{timeAgo(n.created_at)}</small></div>
          </button>
        )) : <p className="muted notif-empty">Belum ada notifikasi</p>}
        {hasMore && <button className="notif-load-more" onClick={onLoadMore} data-testid="notifications-load-more-button">Muat lebih banyak</button>}
      </div>
    </div>
  );
}
