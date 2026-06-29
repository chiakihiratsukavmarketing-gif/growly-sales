import type { SalesAnalytics } from '../analytics/buildSalesAnalytics.js';
import { SummaryStatCard } from './SummaryStatCard.js';
import { SectionCard } from './SectionCard.js';

function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

interface AnalyticsSummaryCardsProps {
  analytics: SalesAnalytics;
}

export function AnalyticsSummaryCards({ analytics }: AnalyticsSummaryCardsProps) {
  return (
    <SectionCard title="営業結果サマリー" className="analytics-cards">
      <div className="stats-grid">
        <SummaryStatCard value={analytics.totalLeads} label="全Lead" />
        <SummaryStatCard value={analytics.approvedLeads} label="承認済" />
        <SummaryStatCard value={analytics.manualSentLeads} label="手動送信済" highlight />
        <SummaryStatCard value={analytics.notSentLeads} label="未送信" />
        <SummaryStatCard value={analytics.followUpNeededCount} label="フォロー必要" />
        <SummaryStatCard value={analytics.wonDeals} label="受注" />
      </div>

      <div className="analytics-rates">
        <div className="rate">
          <span className="rate-label">手動送信率</span>
          <span className="rate-value">{pct(analytics.manualSendRate)}</span>
        </div>
        <div className="rate">
          <span className="rate-label">返信率</span>
          <span className="rate-value">{pct(analytics.replyRate)}</span>
        </div>
        <div className="rate">
          <span className="rate-label">興味あり率</span>
          <span className="rate-value">{pct(analytics.interestedRate)}</span>
        </div>
        <div className="rate">
          <span className="rate-label">商談化率</span>
          <span className="rate-value">{pct(analytics.meetingRate)}</span>
        </div>
        <div className="rate">
          <span className="rate-label">受注率</span>
          <span className="rate-value">{pct(analytics.wonRate)}</span>
        </div>
      </div>
    </SectionCard>
  );
}
