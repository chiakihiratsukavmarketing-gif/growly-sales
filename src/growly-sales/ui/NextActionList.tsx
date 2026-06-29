import type { NextActionItem } from '../analytics/buildSalesAnalytics.js';
import { SectionCard } from './SectionCard.js';

interface NextActionListProps {
  items: NextActionItem[];
}

export function NextActionList({ items }: NextActionListProps) {
  return (
    <SectionCard title="次に対応すべきLead" className="analytics-section next-action-section">
      {items.length === 0 ? (
        <p className="hint">優先対応リストはありません。</p>
      ) : (
        <div className="lead-table-wrap">
          <table className="lead-table">
            <thead>
              <tr>
                <th>優先</th>
                <th>会社名</th>
                <th>理由</th>
                <th>フォロー日</th>
                <th>次アクション</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.leadId}>
                  <td>{i.priority}</td>
                  <td className="company-name">{i.companyName}</td>
                  <td>{i.reason}</td>
                  <td>{i.followUpDate ?? '—'}</td>
                  <td>{i.nextAction || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}
