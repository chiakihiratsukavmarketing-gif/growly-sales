import { useState, type ReactNode } from 'react';

interface DevDetailsProps {
  title?: string;
  className?: string;
  children: ReactNode;
}

export function DevDetails({ title = '開発者向け詳細', className, children }: DevDetailsProps) {
  const [open, setOpen] = useState(false);
  return (
    <details
      className={className ? `dev-details ${className}` : 'dev-details'}
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary>{title}</summary>
      <div className="dev-details-body">{children}</div>
    </details>
  );
}
