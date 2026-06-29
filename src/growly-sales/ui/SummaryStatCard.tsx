interface SummaryStatCardProps {
  value: number | string;
  label: string;
  highlight?: boolean;
}

export function SummaryStatCard({ value, label, highlight = false }: SummaryStatCardProps) {
  return (
    <div className={`stat-card${highlight ? ' highlight' : ''}`}>
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}
