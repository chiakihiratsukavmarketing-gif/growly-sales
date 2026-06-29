import type { ContactPathAnalytics } from '../analytics/buildContactPathAnalytics.js';
import { SectionCard } from './SectionCard.js';

interface ContactPathAnalyticsPanelProps {
  analytics: ContactPathAnalytics;
}

export function ContactPathAnalyticsPanel({ analytics }: ContactPathAnalyticsPanelProps) {
  return (
    <SectionCard title="連絡導線分析">
      <p className="hint">{analytics.note}</p>
      <div className="stats-grid">
        <div className="stat-card">
          <span className="stat-label">総Lead数</span>
          <span className="stat-value">{analytics.totalLeads}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Gmail下書き候補になり得る</span>
          <span className="stat-value">{analytics.gmailDraftPossibleLeads}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">フォームコピー運用</span>
          <span className="stat-value">{analytics.formCopyOnlyLeads}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">email + form 両方</span>
          <span className="stat-value">
            {analytics.bothEmailAndFormLeads}（{analytics.bothRate}%）
          </span>
        </div>
        <div className="stat-card">
          <span className="stat-label">emailCandidatesあり</span>
          <span className="stat-value">
            {analytics.emailCandidateLeads}（{analytics.emailCandidateRate}%）
          </span>
        </div>
        <div className="stat-card">
          <span className="stat-label">問い合わせフォームのみ</span>
          <span className="stat-value">
            {analytics.contactFormOnlyLeads}（{analytics.contactFormRate}%）
          </span>
        </div>
        <div className="stat-card">
          <span className="stat-label">連絡導線なし</span>
          <span className="stat-value">
            {analytics.noContactPathLeads}（{analytics.noContactPathRate}%）
          </span>
        </div>
      </div>
    </SectionCard>
  );
}
