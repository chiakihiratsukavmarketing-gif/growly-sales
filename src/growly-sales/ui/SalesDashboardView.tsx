import { useCallback, useEffect, useMemo, useState } from 'react';
import { SummaryStatCard } from './SummaryStatCard.js';
import { SectionCard } from './SectionCard.js';
import { InfoBanner } from './InfoBanner.js';
import { DailyChecklistPanel } from './DailyChecklistPanel.js';
import { DailyOperationsLogPanel } from './DailyOperationsLogPanel.js';
import { WeeklyReviewMemoPanel } from './WeeklyReviewMemoPanel.js';
import {
  fetchSalesDashboard,
  type SalesDashboardResponse,
} from './salesDashboardApi.js';
import type { RecommendedActionTargetTab } from '../analytics/buildSalesDashboard.js';
import type { WeeklySalesSummary } from '../analytics/buildWeeklySalesSummary.js';
import type { SalesQueueItem } from '../analytics/buildTodaySalesQueue.js';

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

export const DASHBOARD_READONLY_NOTE =
  '見える化のみ。Gmail下書き作成・自動送信・Gmail API 操作は行いません。leads.json / leads.csv の現在状態を表示しています。';

interface SalesDashboardViewProps {
  onError: (message: string) => void;
  refreshKey?: number;
  onNavigate?: (tab: RecommendedActionTargetTab, leadId?: string | null) => void;
}

