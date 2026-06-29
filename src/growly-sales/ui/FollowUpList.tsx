import type { FollowUpItem } from '../analytics/buildSalesAnalytics.js';
import { LeadStatusBadge } from './LeadStatusBadge.js';
import { SectionCard } from './SectionCard.js';

interface FollowUpListProps {
  items: FollowUpItem[];
}

export function FollowUpList({ items }: FollowUpListProps) {
  return (
    <SectionCard title="フォロー予定一覧" className="analytics-section">
      {items.length === 0 ? (
        <p className="hint">フォロー予定はありません。</p>
      ) : (
        <div className="lead-table-wrap">
          <table className="lead-table">
            <thead>
              <tr>
                <th>会社名</th>
                <th>フォロー日</th>
                <th>返信</th>
                <th>商談</th>
                <th>メモ</th>
                <th>次アクション</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.leadId}>
                  <td className="company-name">{i.companyName}</td>
                  <td>{i.followUpDate}</td>
                  <td><LeadStatusBadge kind="send" value={i.replyStatus} /></td>
                  <td><LeadStatusBadge kind="send" value={i.dealStatus} /></td>
                  <td>{i.followUpMemo || '—'}</td>
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
