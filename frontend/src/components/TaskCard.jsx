import { Clock, CheckCircle2, AlignJustify, Paperclip, Lock } from "lucide-react";
import { fileUrl, shortDate, localISODate } from "../lib/api";
import { Avatar } from "./Avatar";
import { priorityKey } from "../lib/priority";

function checklistBits(task) {
  const bits = [];
  (task.checklist || []).forEach(c => {
    bits.push(!!c.done);
    (c.subitems || []).forEach(s => bits.push(!!s.done));
  });
  return bits;
}

export function TaskCard({ task, members, labels, onOpen, onQuickMenu, stage = "todo" }) {
  const done = stage === "done";
  const assignedMembers = members.filter(m => (task.assignees || []).includes(m.id));
  const taskLabels = (task.labels || []).map(id => (labels || []).find(l => l.id === id)).filter(Boolean);
  const bits = checklistBits(task);
  const checklistDone = bits.filter(Boolean).length;
  const checklistTotal = bits.length;
  const pct = checklistTotal ? Math.round((checklistDone / checklistTotal) * 100) : 0;
  const overdue = task.due_date && !done && stage !== "cancelled" && task.due_date < localISODate();
  const chartBars = bits.length > 12 ? bits.filter((_, i) => i % Math.ceil(bits.length / 12) === 0).slice(0, 12) : bits;
  return (
    <article className="kb-card" onClick={onOpen} data-testid={`task-card-${task.id}`}>
      <span hidden data-testid={`task-stage-badge-${task.id}`}>{stage}</span>
      {task.cover && <img src={fileUrl(task.cover)} className="kb-card-cover" alt="" />}
      {task.is_private && <Lock size={12} className="kb-private-icon" />}
      <span hidden className={`kb-priority-dot ${priorityKey(task.priority)}`} data-testid={`task-priority-${task.id}`} />
      <h4>{task.title}</h4>
      {!!taskLabels.length && (
        <div className="tags">{taskLabels.map((l, i) => <span key={i} className="kb-label-chip" style={{ background: l.color + "26", color: l.color, border: `1px solid ${l.color}55` }}>{l.name}</span>)}</div>
      )}
      {checklistTotal > 0 && (
        <div className="kb-mini-chart" title={`${pct}%`} data-testid={`task-checklist-chart-${task.id}`}>
          <div className="kb-mini-chart-bars">
            {chartBars.map((d, i) => <i key={i} className={d ? "done" : ""} style={{ height: d ? `${40 + (i % 4) * 12}%` : `${18 + (i % 3) * 8}%` }} />)}
          </div>
          {pct > 0 && <em>{pct}%</em>}
        </div>
      )}
      <div className="kb-card-foot">
        {task.due_date && (
          <span className={`due ${overdue ? "overdue" : done ? "is-done" : "upcoming"}`}>
            {done ? <CheckCircle2 size={12} /> : <Clock size={12} />}
            {shortDate(task.due_date)}
          </span>
        )}
        {!!(task.attachments || []).length && <span className="kb-attach-badge"><Paperclip size={12} />{task.attachments.length}</span>}
        {onQuickMenu && (
          <button className="kb-card-menu" onClick={e => { e.stopPropagation(); onQuickMenu(); }} data-testid={`task-card-menu-${task.id}`}>
            <AlignJustify size={15} />
          </button>
        )}
        <div className="kb-avatars">{assignedMembers.slice(0, 3).map(m => <Avatar key={m.id} id={m.id} name={m.name} photo={m.avatar} />)}</div>
      </div>
    </article>
  );
}
