import { Clock, CheckCircle2, AlignJustify, Paperclip, Lock, Database, CheckSquare } from "lucide-react";
import { shortDate, isDueReached } from "../lib/api";
import { Avatar } from "./Avatar";
import { priorityKey } from "../lib/priority";
import { linkedDataSummary } from "../lib/dataDocs";
import { TitleHtml } from "./TitleEditor";

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
  const dueReached = isDueReached(task.due_date, { done, cancelled: stage === "cancelled" });
  const data = linkedDataSummary(task.linked_data_requests);
  const pri = priorityKey(task.priority);
  return (
    <article className={`kb-card ${dueReached ? "is-overdue" : ""} ${done ? "is-done-card" : ""}`} onClick={onOpen} data-testid={`task-card-${task.id}`}>
      <span hidden data-testid={`task-stage-badge-${task.id}`}>{stage}</span>
      {task.is_private && <Lock size={12} className="kb-private-icon" />}
      <h4><TitleHtml task={task} /></h4>
      {!!taskLabels.length && (
        <div className="tags">{taskLabels.map((l, i) => <span key={i} className="kb-label-chip" style={{ background: l.color + "26", color: l.color, border: `1px solid ${l.color}55` }}>{l.name}</span>)}</div>
      )}
      <div className="kb-card-foot">
        {pri === "high" && <span className="kb-pri high">Tinggi</span>}
        {task.due_date && (
          <span className={`due ${dueReached ? "overdue" : done ? "is-done" : "upcoming"}`}>
            {done ? <CheckCircle2 size={12} /> : <Clock size={12} />}
            {shortDate(task.due_date)}
          </span>
        )}
        {checklistTotal > 0 && (
          <span className="kb-check-count" data-testid={`task-checklist-chart-${task.id}`}>
            <CheckSquare size={12} />{checklistDone}/{checklistTotal}
          </span>
        )}
        {!!(task.attachments || []).length && <span className="kb-attach-badge"><Paperclip size={12} />{task.attachments.length}</span>}
        {data && (
          <span className={`kb-data-badge ${data.tone}`} title={(task.linked_data_requests || []).map(d => d.name).join(", ")}>
            <Database size={12} />
            {data.complete}/{data.total} data
          </span>
        )}
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
