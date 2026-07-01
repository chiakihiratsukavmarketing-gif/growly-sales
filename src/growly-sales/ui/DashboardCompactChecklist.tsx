import type { DailyChecklistItem } from '../analytics/buildDailySalesChecklist.js';
import type { RecommendedActionTargetTab } from '../analytics/buildSalesDashboard.js';

interface DashboardCompactChecklistProps {
  items: DailyChecklistItem[];
  onNavigate?: (tab: RecommendedActionTargetTab) => void;
}

export function DashboardCompactChecklist({ items, onNavigate }: DashboardCompactChecklistProps) {
  const okCount = items.filter((i) => i.status === 'ok').length;
  const attentionItems = items.filter((i) => i.status === 'attention').slice(0, 3);
  const attentionCount = items.filter((i) => i.status === 'attention').length;

  return (
    <div className="dashboard-checklist-compact">
      <div className="dashboard-checklist-compact-head">
        <span className="dashboard-checklist-compact-title">今日のチェック</span>
        <span className="dashboard-checklist-compact-summary">
          OK：{okCount}件 / 要対応：{attentionCount}件
        </span>
      </div>
      {attentionItems.length > 0 ? (
        <ul className="dashboard-checklist-compact-list">
          {attentionItems.map((item) => (
            <li key={item.id}>
              <span className="dashboard-checklist-compact-item-label">
                {item.badge ? `${item.label} ${item.badge}` : item.label}
              </span>
              {item.targetTab && onNavigate && (
                <button
                  type="button"
                  className="btn btn-secondary btn-xs"
                  onClick={() => onNavigate(item.targetTab!)}
                >
                  {tabLabel(item.targetTab)}へ
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="hint dashboard-checklist-compact-ok">要対応項目はありません。</p>
      )}
    </div>
  );
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
