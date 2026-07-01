import { useCallback, useEffect, useState } from 'react';
import { SectionCard } from './SectionCard.js';
import { InfoBanner } from './InfoBanner.js';
import { SummaryStatCard } from './SummaryStatCard.js';
import {
  FETCH_DAILY_30_GATE_LABEL,
  fetchDaily30Dashboard,
  runDaily30Fetch,
  type Daily30DashboardResponse,
} from './daily30Api.js';
import { isDevApiErrorMessage } from './displayLabels.js';

interface Daily30DashboardPanelProps {
  onError: (message: string) => void;
  refreshKey?: number;
  onFetched?: () => void;
}

export function Daily30DashboardPanel({
  onError,
  refreshKey = 0,
  onFetched,
}: Daily30DashboardPanelProps) {
  const [data, setData] = useState<Daily30DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [gateInput, setGateInput] = useState('');
  const [fetching, setFetching] = useState(false);
  const [fetchMessage, setFetchMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchDaily30Dashboard();
      setData(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Daily 30 ダッシュボードの読み込みに失敗しました';
      if (!isDevApiErrorMessage(message)) onError(message);
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  async function handleFetch(): Promise<void> {
    if (gateInput.trim() !== FETCH_DAILY_30_GATE_LABEL) return;
    setFetching(true);
    setFetchMessage(null);
    try {
      const result = await runDaily30Fetch(gateInput.trim());
      setFetchMessage(result.message);
      setGateInput('');
      onFetched?.();
      await load();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Daily 30 収集に失敗しました');
    } finally {
      setFetching(false);
    }
  }

  if (loading) return <p className="loading">Daily 30 ダッシュボードを読み込み中…</p>;
  if (!data) return <p className="hint">Daily 30 データを取得できませんでした。</p>;

  const { dashboard, areaExpansion, draftPipeline } = data;
  const gateOk = gateInput.trim() === FETCH_DAILY_30_GATE_LABEL;

  return (
    <SectionCard title="Daily 30 候補収集" className="daily30-dashboard-card">
      <InfoBanner variant="info">
        毎日30件の営業候補を収集します。自動送信は<strong>行いません</strong>。
        Gmail下書き作成は下書き候補タブで <code>CREATE_DRAFTS</code> 入力時のみ実行します。
      </InfoBanner>

      <p className="hint">バッチ: {dashboard.batchId} / エリア拡大順: {areaExpansion}</p>

      <ol className="workflow-steps workflow-steps-numbered daily30-pipeline-steps">
        <li><strong>Daily 30収集</strong></li>
        <li><strong>Lead化承認</strong></li>
        <li><strong>営業文生成</strong></li>
        <li><strong>品質チェック</strong></li>
        <li><strong>下書き候補へ送る</strong>（取り込み → ready_for_draft）</li>
        <li><strong>Gmail下書き作成</strong>（CREATE_DRAFTS）</li>
      </ol>

      {draftPipeline && (
        <div className="stats-grid daily30-draft-pipeline-stats">
          <SummaryStatCard value={draftPipeline.leadsImportPendingCount} label="取り込み待ち" highlight />
          <SummaryStatCard value={draftPipeline.gmailDraftTabVisibleCount} label="下書き候補タブ" />
          <SummaryStatCard value={draftPipeline.humanReviewPendingCount} label="承認待ち" />
          <SummaryStatCard value={draftPipeline.gmailDraftCreatedCount} label="下書き作成済" />
          <SummaryStatCard value={draftPipeline.sendRecordPendingCount} label="送信記録待ち" />
        </div>
      )}
      {draftPipeline && <p className="hint">{draftPipeline.todayProgressLabel}</p>}

      <div className="stats-grid">
        <SummaryStatCard value={dashboard.targetEmailFound} label="メール取得目標" highlight />
        <SummaryStatCard value={dashboard.emailFoundCount} label="メール取得済み" highlight />
        <SummaryStatCard value={dashboard.totalCollected} label="総収集候補" />
        <SummaryStatCard value={dashboard.formOnlyCount} label="フォームのみ" />
        <SummaryStatCard value={dashboard.noEmailCount} label="導線なし" />
        <SummaryStatCard value={dashboard.leadApprovalPendingCount} label="Lead化承認待ち" highlight />
        <SummaryStatCard value={dashboard.copyGeneratedCount} label="営業文生成済み" />
        <SummaryStatCard value={dashboard.qualityCheckPassedCount} label="品質チェック通過" />
        <SummaryStatCard value={dashboard.readyForDraftCount} label="ready_for_draft" highlight />
        <SummaryStatCard value={dashboard.needsReviewCount} label="needs_review" />
        <SummaryStatCard value={dashboard.excludedCount} label="excluded" />
        <SummaryStatCard value={dashboard.emailShortfall} label="メール不足" />
        <SummaryStatCard value={dashboard.miyagiCount} label="宮城で収集" />
        <SummaryStatCard value={dashboard.fukushimaCount} label="福島で収集" />
        <SummaryStatCard value={dashboard.northKantoCount} label="北関東で収集" />
        <SummaryStatCard value={dashboard.withEmailCount} label="メールあり" />
        <SummaryStatCard value={dashboard.withoutEmailCount} label="メールなし" />
        <SummaryStatCard value={dashboard.duplicateExcludedCount} label="重複除外" />
      </div>

      <InfoBanner variant={dashboard.emailShortfall > 0 ? 'warning' : 'success'}>
        <strong>次に探索するエリア:</strong> {dashboard.nextExploreArea}
        <br />
        <strong>次にやること:</strong> {dashboard.nextAction}
      </InfoBanner>

      <p className="hint">{dashboard.safetyNote}</p>

      <div className="daily30-fetch-gate">
        <label className="hint">
          収集実行（外部API + メール確認）— 確認のため <code>{FETCH_DAILY_30_GATE_LABEL}</code> と入力
        </label>
        <div className="daily30-fetch-row">
          <input
            className="input"
            value={gateInput}
            onChange={(e) => setGateInput(e.target.value)}
            placeholder={FETCH_DAILY_30_GATE_LABEL}
            disabled={fetching || !dashboard.fetchConfigured}
          />
          <button
            type="button"
            className="btn btn-primary"
            disabled={!gateOk || fetching || !dashboard.fetchConfigured}
            onClick={() => void handleFetch()}
          >
            {fetching ? '収集中…' : 'Daily 30 収集を実行'}
          </button>
        </div>
        {!dashboard.fetchConfigured && (
          <p className="hint warning-text">
            外部API未設定のため UI からは実行できません。プレビュー: npm run growly-sales:daily30-preview
          </p>
        )}
        {fetchMessage && <p className="hint success-text">{fetchMessage}</p>}
      </div>
    </SectionCard>
  );
}
