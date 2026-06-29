import type { DailyChecklistItem } from '../analytics/buildDailySalesChecklist.js';
import type { RecommendedActionTargetTab } from '../analytics/buildSalesDashboard.js';
import { SectionCard } from './SectionCard.js';

interface DailyChecklistPanelProps {
  items: DailyChecklistItem[];
  onNavigate?: (tab: RecommendedActionTargetTab) => void;
}

export function DailyChecklistPanel({ items, onNavigate }: DailyChecklistPanelProps) {
  return (
    <SectionCard title="今日やること（日次営業チェックリスト）" className="daily-checklist-panel">
      <p className="hint">
        毎日この順で確認してください。自動送信は行いません。返信なしの場合は更新不要です。
      </p>
      <ol className="daily-checklist">
        {items.map((item) => (
          <li
            key={item.id}
            className={`daily-checklist-item daily-checklist-${item.status}`}
          >
            <div className="daily-checklist-main">
              <span className={`daily-checklist-status daily-checklist-status-${item.status}`}>
                {statusLabel(item.status)}
              </span>
              <strong className="daily-checklist-label">{item.label}</strong>
              {item.badge && <span className="daily-checklist-badge">{item.badge}</span>}
            </div>
            <p className="hint daily-checklist-desc">{item.description}</p>
            {item.targetTab && onNavigate && item.status !== 'ok' && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => onNavigate(item.targetTab!)}
              >
                {tabLabel(item.targetTab)}へ
              </button>
            )}
          </li>
        ))}
      </ol>
    </SectionCard>
  );
}

function statusLabel(status: DailyChecklistItem['status']): string {
  switch (status) {
    case 'attention':
      return '要対応';
    case 'routine':
      return '毎日';
    case 'optional':
      return '任意';
    default:
      return 'OK';
  }
}

function tabLabel(tab: RecommendedActionTargetTab): string {
  switch (tab) {
    case 'draft-candidates':
      return '下書き候補';
    case 'send-records':
      return '送信記録';
    case 'reply-management':
      return '返信管理';
    case 'follow-up':
      return 'フォローアップ';
    case 'candidate-collection':
      return '候補収集';
    default:
      return '開く';
  }
}
