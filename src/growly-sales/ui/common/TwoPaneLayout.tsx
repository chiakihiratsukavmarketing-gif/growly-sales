import type { ReactNode } from 'react';

interface TwoPaneLayoutProps {
  left: ReactNode;
  right: ReactNode;
  leftAriaLabel?: string;
  rightAriaLabel?: string;
}

export function TwoPaneLayout({
  left,
  right,
  leftAriaLabel = '一覧',
  rightAriaLabel = '詳細',
}: TwoPaneLayoutProps) {
  return (
    <div className="two-pane-layout">
      <section className="two-pane-left" aria-label={leftAriaLabel}>
        {left}
      </section>
      <section className="two-pane-right" aria-label={rightAriaLabel}>
        {right}
      </section>
    </div>
  );
}
