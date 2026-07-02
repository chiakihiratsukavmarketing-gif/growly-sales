import { useCallback, useEffect, useState } from 'react';
import type { ExternalLeadCandidate } from '../adapters/externalLeadCandidateTypes.js';
import { SectionCard } from './SectionCard.js';
import { InfoBanner } from './InfoBanner.js';
import { approveExternalCandidateForLead, excludeDaily30CandidateApi } from './daily30CopyApi.js';
import { confirmDaily30LeadApproval } from './confirmDaily30LeadApproval.js';
import { confirmDaily30CandidateExclude } from './confirmDaily30CandidateExclude.js';
import { fetchDaily30Dashboard, type Daily30DashboardResponse } from './daily30Api.js';
import { EmptyState } from './common/EmptyState.js';
import { DevDetails } from './common/DevDetails.js';
import { Daily30RunCollectionProfileSummary } from './Daily30RunCollectionProfileSummary.js';
import { isDevApiErrorMessage } from './displayLabels.js';
import { cloudRunStatusLabel } from './daily30StatusLabels.js';
import {
  Daily30CandidateList,
  pipelineCountChips,
} from './Daily30CandidateCards.js';
import { Daily30ExternalReferenceSupplementBanner } from './Daily30ExternalReferenceSupplementBanner.js';
import { filterDaily30UiListCandidates } from './daily30ExcludeUi.js';

interface Daily30CloudResultsPanelProps {
  onError: (message: string) => void;
  onSuccess?: (message: string) => void;
  refreshKey?: number;
  onChanged?: () => void;
  sessionExcludedIds?: ReadonlySet<string>;
  onMarkExcluded?: (candidateId: string) => void;
}

