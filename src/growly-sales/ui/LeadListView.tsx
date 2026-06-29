import type { Lead } from '../../types/lead.js';
import {
  LeadStatusBadge,
  hasCaseStudy,
  hasContactForm,
  hasInstagram,
  yesNoLabel,
} from './LeadStatusBadge.js';

interface LeadListViewProps {
  leads: Lead[];
  selectedId: string | null;
  onSelect: (leadId: string) => void;
}

export function LeadListView({ leads, selectedId, onSelect }: LeadListViewProps) {
  if (leads.length === 0) {
    return (
      <div className="list-empty">
        <p>表示するリードがありません。input-sites.csv から day1 を実行してください。</p>
      </div>
    );
  }

  return (
    <div className="lead-table-wrap">
      <table className="lead-table">
        <thead>
          <tr>
            <th>会社名</th>
            <th>地域</th>
            <th>業種</th>
            <th>Score</th>
            <th>校閲</th>
            <th>人間</th>
            <th>送信</th>
            <th>返信</th>
            <th>商談</th>
            <th>フォロー</th>
            <th>リスク</th>
            <th>IG</th>
            <th>フォーム</th>
            <th>事例</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((lead) => (
            <tr
              key={lead.id}
              className={selectedId === lead.id ? 'selected' : ''}
              onClick={() => onSelect(lead.id)}
            >
              <td className="company-name">{lead.companyName}</td>
              <td>{lead.area}</td>
              <td>{lead.industry}</td>
              <td>
                <LeadStatusBadge kind="score" value={lead.leadScore} />
              </td>
              <td>
                <LeadStatusBadge kind="review" value={lead.reviewStatus} />
              </td>
              <td>
                <LeadStatusBadge kind="human" value={lead.humanReviewStatus} />
              </td>
              <td>
                <LeadStatusBadge kind="send" value={lead.sendStatus ?? 'not_sent'} />
              </td>
              <td>
                <LeadStatusBadge kind="send" value={lead.replyStatus ?? 'none'} />
              </td>
              <td>
                <LeadStatusBadge kind="send" value={lead.dealStatus ?? 'none'} />
              </td>
              <td>{lead.followUpDate ? new Date(lead.followUpDate).toLocaleDateString('ja-JP') : '—'}</td>
              <td>
                <LeadStatusBadge kind="risk" value={lead.riskLevel} />
              </td>
              <td>{yesNoLabel(hasInstagram(lead))}</td>
              <td>{yesNoLabel(hasContactForm(lead))}</td>
              <td>{yesNoLabel(hasCaseStudy(lead))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
