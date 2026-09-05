import { Bell, AtSign, UserPlus, Megaphone, CalendarClock, HelpCircle, MessageCircle } from "lucide-react";
import { timeAgo } from "../lib/api";

const ICONS = {
  mention: AtSign,
  assignment: UserPlus,
  announcement: Megaphone,
  deadline: CalendarClock,
  answer: MessageCircle,
  question: HelpCircle,
};
const LABELS = {
  mention: "Mention",
  assignment: "Penugasan",
  announcement: "Pengumuman",
  deadline: "Tenggat",
  answer: "Jawaban",
  question: "Pertanyaan",
};

export function NotificationsPanel({ items, hasMore, onRead, onReadAll, onSelect, onLoadMore }) {
  return (
    <div className="notif-dropdown" data-testid="notifications-dropdown">
      <div className="notif-head"><b>Notifikasi</b><button onClick={onReadAll} data-testid="mark-all-read-button">Tandai semua dibaca</button></div>
      <div className="notif-list">
        {items.length ? items.map(n => {
          const Icon = ICONS[n.type] || Bell;
          return (
            <button key={n.id} className={`notif-item ${n.read ? "" : "unread"}`} onClick={() => { onRead(n.id); onSelect(n); }} data-testid={`notification-${n.id}`}>
              <span className={`notif-icon type-${n.type || "default"}`}><Icon size={14} /></span>
              <div>
                <small className="notif-kind">{LABELS[n.type] || "Pembaruan"}</small>
                <p>{n.text}</p>
                <small>{timeAgo(n.created_at)}</small>
              </div>
            </button>
          );
        }) : <p className="muted notif-empty">Belum ada notifikasi</p>}
        {hasMore && <button className="notif-load-more" onClick={onLoadMore} data-testid="notifications-load-more-button">Muat lebih banyak</button>}
      </div>
    </div>
  );
}
