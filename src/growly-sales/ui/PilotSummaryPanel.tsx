import type { PilotSummary } from '../analytics/buildPilotSummary.js';
import { SummaryStatCard } from './SummaryStatCard.js';
import { SectionCard } from './SectionCard.js';

interface PilotSummaryPanelProps {
  summary: PilotSummary;
}

export function PilotSummaryPanel({ summary }: PilotSummaryPanelProps) {
  return (
    <SectionCard title="パイロット運用サマリー" className="pilot-summary">
      <p className="hint">
        10社パイロット推奨（現在 {summary.totalLeads} 社
        {summary.overPilotRecommendation ? ' — 推奨を超過しています' : ''}）
      </p>

      <div className="stats-grid">
        <SummaryStatCard value={summary.totalLeads} label="現在のLead数" />
        <SummaryStatCard value={summary.remainingToPilot} label="10社まで残り" highlight />
        <SummaryStatCard value={summary.approvedCount} label="承認済み" />
        <SummaryStatCard value={summary.manualSentCount} label="手動送信済み" />
        <SummaryStatCard value={summary.replyRecordedCount} label="返信記録済み" />
        <SummaryStatCard value={summary.followUpNeededCount} label="要フォロー" />
        <SummaryStatCard value={summary.needsReviewCount} label="要確認Lead" />
        <SummaryStatCard value={summary.doNotContactCount} label="連絡禁止" />
      </div>
    </SectionCard>
  );
}
