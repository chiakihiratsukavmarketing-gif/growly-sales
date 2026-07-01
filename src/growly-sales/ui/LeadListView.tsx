import { useEffect, useRef } from 'react';
import { LeadStatusBadge } from './LeadStatusBadge.js';
import type { Lead } from '../../types/lead.js';
import { leadListNextAction, leadListStatusLabel } from './leadDisplayUtils.js';

interface LeadListViewProps {
  leads: Lead[];
  selectedId: string | null;
  onSelect: (leadId: string) => void;
}

export function LeadListView({ leads, selectedId, onSelect }: LeadListViewProps) {
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!selectedId) return;
    const row = wrapRef.current?.querySelector('tr.selected');
    const pane = wrapRef.current;
    if (!row || !pane) return;
    const rowTop = row.offsetTop;
    const rowBottom = rowTop + row.offsetHeight;
    if (rowTop < pane.scrollTop) {
      pane.scrollTop = rowTop;
    } else if (rowBottom > pane.scrollTop + pane.clientHeight) {
      pane.scrollTop = rowBottom - pane.clientHeight;
    }
  }, [selectedId]);

  if (leads.length === 0) {
    return (
      <div className="list-empty">
        <p>Lead がありません。候補収集タブで候補を集めて Lead 化してください。</p>
      </div>
    );
  }

  return (
    <div className="lead-table-wrap lead-table-wrap-pane" ref={wrapRef}>
      <table className="lead-table lead-table-compact lead-table-fixed">
        <thead>
          <tr>
            <th>会社名</th>
            <th>地域</th>
            <th>状態</th>
            <th>スコア</th>
            <th>次アクション</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((lead) => (
            <tr
              key={lead.id}
              className={selectedId === lead.id ? 'selected' : ''}
              onClick={() => onSelect(lead.id)}
            >
              <td className="company-name lead-cell-ellipsis" title={lead.companyName}>{lead.companyName}</td>
              <td className="lead-cell-ellipsis" title={lead.area}>{lead.area}</td>
              <td className="lead-cell-ellipsis">
                <span className="lead-list-status">{leadListStatusLabel(lead)}</span>
              </td>
              <td>
                <LeadStatusBadge kind="score" value={lead.leadScore} />
              </td>
              <td className="lead-cell-ellipsis lead-cell-next-action" title={leadListNextAction(lead)}>{leadListNextAction(lead)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
