import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Lead } from '../../types/lead.js';
import { PilotModeBanner } from './PilotModeBanner.js';
import { DashboardCompactChecklist } from './DashboardCompactChecklist.js';
import { WeeklyReviewMemoPanel } from './WeeklyReviewMemoPanel.js';
import { DailyOperationsLogPanel } from './DailyOperationsLogPanel.js';
import { DevDetails } from './common/DevDetails.js';
import {
  fetchSalesDashboard,
  type SalesDashboardResponse,
} from './salesDashboardApi.js';
import type { Daily30DashboardResponse } from './daily30Api.js';
import type { RecommendedActionTargetTab } from '../analytics/buildSalesDashboard.js';
import type { WeeklySalesSummary } from '../analytics/buildWeeklySalesSummary.js';
import type { SalesQueueItem } from '../analytics/buildTodaySalesQueue.js';
import { reconcileDashboardFromClientLeads } from './reconcileDashboardFromClientLeads.js';

const EMPTY_WEEKLY: WeeklySalesSummary = {
  weekStart: '—',
  weekEnd: '—',
  sentCount: 0,
  replyCount: 0,
  requestedReportCount: 0,
  declinedCount: 0,
  bouncedCount: 0,
  newLeadCount: 0,
  gmailDraftCreatedCount: 0,
  currentAwaitingReplyCount: 0,
  currentFollowUpTargetCount: 0,
};

interface SalesDashboardViewProps {
  onError: (message: string) => void;
  refreshKey?: number;
  daily30?: Daily30DashboardResponse | null;
  daily30Loading?: boolean;
  leads?: Lead[];
  onNavigate?: (tab: RecommendedActionTargetTab, leadId?: string | null) => void;
}

interface CompactHero {
  title: string;
  hint: string;
  tab: RecommendedActionTargetTab;
  cta: string;
  leadId?: string | null;
}

