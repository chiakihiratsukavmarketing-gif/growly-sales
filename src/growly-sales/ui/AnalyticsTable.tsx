import type { BreakdownRow } from '../analytics/buildSalesAnalytics.js';
import { SectionCard } from './SectionCard.js';

interface AnalyticsTableProps {
  title: string;
  rows: BreakdownRow[];
}

export function AnalyticsTable({ title, rows }: AnalyticsTableProps) {
  return (
    <SectionCard title={title} className="analytics-section">
      {rows.length === 0 ? (
        <p className="hint">データがありません。</p>
      ) : (
        <div className="lead-table-wrap">
          <table className="lead-table">
            <thead>
              <tr>
                <th>キー</th>
                <th>合計</th>
                <th>手動送信</th>
                <th>返信</th>
                <th>興味</th>
                <th>商談化</th>
                <th>受注</th>
                <th>失注</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <td className="company-name">{r.key}</td>
                  <td>{r.total}</td>
                  <td>{r.manualSent}</td>
                  <td>{r.replied}</td>
                  <td>{r.interested}</td>
                  <td>{r.meetingScheduled}</td>
                  <td>{r.won}</td>
                  <td>{r.lost}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}
