import { CalendarDays, Paperclip, CheckSquare, Lock, MoreHorizontal } from "lucide-react";
import { fileUrl, shortDate } from "../lib/api";
import { Avatar } from "./Avatar";

const PRIORITY_DOT = { high: "high", medium: "medium", low: "low", sedang: "medium" };

export function TaskCard({ task, members, labels, onOpen, onQuickMenu, stage = "todo" }) {
  const done = stage === "done";
  const assignedMembers = members.filter(m => (task.assignees || []).includes(m.id));
  const taskLabels = (task.labels || []).map(id => (labels || []).find(l => l.id === id)).filter(Boolean);
  const checklistDone = (task.checklist || []).reduce((s, c) => s + (c.done ? 1 : 0) + (c.subitems || []).filter(x => x.done).length, 0);
  const checklistTotal = (task.checklist || []).reduce((s, c) => s + 1 + (c.subitems || []).length, 0);
  const overdue = task.due_date && !done && task.due_date < new Date().toISOString().slice(0, 10);
  const pri = PRIORITY_DOT[(task.priority || "").toLowerCase()] || "medium";
  return (
    <article className="kb-card" onClick={onOpen} data-testid={`task-card-${task.id}`}>
      <span hidden data-testid={`task-stage-badge-${task.id}`}>{stage}</span>
      {onQuickMenu && (
        <button className="kb-card-menu" onClick={e => { e.stopPropagation(); onQuickMenu(); }} data-testid={`task-card-menu-${task.id}`}>
          <MoreHorizontal size={15} />
        </button>
      )}
      {task.cover && <img src={fileUrl(task.cover)} className="kb-card-cover" alt="" />}
      <div className="kb-card-top">
        <span className={`kb-priority-dot ${pri}`} title={task.priority} data-testid={`task-priority-${task.id}`} />
        {task.is_private && <Lock size={12} className="kb-private-icon" />}
      </div>
      <h4>{task.title}</h4>
      {!!taskLabels.length && (
        <div className="tags">{taskLabels.map((l, i) => <span key={i} className="kb-label-chip" style={{ background: l.color + "26", color: l.color, border: `1px solid ${l.color}55` }}>{l.name}</span>)}</div>
      )}
      <div className="kb-card-foot">
        {task.due_date && <span className={`due ${overdue ? "overdue" : done ? "is-done" : ""}`}><CalendarDays size={12} />{shortDate(task.due_date)}</span>}
        {checklistTotal > 0 && <span className="kb-checklist-badge"><CheckSquare size={12} />{checklistDone}/{checklistTotal}</span>}
        {!!(task.attachments || []).length && <span className="kb-attach-badge"><Paperclip size={12} />{task.attachments.length}</span>}
        <div className="kb-avatars">{assignedMembers.slice(0, 3).map(m => <Avatar key={m.id} id={m.id} name={m.name} photo={m.avatar} />)}</div>
      </div>
    </article>
  );
}