export function SalesDashboardView({
  onError,
  refreshKey = 0,
  daily30 = null,
  daily30Loading = false,
  leads = [],
  onNavigate,
}: SalesDashboardViewProps) {
  const [data, setData] = useState<SalesDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [weekView, setWeekView] = useState<'thisWeek' | 'lastWeek'>('thisWeek');
  const [weeklyReviewOpen, setWeeklyReviewOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchSalesDashboard();
      setData(result);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'ダッシュボードの読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const reconciled = useMemo(
    () => (data ? reconcileDashboardFromClientLeads(data, leads) : null),
    [data, leads]
  );

  const hero = useMemo((): CompactHero | null => {
    if (!reconciled) return null;
    const { metrics, topRecommendedAction } = reconciled;
    const target = daily30?.dashboard.targetEmailFound ?? daily30?.plan.target ?? 30;
    const emailFoundAtCollection = daily30Loading
      ? null
      : (daily30?.dashboard.emailFoundAtCollection ?? daily30?.emailFound ?? null);
    const emailShortfall =
      emailFoundAtCollection == null
        ? null
        : Math.max(0, target - emailFoundAtCollection);

    if (daily30Loading) {
      return {
        title: '収集状況を読み込み中…',
        hint: 'Cloud Daily 30 の実行結果を取得しています。',
        tab: 'candidate-collection',
        cta: '候補収集へ',
      };
    }

    if (emailShortfall != null && emailShortfall > 0) {
      return {
        title: `メール営業候補 ${emailFoundAtCollection} / ${target}`,
        hint: '9時の自動収集後、候補収集で確認してください。',
        tab: 'candidate-collection',
        cta: '候補収集へ',
      };
    }
    if (metrics.humanReviewPendingCount > 0) {
      return {
        title: `Lead化承認待ち ${metrics.humanReviewPendingCount}件`,
        hint: 'メール取得済候補を確認し、Lead化承認してください。',
        tab: 'candidate-collection',
        cta: '候補収集へ',
      };
    }
    if (metrics.gmailDraftPendingReviewCount > 0) {
      return {
        title: `下書き候補の承認待ち ${metrics.gmailDraftPendingReviewCount}件`,
        hint: '下書き候補タブで内容を確認。',
        tab: 'draft-candidates',
        cta: '下書き候補へ',
      };
    }
    if (metrics.awaitingReplyCount > 0) {
      return {
        title: `返信待ち ${metrics.awaitingReplyCount}件`,
        hint: '返信管理で最新返信を確認。',
        tab: 'reply-management',
        cta: '返信管理へ',
      };
    }
    if (topRecommendedAction) {
      return {
        title: `${topRecommendedAction.companyName} — ${topRecommendedAction.action}`,
        hint: '最優先の1件から対応。',
        tab: topRecommendedAction.targetTab,
        cta: `${tabLabel(topRecommendedAction.targetTab)}へ`,
        leadId: topRecommendedAction.leadId,
      };
    }
    return {
      title: '今日の営業サイクルは順調です',
      hint: '各タブで詳細を確認できます。',
      tab: 'dashboard',
      cta: 'Lead一覧へ',
    };
  }, [reconciled, daily30, daily30Loading]);

  if (loading) return <p className="loading dashboard-loading-compact">ダッシュボードを読み込み中…</p>;
  if (!data || !reconciled || !hero) {
    return <p className="hint">ダッシュボードデータを取得できませんでした。</p>;
  }

  const { metrics, dailyChecklist } = reconciled;
  const weeklySummary = reconciled.weeklySummary ?? { thisWeek: EMPTY_WEEKLY, lastWeek: EMPTY_WEEKLY };
  const todaySalesQueue: SalesQueueItem[] = reconciled.todaySalesQueue ?? [];
  const weekly = weekView === 'thisWeek' ? weeklySummary.thisWeek : weeklySummary.lastWeek;

  const emailFoundAtCollection = daily30Loading
    ? null
    : (daily30?.dashboard.emailFoundAtCollection ?? daily30?.emailFound ?? 0);
  const collectionTarget = daily30?.dashboard.targetEmailFound ?? daily30?.plan.target ?? 30;

  return (
    <div className="sales-dashboard-view dashboard-one-screen dashboard-compact dashboard-readable">
      <PilotModeBanner compact />

      <section className="dashboard-hero-compact" aria-label="今日の最優先">
        <p className="dashboard-hero-compact-label">今日の最優先</p>
        <p className="dashboard-hero-compact-title">{hero.title}</p>
        <p className="dashboard-hero-compact-hint">{hero.hint}</p>
        {onNavigate && hero.tab !== 'dashboard' && (
          <button
            type="button"
            className="btn btn-primary dashboard-hero-cta dashboard-hero-cta-btn"
            onClick={() => onNavigate(hero.tab, hero.leadId ?? null)}
          >
            {hero.cta}
          </button>
        )}
        {onNavigate && hero.tab === 'dashboard' && (
          <button
            type="button"
            className="btn btn-secondary dashboard-hero-cta dashboard-hero-cta-btn"
            onClick={() => onNavigate('leads')}
          >
            {hero.cta}
          </button>
        )}
      </section>

      <section className="dashboard-cycle-strip" aria-label="営業サイクル進捗">
        <h3 className="dashboard-section-label">営業サイクル進捗</h3>
        <div className="dashboard-cycle-strip-row">
          <CycleStepCompact
            label="メール営業候補"
            count={daily30Loading ? null : emailFoundAtCollection}
            suffix={daily30Loading ? '' : `/${collectionTarget}`}
            loading={daily30Loading}
          />
          <CycleStepCompact label="承認待ち" count={metrics.humanReviewPendingCount} />
          <CycleStepCompact label="下書き候補" count={metrics.gmailDraftCandidateCount} />
          <CycleStepCompact label="下書き可" count={metrics.gmailDraftReadyCount} />
          <CycleStepCompact
            label="送信済み"
            count={metrics.initialEmailSentCount + metrics.manualSentCount}
          />
          <CycleStepCompact
            label="返信待ち"
            count={metrics.awaitingReplyCount}
            highlight={metrics.awaitingReplyCount > 0}
          />
          <CycleStepCompact label="フォロー" count={metrics.followUpTargetCount} />
        </div>
      </section>

      <div className="dashboard-bottom-row">
        <section className="dashboard-queue-panel" aria-label="要対応キュー">
          <h3 className="dashboard-section-label">要対応キュー</h3>
          <div className="dashboard-queue-grid">
            {todaySalesQueue.map((q) => (
              <button
                key={q.category}
                type="button"
                className={`dashboard-queue-mini ${q.count > 0 ? 'dashboard-queue-mini-attn' : ''}`}
                disabled={!onNavigate || q.count === 0}
                onClick={() => onNavigate?.(q.targetTab)}
              >
                <span className="dashboard-queue-mini-title">{q.title}</span>
                <span className="dashboard-queue-mini-count">{q.count}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="dashboard-weekly-compact" aria-label="今週サマリー">
          <div className="dashboard-weekly-compact-head">
            <h3 className="dashboard-section-label">今週サマリー</h3>
            <div className="dashboard-weekly-toggle">
              <button
                type="button"
                className={`btn btn-secondary btn-xs ${weekView === 'thisWeek' ? 'active' : ''}`}
                onClick={() => setWeekView('thisWeek')}
              >
                今週
              </button>
              <button
                type="button"
                className={`btn btn-secondary btn-xs ${weekView === 'lastWeek' ? 'active' : ''}`}
                onClick={() => setWeekView('lastWeek')}
              >
                先週
              </button>
            </div>
          </div>
          <p className="hint dashboard-weekly-range">
            {weekly.weekStart} 〜 {weekly.weekEnd}
          </p>
          <div className="dashboard-weekly-stats">
            <WeeklyStat label="送信数" value={weekly.sentCount} />
            <WeeklyStat label="返信数" value={weekly.replyCount} />
            <WeeklyStat label="診断希望" value={weekly.requestedReportCount} highlight />
            <WeeklyStat label="フォロー対象" value={weekly.currentFollowUpTargetCount} />
          </div>

          {onNavigate && (
            <DashboardCompactChecklist items={dailyChecklist} onNavigate={(tab) => onNavigate(tab)} />
          )}

          <div className="dashboard-weekly-review-fold">
            <button
              type="button"
              className="btn btn-secondary btn-xs"
              onClick={() => setWeeklyReviewOpen((v) => !v)}
            >
              {weeklyReviewOpen ? '週次レビューを閉じる' : '週次レビューを開く'}
            </button>
            {weeklyReviewOpen && (
              <div className="dashboard-weekly-review-body">
                <WeeklyReviewMemoPanel compact />
              </div>
            )}
          </div>
        </section>
      </div>

      <DevDetails title="安全状態・開発者向け詳細" className="dashboard-dev-details">
        <ul className="policy-list compact">
          <li>自動送信: OFF</li>
          <li>Gmail下書き: 手動承認後のみ</li>
          <li>返信本文: 保存しない（要約のみ）</li>
          <li>秘密情報: 画面に表示しない</li>
        </ul>
        <DailyOperationsLogPanel />
        <p className="hint">取得: {new Date(data.generatedAt).toLocaleString('ja-JP')}</p>
      </DevDetails>
    </div>
  );
}

function CycleStepCompact({
  label,
  count,
  suffix,
  highlight,
  loading,
}: {
  label: string;
  count: number | null;
  suffix?: string;
  highlight?: boolean;
  loading?: boolean;
}) {
  return (
    <div className={`dashboard-cycle-step ${highlight ? 'dashboard-cycle-step-attn' : ''}`}>
      <span className="dashboard-cycle-step-count">
        {loading || count == null ? '…' : count}
        {!loading && count != null ? (suffix ?? '') : ''}
      </span>
      <span className="dashboard-cycle-step-label">{label}</span>
    </div>
  );
}

function WeeklyStat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div className={`dashboard-weekly-stat ${highlight ? 'dashboard-weekly-stat-highlight' : ''}`}>
      <span className="dashboard-weekly-stat-value">{value}</span>
      <span className="dashboard-weekly-stat-label">{label}</span>
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
    case 'weekly-review':
      return '週次レビュー';
    case 'leads':
      return 'Lead一覧';
    default:
      return 'ダッシュボード';
  }
}
