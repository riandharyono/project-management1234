export function MentionText({ body, mentionIds, members }) {
  if (!mentionIds || !mentionIds.length) return <span>{body}</span>;
  const names = mentionIds.map(id => members.find(m => m.id === id)?.name).filter(Boolean).sort((a, b) => b.length - a.length);
  if (!names.length) return <span>{body}</span>;
  const escaped = names.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`(@(?:${escaped.join("|")}))`, "g");
  const parts = body.split(pattern);
  return <span>{parts.map((part, i) => names.some(n => part === `@${n}`) ? <b className="mention-tag" key={i}>{part}</b> : <span key={i}>{part}</span>)}</span>;
}
