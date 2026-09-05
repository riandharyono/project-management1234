export function EmptyState({ icon, title, body, action, testId }) {
  return (
    <div className="empty-state" data-testid={testId || "empty-state"}>
      {icon && <div className="empty-state-icon">{icon}</div>}
      <b>{title}</b>
      {body && <p>{body}</p>}
      {action}
    </div>
  );
}