export function SalesDashboardView({
  onError,
  refreshKey = 0,
  onNavigate,
}: SalesDashboardViewProps) {
  const [data, setData] = useState<SalesDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [weekView, setWeekView] = useState<'thisWeek' | 'lastWeek'>('thisWeek');

  const weeklyMemoMissing = useMemo(() => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    const day = (date.getDay() + 6) % 7;
    date.setDate(date.getDate() - day + 3);
    const weekYear = date.getFullYear();
    const firstThursday = new Date(weekYear, 0, 4);
    const firstDay = (firstThursday.getDay() + 6) % 7;
    firstThursday.setDate(firstThursday.getDate() - firstDay + 3);
    const week = 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000));
    const weekKey = `${weekYear}-W${String(week).padStart(2, '0')}`;
    try {
      const text = localStorage.getItem(`growly-sales-weekly-review-${weekKey}`) ?? '';
      return text.trim().length === 0;
    } catch {
      return false;
    }
  }, []);

  const isWeekend = useMemo(() => {
    const d = new Date().getDay();
    return d === 0 || d === 6;
  }, []);

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

  if (loading) return <p className="loading">ダッシュボードを読み込み中…</p>;
  if (!data) return <p className="hint">ダッシュボードデータを取得できませんでした。</p>;

  const { metrics, outreachSender, mimeVerification, topRecommendedAction, dailyChecklist } =
    data;
  const weeklySummary = data.weeklySummary ?? { thisWeek: EMPTY_WEEKLY, lastWeek: EMPTY_WEEKLY };
  const requestedReportLeadCount = data.requestedReportLeadCount ?? 0;
  const requestedReportLeadsPreview = data.requestedReportLeadsPreview ?? [];
  const todaySalesQueue: SalesQueueItem[] = data.todaySalesQueue ?? [];
  const weekly = weekView === 'thisWeek' ? weeklySummary.thisWeek : weeklySummary.lastWeek;

  return (
    <div className="sales-dashboard-view">
      <InfoBanner variant="info">{DASHBOARD_READONLY_NOTE}</InfoBanner>
      <p className="hint">
        取得時刻: {new Date(data.generatedAt).toLocaleString('ja-JP')}
        {data.leadsPath ? ` / leads: ${data.leadsPath}` : ''}
      </p>

      {topRecommendedAction && (
        <SectionCard title="今日の最優先アクション（1件）" className="dashboard-top-action-card">
          <div className="top-action-body">
            <span className={`action-category action-category-${topRecommendedAction.category}`}>
              {categoryLabel(topRecommendedAction.category)}
            </span>
            <p className="top-action-text">
              <strong>{topRecommendedAction.companyName}</strong> — {topRecommendedAction.action}
            </p>
            {topRecommendedAction.targetTab && onNavigate && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() =>
                  onNavigate(topRecommendedAction.targetTab!, topRecommendedAction.leadId)
                }
              >
                {tabLabel(topRecommendedAction.targetTab)}へ進む
              </button>
            )}
          </div>
        </SectionCard>
      )}

      {onNavigate && (
        <DailyChecklistPanel items={dailyChecklist} onNavigate={(tab) => onNavigate(tab)} />
      )}

      <SectionCard title="運用モード（安全ルール）" className="operation-mode-card">
        <ul className="policy-list compact">
          <li><strong>今日見る場所</strong>: ダッシュボード → 返信管理 → フォローアップ → 候補収集</li>
          <li><strong>人間確認が必要</strong>: Gmail送信（手動） / Gmail下書き作成（CREATE_DRAFTS入力時のみ）</li>
          <li><strong>自動ではやらない</strong>: 自動送信 / Gmail API send / 大量収集 / スクレイピング</li>
          <li><strong>返信管理</strong>: 返信が来た場合のみ replySummary（要約）を記録（本文全文は保存しない）</li>
          <li><strong>秘密情報</strong>: APIキー/refresh token は画面に出しません</li>
        </ul>
      </SectionCard>

      <SectionCard title="今日の営業キュー" className="today-queue-card">
        <p className="hint">上から順に処理してください（自動送信は行いません）。</p>
        <div className="today-queue-list">
          {(todaySalesQueue ?? []).map((q) => (
            <div key={q.category} className={`today-queue-item ${q.count > 0 ? 'today-queue-attn' : ''}`}>
              <div className="today-queue-header">
                <strong>{q.title}</strong>
                <span className="today-queue-count">{q.count}</span>
              </div>
              <p className="hint">{q.description}</p>
              {q.leadPreview.length > 0 && (
                <ul className="policy-list compact">
                  {q.leadPreview.map((l) => (
                    <li key={l.leadId}>{l.companyName}</li>
                  ))}
                </ul>
              )}
              {onNavigate && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => onNavigate(q.targetTab)}
                >
                  {tabLabel(q.targetTab)}へ
                </button>
              )}
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="今週の営業サマリー" className="weekly-summary-card">
        <div className="weekly-summary-header">
          <p className="hint">
            対象: {weekly.weekStart} 〜 {weekly.weekEnd}
          </p>
          <div className="weekly-toggle">
            <button
              type="button"
              className={`btn btn-secondary btn-sm ${weekView === 'thisWeek' ? 'active' : ''}`}
              onClick={() => setWeekView('thisWeek')}
            >
              今週
            </button>
            <button
              type="button"
              className={`btn btn-secondary btn-sm ${weekView === 'lastWeek' ? 'active' : ''}`}
              onClick={() => setWeekView('lastWeek')}
            >
              先週
            </button>
          </div>
        </div>
        <div className="stats-grid">
          <SummaryStatCard value={weekly.sentCount} label="送信数" />
          <SummaryStatCard value={weekly.replyCount} label="返信数" />
          <SummaryStatCard value={weekly.requestedReportCount} label="診断希望数" highlight />
          <SummaryStatCard value={weekly.declinedCount} label="辞退数" />
          <SummaryStatCard value={weekly.bouncedCount} label="バウンス数" />
          <SummaryStatCard value={weekly.newLeadCount} label="新規Lead追加数" />
          <SummaryStatCard value={weekly.gmailDraftCreatedCount} label="Gmail下書き作成数" />
          <SummaryStatCard value={weekly.currentAwaitingReplyCount} label="現在の返信待ち数" />
          <SummaryStatCard value={weekly.currentFollowUpTargetCount} label="現在のフォローアップ対象数" />
        </div>
      </SectionCard>

      {requestedReportLeadCount > 0 && (
        <SectionCard title="診断レポート作成が必要" className="requested-report-card">
          <InfoBanner variant="warning">
            <strong>運用ルール:</strong> requested_report は「診断レポート作成が必要」。dealStatus=none は未対応 / dealStatus=open は対応中。
            診断レポートは自動作成しません。作成完了後は手動で dealStatus=open にしてください。
          </InfoBanner>
          <ul className="policy-list compact">
            {requestedReportLeadsPreview.map((l) => (
              <li key={l.leadId}>
                <strong>{l.companyName}</strong>
              </li>
            ))}
          </ul>
          {onNavigate && (
            <button type="button" className="btn btn-primary" onClick={() => onNavigate('reply-management')}>
              返信管理へ（診断希望を確認）
            </button>
          )}
        </SectionCard>
      )}

      <SectionCard title="営業フロー概要" className="dashboard-metrics-card">
        <div className="stats-grid dashboard-metrics-grid">
          <SummaryStatCard value={metrics.initialEmailSentCount} label="初回メール送信済み" highlight />
          <SummaryStatCard value={metrics.pendingGmailSendRecordCount} label="送信記録待ち" />
          <SummaryStatCard value={metrics.gmailDraftCandidateCount} label="下書き候補（タブ）" />
          <SummaryStatCard value={metrics.awaitingReplyCount} label="返信待ち" />
          <SummaryStatCard value={metrics.followUpTargetCount} label="フォローアップ対象" />
        </div>
        <p className="stats-hint">
          全Lead {metrics.totalLeads}件 / 作成可能 {metrics.gmailDraftReadyCount}件 / 手動送信記録{' '}
          {metrics.manualSentCount}件
        </p>
      </SectionCard>

      <div className="dashboard-two-col">
        <SectionCard title="送信元設定状態" className="dashboard-config-card">
          <dl className="config-dl">
            <div className="config-row">
              <dt>From</dt>
              <dd>
                {outreachSender.fromDisplayName} &lt;{outreachSender.fromEmail}&gt;
              </dd>
            </div>
            <div className="config-row">
              <dt>Reply-To</dt>
              <dd>{outreachSender.replyToEmail}</dd>
            </div>
            <div className="config-row">
              <dt>署名Email</dt>
              <dd>{outreachSender.signatureEmail}</dd>
            </div>
          </dl>
          <p className="hint">標準送信元: c_hiratsuka@wantreach.jp（秘密情報は表示しません）</p>
        </SectionCard>

        <SectionCard title="MIME検証状態" className="dashboard-mime-card">
          <InfoBanner variant="success">
            {mimeVerification.label} — {mimeVerification.summary}
          </InfoBanner>
          <ul className="mime-check-list">
            {mimeVerification.checks.map((check) => (
              <li key={check.id} className={check.ok ? 'mime-ok' : 'mime-ng'}>
                {check.ok ? '✓' : '✗'} {check.label}
              </li>
            ))}
          </ul>
          <p className="hint">{mimeVerification.note}</p>
        </SectionCard>
      </div>

      <DailyOperationsLogPanel />
      {(weeklyMemoMissing || isWeekend) && (
        <InfoBanner variant="warn">
          週次レビュー用メモが未記入の可能性があります（localStorage 判定）。週末は週次レビューの記入をおすすめします。
        </InfoBanner>
      )}
      <WeeklyReviewMemoPanel />

      <SectionCard title="運用ルール（固定）" className="operation-rules-card">
        <ul className="policy-list">
          <li>自動送信しない</li>
          <li>Gmail送信は必ず人間がGmail画面で確認してから行う</li>
          <li>Growly Salesは送信後の記録・返信管理・次アクション整理を担当</li>
          <li>Gmail下書き作成は CREATE_DRAFTS ゲート付き</li>
          <li>From / Reply-To / 署名Email は c_hiratsuka@wantreach.jp</li>
          <li>返信本文全文は保存せず replySummary のみ保存</li>
          <li>送信済み履歴は上書きしない</li>
          <li>診断レポートは自動作成しない</li>
          <li>localStorage の確認済みチェックや週次メモは営業履歴として扱わない</li>
        </ul>
      </SectionCard>
    </div>
  );
}

function categoryLabel(category: string): string {
  switch (category) {
    case 'gmail_draft':
      return '下書き';
    case 'send_record':
      return '送信記録';
    case 'reply_check':
      return '返信確認';
    case 'follow_up':
      return 'フォロー';
    case 'requested_report':
      return '診断希望';
    case 'weekly_review':
      return '週次';
    case 'approval':
      return '承認';
    case 'candidate_collection':
      return '候補収集';
    default:
      return '一般';
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
    case 'weekly-review':
      return '週次レビュー';
    case 'leads':
      return 'Lead一覧';
    default:
      return 'ダッシュボード';
  }
}