function formatTimestamp(iso: string | null): string {
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

export function Daily30CloudResultsPanel({
  onError,
  onSuccess,
  refreshKey = 0,
  onChanged,
  sessionExcludedIds,
  onMarkExcluded,
}: Daily30CloudResultsPanelProps) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Daily30DashboardResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [excludingId, setExcludingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const result = await fetchDaily30Dashboard();
      setData(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Cloud Daily 30 結果の読み込みに失敗しました';
      setLoadError(message);
      setData(null);
      if (!isDevApiErrorMessage(message)) {
        onError(message);
      }
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  async function handleApprove(candidate: ExternalLeadCandidate): Promise<void> {
    if (!confirmDaily30LeadApproval(candidate)) return;
    setApprovingId(candidate.externalCandidateId);
    try {
      await approveExternalCandidateForLead(candidate.externalCandidateId);
      onSuccess?.(`${candidate.companyName} を Lead化承認しました。セクション2で営業文生成へ。`);
      onChanged?.();
      await load();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Lead化承認に失敗しました');
    } finally {
      setApprovingId(null);
    }
  }

  async function handleExclude(candidate: ExternalLeadCandidate): Promise<void> {
    const reason = confirmDaily30CandidateExclude(candidate);
    if (!reason) return;
    const candidateId = candidate.externalCandidateId;
    setExcludingId(candidateId);
    onMarkExcluded?.(candidateId);
    setData((prev) => {
      if (!prev) return prev;
      const filterOut = (list: ExternalLeadCandidate[] | undefined) =>
        filterDaily30UiListCandidates(list ?? [], sessionExcludedIds).filter(
          (c) => c.externalCandidateId !== candidateId
        );
      return {
        ...prev,
        emailFoundCandidates: filterOut(prev.emailFoundCandidates),
        candidates: filterOut(prev.candidates),
        humanExcludedCount: (prev.humanExcludedCount ?? 0) + 1,
      };
    });
    try {
      const result = await excludeDaily30CandidateApi(candidateId, reason, candidate);
      if (!result.ok || !result.persisted) {
        throw new Error('候補の除外状態を保存できませんでした');
      }
      onMarkExcluded?.(result.candidateId);
      onSuccess?.(`${candidate.companyName} を候補から除外しました`);
      await load();
      onChanged?.();
    } catch (err) {
      onError(err instanceof Error ? err.message : '候補の除外に失敗しました');
      await load();
    } finally {
      setExcludingId(null);
    }
  }

  if (loading) return <p className="loading">収集結果を読み込み中…</p>;

  if (!data || data.ok === false) {
    const gcsError = data?.gcsReadError ?? loadError;
    const authLines = data?.gcsAuthSummary ?? [];
    return (
      <div className="daily30-cloud-unavailable">
        <EmptyState
          title="収集結果を読み込めませんでした"
          reason="Cloud Storage に接続できないため、今日の収集結果は表示できません。"
          nextHint="既存Leadで営業を続けられます。認証後に再読み込みしてください。"
        />
        {(gcsError || authLines.length > 0) && (
          <DevDetails title="開発者向け詳細（Cloud接続）">
            {gcsError ? <p className="hint">{gcsError}</p> : null}
            {authLines.length > 0 ? (
              <ul className="hint-list">
                {authLines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : null}
            <p className="hint">
              必要な権限: storage.objects.get / storage.objects.list（例: roles/storage.objectViewer）
            </p>
          </DevDetails>
        )}
      </div>
    );
  }

  const isGcs = data.storageBackend === 'gcs';
  const emailFound = filterDaily30UiListCandidates(
    data.emailFoundCandidates ?? [],
    sessionExcludedIds
  );
  const allCandidates = filterDaily30UiListCandidates(data.candidates ?? [], sessionExcludedIds);
  const pipelineCounts = countByPipeline(allCandidates);
  const approvalBlockHints = data.approvalBlockHints ?? {};
  const humanExcludedCount = data.humanExcludedCount ?? 0;

  return (
    <SectionCard title="今日の収集結果" className="daily30-cloud-results-card">
      <InfoBanner variant={bannerVariant(data.status)}>
        <span className="daily30-run-banner">
          <strong>{cloudRunStatusLabel(data.status)}</strong>
          {isGcs ? (
            <>
              {' · '}
              メール取得済（収集時） <strong>{data.emailFound}件</strong> / {data.targetEmailFound ?? 30}
              {' · '}
              総収集 <strong>{data.totalCollected ?? data.collected}件</strong>
            </>
          ) : (
            <>
              {' · '}
              ローカル保存
            </>
          )}
          {' · '}
          次回 {data.nextScheduledRun}
        </span>
      </InfoBanner>

      <Daily30RunCollectionProfileSummary
        title="今回使用した収集設定"
        runContext={data.lastRunResolvedContext ?? data.resolvedForToday}
        areasUsed={data.lastRunAreasUsed}
        scheduleSourceLabel={data.lastRunScheduleSource ?? undefined}
      />
      {data.lastRunScheduleWarning ? (
        <p className="hint warning-text daily30-run-profile-warning-banner">{data.lastRunScheduleWarning}</p>
      ) : null}

      <Daily30ExternalReferenceSupplementBanner summary={data} />

      <DevDetails title="実行メタデータ（開発者向け）">
        <dl className="daily30-run-meta">
          <div>
            <dt>collectionProfile</dt>
            <dd>{data.lastRunCollectionProfileName ?? '—'}</dd>
          </div>
          <div>
            <dt>schedule source</dt>
            <dd>{data.lastRunScheduleSource ?? '—'}</dd>
          </div>
          <div>
            <dt>areas used</dt>
            <dd>{data.lastRunAreasUsed?.length ? data.lastRunAreasUsed.join(', ') : '—'}</dd>
          </div>
          <div>
            <dt>batchId</dt>
            <dd>{data.batchId}</dd>
          </div>
          <div>
            <dt>mode</dt>
            <dd>{data.mode}</dd>
          </div>
          <div>
            <dt>収集時メール取得</dt>
            <dd>
              {data.emailFound} / {data.targetEmailFound ?? 30}
            </dd>
          </div>
          <div>
            <dt>総収集候補</dt>
            <dd>{data.totalCollected ?? data.collected}</dd>
          </div>
          <div>
            <dt>フォームのみ</dt>
            <dd>{data.formOnly ?? 0}</dd>
          </div>
          <div>
            <dt>導線なし</dt>
            <dd>{data.noEmail ?? 0}</dd>
          </div>
          <div>
            <dt>stoppedReason</dt>
            <dd>{data.stoppedReason ?? '—'}</dd>
          </div>
          <div>
            <dt>duplicates</dt>
            <dd>{data.duplicates}</dd>
          </div>
          <div>
            <dt>excluded</dt>
            <dd>{data.excluded}</dd>
          </div>
          <div>
            <dt>humanExcluded</dt>
            <dd>{humanExcludedCount}</dd>
          </div>
          <div>
            <dt>最終実行</dt>
            <dd>{formatTimestamp(data.finishedAt)}</dd>
          </div>
          {data.durationMs != null ? (
            <div>
              <dt>所要時間</dt>
              <dd>{Math.round(data.durationMs / 1000)}秒</dd>
            </div>
          ) : null}
          <div>
            <dt>Scheduler</dt>
            <dd>{data.schedulerConfigured ? '設定済み' : '未設定'}</dd>
          </div>
          {data.errorCode ? (
            <div className="daily30-run-meta-error">
              <dt>errorCode</dt>
              <dd>
                <code>{data.errorCode}</code>
              </dd>
            </div>
          ) : null}
          {data.recoveryHint ? (
            <div className="daily30-run-meta-error daily30-run-meta-wide">
              <dt>recoveryHint</dt>
              <dd>{data.recoveryHint}</dd>
            </div>
          ) : null}
        </dl>
      </DevDetails>

      <section className="daily30-candidate-section daily30-candidate-section-priority">
        <header className="daily30-section-header">
          <h3 className="daily30-section-title">
            メール取得済候補
            <span className="daily30-section-count">{emailFound.length}件</span>
          </h3>
          <p className="hint daily30-section-hint">確認後に Lead化承認（leads.json 未取り込み）</p>
        </header>
        <Daily30CandidateList
          candidates={emailFound}
          showApprove
          approvingId={approvingId}
          excludingId={excludingId}
          onApprove={(c) => void handleApprove(c)}
          onExclude={(c) => void handleExclude(c)}
          approvalBlockHints={approvalBlockHints}
          emptyMessage="メール取得済候補はありません。"
        />
      </section>

      {humanExcludedCount > 0 ? (
        <p className="hint daily30-excluded-hint">除外済み {humanExcludedCount}件（通常一覧には表示しません）</p>
      ) : null}

      {(data.humanExcludedCandidates?.length ?? 0) > 0 ? (
        <DevDetails title={`除外済み候補（${data.humanExcludedCandidates!.length}件）`}>
          <ul className="hint-list daily30-excluded-dev-list">
            {data.humanExcludedCandidates!.map((c) => (
              <li key={c.externalCandidateId}>
                {c.companyName} — {c.excludedReason ?? '理由未記録'}（{c.excludedAt ?? '—'}）
              </li>
            ))}
          </ul>
        </DevDetails>
      ) : null}

      <section className="daily30-candidate-section">
        <header className="daily30-section-header">
          <h3 className="daily30-section-title">
            全候補
            <span className="daily30-section-count">{allCandidates.length}件</span>
          </h3>
          {pipelineCountChips(pipelineCounts)}
        </header>
        <Daily30CandidateList
          candidates={allCandidates}
          emptyMessage="候補がありません。"
        />
      </section>
    </SectionCard>
  );
}
