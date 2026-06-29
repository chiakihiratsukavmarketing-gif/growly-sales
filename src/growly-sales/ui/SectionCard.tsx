import type { ReactNode } from 'react';

interface SectionCardProps {
  title?: string;
  children: ReactNode;
  className?: string;
}

export function SectionCard({ title, children, className = '' }: SectionCardProps) {
  return (
    <section className={`section-card${className ? ` ${className}` : ''}`}>
      {title ? <h3 className="section-card-title">{title}</h3> : null}
      {children}
    </section>
  );
}
