import type { Daily30DashboardResponse } from './daily30Api.js';
import { Daily30CollectionSchedulePanel } from './Daily30CollectionSchedulePanel.js';
import { Daily30RunCollectionProfileSummary } from './Daily30RunCollectionProfileSummary.js';
import { InfoBanner } from './InfoBanner.js';
import { cloudRunStatusLabel } from './daily30StatusLabels.js';
import { pipelineCountChips } from './Daily30CandidateCards.js';
import { Daily30ExternalReferenceSupplementBanner } from './Daily30ExternalReferenceSupplementBanner.js';

interface CandidateCollectionDetailsPanelProps {
  daily30: Daily30DashboardResponse | null;
  daily30Loading: boolean;
  showScheduleEditor: boolean;
  onError: (message: string) => void;
  onSuccess?: (message: string) => void;
  refreshKey?: number;
}

function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
  } catch {
    return iso;
  }
}

function bannerVariant(status: string): 'success' | 'warning' | 'danger' | 'info' {
  if (status === 'success') return 'success';
  if (status === 'partial_success') return 'warning';
  if (status === 'failed') return 'danger';
  if (status === 'blocked') return 'warning';
  return 'info';
}

function countByPipeline(candidates: ExternalLeadCandidate[]): Record<string, number> {
  const m: Record<string, number> = {};
  for (const c of candidates) {
    const k = c.pipelineStatus || 'unknown';
    m[k] = (m[k] ?? 0) + 1;
  }
  return m;
}

export function CandidateCollectionDetailsPanel({
  daily30,
  daily30Loading,
  showScheduleEditor,
  onError,
  onSuccess,
  refreshKey = 0,
}: CandidateCollectionDetailsPanelProps) {
  if (daily30Loading) {
    return <p className="hint candidate-details-loading">詳細を読み込み中…</p>;
  }
  if (!daily30 || daily30.ok === false) {
    return <p className="hint candidate-details-loading">収集結果を読み込めません。</p>;
  }

  const d = daily30.dashboard;
  const target = d.targetEmailFound ?? daily30.targetEmailFound ?? 30;
  const emailSalesCount = d.emailFoundAtCollection ?? daily30.emailFound ?? 0;
  const totalCollected = d.totalCollectedAtCollection ?? daily30.totalCollected ?? 0;
  const formOnly = d.formOnlyAtCollection ?? daily30.formOnly ?? 0;
  const noContact = d.noEmailAtCollection ?? daily30.noEmail ?? 0;
  const humanExcludedCount = daily30.humanExcludedCount ?? d.humanExcludedCount ?? 0;
  const excludedCandidates = daily30.humanExcludedCandidates ?? [];
  const isGcs = daily30.storageBackend === 'gcs';
  const pipelineCounts = countByPipeline(daily30.candidates ?? []);

  return (
    <div className="candidate-collection-details-panel">
      <section className="candidate-details-section" aria-label="今日の収集内訳">
        <h3 className="candidate-details-section-title">今日の収集内訳</h3>
        <dl className="candidate-details-breakdown">
          <div>
            <dt>全収集</dt>
            <dd>{totalCollected}件</dd>
          </div>
          <div>
            <dt>メール営業候補</dt>
            <dd>
              {emailSalesCount} / {target}件
            </dd>
          </div>
          <div>
            <dt>問い合わせフォームのみ</dt>
            <dd>{formOnly}件</dd>
          </div>
          <div>
            <dt>メール・フォームなし</dt>
            <dd>{noContact}件</dd>
          </div>
        </dl>
        <p className="hint candidate-details-breakdown-note">
          メール営業候補は代表メールあり・フォームのみ/導線なし/除外済みを除く件数です。内訳の合計は重複カウントしません。
        </p>
      </section>

      <section className="candidate-details-section" aria-label="除外済み候補">
        <h3 className="candidate-details-section-title">除外済み候補</h3>
        {humanExcludedCount > 0 ? (
          <>
            <p className="hint">{humanExcludedCount}件</p>
            {excludedCandidates.length > 0 ? (
              <ul className="hint-list daily30-excluded-dev-list">
                {excludedCandidates.map((c) => (
                  <li key={c.externalCandidateId}>
                    {c.companyName} — {c.excludedReason ?? '理由未記録'}（{c.excludedAt ?? '—'}）
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        ) : (
          <p className="hint">除外済み候補はありません。</p>
        )}
      </section>

      <section className="candidate-details-section" aria-label="収集条件・実行情報">
        <h3 className="candidate-details-section-title">収集条件・実行情報</h3>
        <InfoBanner variant={bannerVariant(daily30.status)}>
          <span className="daily30-run-banner">
            <strong>{cloudRunStatusLabel(daily30.status)}</strong>
            {isGcs ? (
              <>
                {' · '}
                メール営業候補 <strong>{emailSalesCount}件</strong> / {target}
                {' · '}
                全収集 <strong>{totalCollected}件</strong>
              </>
            ) : (
              <> · ローカル保存</>
            )}
            {' · '}
            次回 {daily30.nextScheduledRun}
          </span>
        </InfoBanner>

        <Daily30RunCollectionProfileSummary
          title="今回使用した収集設定"
          runContext={daily30.lastRunResolvedContext ?? daily30.resolvedForToday}
          areasUsed={daily30.lastRunAreasUsed}
          scheduleSourceLabel={daily30.lastRunScheduleSource ?? undefined}
        />
        {daily30.lastRunScheduleWarning ? (
          <p className="hint warning-text daily30-run-profile-warning-banner">{daily30.lastRunScheduleWarning}</p>
        ) : null}

        <Daily30ExternalReferenceSupplementBanner summary={daily30} />

        <div className="hint daily30-pipeline-summary">
          パイプライン内訳: {pipelineCountChips(pipelineCounts) ?? '—'}
        </div>

        <dl className="daily30-run-meta candidate-details-run-meta">
          <div>
            <dt>batchId</dt>
            <dd>{daily30.batchId}</dd>
          </div>
          <div>
            <dt>mode</dt>
            <dd>{daily30.mode}</dd>
          </div>
          <div>
            <dt>最終実行</dt>
            <dd>{formatTimestamp(daily30.finishedAt)}</dd>
          </div>
          {daily30.durationMs != null ? (
            <div>
              <dt>所要時間</dt>
              <dd>{Math.round(daily30.durationMs / 1000)}秒</dd>
            </div>
          ) : null}
          <div>
            <dt>Scheduler</dt>
            <dd>{daily30.schedulerConfigured ? '設定済み' : '未設定'}</dd>
          </div>
        </dl>
      </section>

      {showScheduleEditor ? (
        <section className="candidate-details-section" aria-label="明日の収集設定">
          <h3 className="candidate-details-section-title">明日の収集設定</h3>
          <Daily30CollectionSchedulePanel
            onError={onError}
            onSuccess={onSuccess}
            refreshKey={refreshKey}
          />
        </section>
      ) : null}
    </div>
  );
}
