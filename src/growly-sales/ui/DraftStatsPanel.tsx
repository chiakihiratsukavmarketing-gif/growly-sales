import type { DraftStats } from './draftStatsApi.js';
import { SummaryStatCard } from './SummaryStatCard.js';

interface DraftStatsPanelProps {
  stats: DraftStats | null;
  loading: boolean;
}

export function DraftStatsPanel({ stats, loading }: DraftStatsPanelProps) {
  if (loading && !stats) {
    return (
      <section className="stats-panel">
        <p className="stats-loading">統計を読み込み中…</p>
      </section>
    );
  }

  if (!stats) return null;

  return (
    <section className="stats-panel">
      <h2 className="stats-title">下書きエクスポート統計</h2>
      <p className="stats-note">{stats.note}</p>
      <div className="stats-grid">
        <SummaryStatCard value={stats.totalLeads} label="全Lead" />
        <SummaryStatCard value={stats.approvedCount} label="人間承認済" />
        <SummaryStatCard value={stats.draftCandidateCount} label="下書き候補" highlight />
        <SummaryStatCard value={stats.notSentCount} label="未送信" />
        <SummaryStatCard value={stats.doNotContactCount} label="連絡禁止" />
      </div>
      <p className="stats-hint">
        下書き候補の出力: <code>npm run growly-sales:export-drafts</code>
        （Gmail API・自動送信なし）
      </p>
      {stats.generatedAt && (
        <p className="stats-hint">
          取得時刻: {new Date(stats.generatedAt).toLocaleString('ja-JP')}
          {typeof stats.excludedCount === 'number' ? ` / 除外: ${stats.excludedCount}件` : ''}
        </p>
      )}
    </section>
  );
}
