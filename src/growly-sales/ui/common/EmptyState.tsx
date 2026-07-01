interface EmptyStateProps {
  title: string;
  reason?: string;
  nextHint?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ title, reason, nextHint, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <p className="empty-state-title">{title}</p>
      {reason ? <p className="empty-state-reason">{reason}</p> : null}
      {nextHint ? <p className="empty-state-next">{nextHint}</p> : null}
      {actionLabel && onAction ? (
        <button type="button" className="btn btn-primary" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
