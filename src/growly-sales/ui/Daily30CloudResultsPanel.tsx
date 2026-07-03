import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ExternalLeadCandidate } from '../adapters/externalLeadCandidateTypes.js';
import { approveExternalCandidateForLead, excludeDaily30CandidateApi } from './daily30CopyApi.js';
import { confirmDaily30LeadApproval } from './confirmDaily30LeadApproval.js';
import { confirmDaily30CandidateExclude } from './confirmDaily30CandidateExclude.js';
import { fetchDaily30Dashboard, type Daily30DashboardResponse } from './daily30Api.js';
import { EmptyState } from './common/EmptyState.js';
import { DevDetails } from './common/DevDetails.js';
import { Daily30RunCollectionProfileSummary } from './Daily30RunCollectionProfileSummary.js';
import { InfoBanner } from './InfoBanner.js';
import { isDevApiErrorMessage } from './displayLabels.js';
import { cloudRunStatusLabel } from './daily30StatusLabels.js';
import {
  Daily30CandidateList,
  Daily30CandidateQueueHeader,
  pipelineCountChips,
  workQueueTitleForFilter,
} from './Daily30CandidateCards.js';
import { Daily30ExternalReferenceSupplementBanner } from './Daily30ExternalReferenceSupplementBanner.js';
import { filterDaily30UiListCandidates } from './daily30ExcludeUi.js';
import { filterByCompanyName } from './leadFilterUtils.js';
import { CandidateDisplayModeToggle } from './CandidateDisplayModeToggle.js';
import { Daily30CandidateFocusView } from './Daily30CandidateFocusView.js';
import {
  DISPLAY_MODE_STORAGE_KEY_RESULTS,
  loadStoredDisplayMode,
  saveStoredDisplayMode,
  sortCandidatesForListMode,
  type CandidateDisplayMode,
} from './daily30CandidateFocusMode.js';
import { useCandidateFocusQueue } from './useCandidateFocusQueue.js';

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

function collectPrefectureOptions(candidates: ExternalLeadCandidate[]): string[] {
  const s = new Set<string>();
  for (const c of candidates) {
    const p = c.prefecture?.trim();
    if (p) s.add(p);
  }
  return [...s].sort((a, b) => a.localeCompare(b, 'ja'));
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
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<
    'all' | 'actionable' | 'approvable' | 'not_approvable' | 'email_ok' | 'email_missing'
  >('actionable');
  const [prefecture, setPrefecture] = useState('all');
  const [source, setSource] = useState('all');
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [displayMode, setDisplayMode] = useState<CandidateDisplayMode>(() =>
    loadStoredDisplayMode(DISPLAY_MODE_STORAGE_KEY_RESULTS, 'focus')
  );

  const setDisplayModePersisted = useCallback((mode: CandidateDisplayMode) => {
    setDisplayMode(mode);
    saveStoredDisplayMode(DISPLAY_MODE_STORAGE_KEY_RESULTS, mode);
  }, []);

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

  useEffect(() => {
    setPage(1);
  }, [query, filter, prefecture, source, pageSize]);

  const approvalBlockHintsEarly = data?.approvalBlockHints ?? {};

  const allCandidates = useMemo(
    () =>
      data?.ok !== false
        ? filterDaily30UiListCandidates(data?.candidates ?? [], sessionExcludedIds)
        : [],
    [data, sessionExcludedIds]
  );

  const approvalBlockHints = approvalBlockHintsEarly;

  const filteredCandidates = useMemo(() => {
    let list = allCandidates;
    list = filterByCompanyName(list, query, (c) => c.companyName ?? '');
    if (prefecture !== 'all') {
      list = list.filter((c) => (c.prefecture ?? '').trim() === prefecture);
    }
    if (source !== 'all') {
      list = list.filter((c) => (c.discoverySourceLabel ?? c.discoverySource ?? '') === source);
    }
    if (filter !== 'all') {
      list = list.filter((c) => {
        const hint = approvalBlockHints[c.externalCandidateId];
        const email = c.emailCandidates?.[0] ?? c.targetEmail ?? '';
        const hasEmail = Boolean(email);
        const blocked = Boolean(hint?.blockReason);
        const alreadyApproved = c.importStatus === 'approved_for_lead';
        const approvable = hasEmail && !blocked && !alreadyApproved;
        const actionable = c.pipelineStatus === 'email_found' && !alreadyApproved;
        switch (filter) {
          case 'actionable':
            return actionable;
          case 'approvable':
            return approvable;
          case 'not_approvable':
            return !approvable;
          case 'email_ok':
            return hasEmail;
          case 'email_missing':
            return !hasEmail;
          default:
            return true;
        }
      });
    }
    return sortCandidatesForListMode(list, approvalBlockHints);
  }, [allCandidates, approvalBlockHints, filter, prefecture, query, source]);

  const focusFilterKey = `${query}|${filter}|${prefecture}|${source}`;
  const focusQueueState = useCandidateFocusQueue(
    filteredCandidates,
    approvalBlockHints,
    focusFilterKey
  );

  const pageCount = Math.max(1, Math.ceil(filteredCandidates.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const start = (safePage - 1) * pageSize;
  const end = Math.min(filteredCandidates.length, start + pageSize);
  const pageItems = filteredCandidates.slice(start, end);

  const prefectureOptions = useMemo(
    () => collectPrefectureOptions(allCandidates),
    [allCandidates]
  );

  const sourceOptions = useMemo(() => {
    const s = new Set<string>();
    for (const c of allCandidates) {
      const label = c.discoverySourceLabel ?? c.discoverySource ?? '';
      if (label) s.add(label);
    }
    return [...s].sort((a, b) => a.localeCompare(b, 'ja'));
  }, [allCandidates]);

  const operationBusy = approvingId !== null || excludingId !== null;

  async function handleApprove(candidate: ExternalLeadCandidate): Promise<void> {
    if (!confirmDaily30LeadApproval(candidate)) return;
    setApprovingId(candidate.externalCandidateId);
    try {
      await approveExternalCandidateForLead(candidate.externalCandidateId);
      focusQueueState.recordProcessed();
      onSuccess?.(`${candidate.companyName} を Lead化承認しました。Lead化・営業文タブで営業文生成へ。`);
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
      focusQueueState.recordProcessed();
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
  const pipelineCounts = countByPipeline(allCandidates);
  const humanExcludedCount = data.humanExcludedCount ?? 0;
  const queueTitle = workQueueTitleForFilter(filter);

  return (
    <div className="daily30-cloud-results-card daily30-work-queue-panel">
      <section className="daily30-work-queue" aria-label="候補作業キュー">
        <header className="daily30-work-queue-header">
          <div className="daily30-work-queue-header-row">
            <h3 className="daily30-work-queue-title">
              {queueTitle}
              <span className="daily30-section-count">{filteredCandidates.length}件</span>
            </h3>
            <CandidateDisplayModeToggle
              mode={displayMode}
              onChange={setDisplayModePersisted}
              disabled={operationBusy}
            />
          </div>
          <p className="hint daily30-work-queue-hint">
            承認可能な候補を先頭に表示しています。Lead化承認後は「Lead化・営業文」タブへ。
          </p>
        </header>

        <div className="daily30-candidate-tools">
          <div className="daily30-candidate-tools-row">
            <input
              className="input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="会社名で検索"
              aria-label="会社名で検索"
            />
            <select className="input" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
              <option value="actionable">作業可能（推奨）</option>
              <option value="all">すべて</option>
              <option value="approvable">承認可能</option>
              <option value="not_approvable">承認不可</option>
              <option value="email_ok">メール確認済み</option>
              <option value="email_missing">メール未確認</option>
            </select>
            <select className="input" value={prefecture} onChange={(e) => setPrefecture(e.target.value)}>
              <option value="all">都道府県: すべて</option>
              {prefectureOptions.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <select className="input" value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="all">収集元: すべて</option>
              {sourceOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="daily30-candidate-tools-row daily30-candidate-tools-row-secondary">
            {displayMode === 'list' ? (
              <>
                <div className="hint">
                  {filteredCandidates.length === 0 ? '0件' : `${start + 1}–${end}`} / {filteredCandidates.length}件
                </div>
                <div className="daily30-pager">
                  <label className="hint">
                    表示件数{' '}
                    <select className="input input-xs" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
                      <option value={10}>10</option>
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                    </select>
                  </label>
                  <button type="button" className="btn btn-secondary btn-sm" disabled={safePage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                    前へ
                  </button>
                  <span className="hint">{safePage} / {pageCount}</span>
                  <button type="button" className="btn btn-secondary btn-sm" disabled={safePage >= pageCount} onClick={() => setPage((p) => Math.min(pageCount, p + 1))}>
                    次へ
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>

        {displayMode === 'focus' ? (
          <Daily30CandidateFocusView
            variant="results"
            title={queueTitle}
            candidate={focusQueueState.currentCandidate}
            approvalBlockHints={approvalBlockHints}
            remainingCount={focusQueueState.remainingCount}
            processedCount={focusQueueState.processedCount}
            focusIndex={focusQueueState.safeIndex}
            canGoPrev={focusQueueState.canGoPrev}
            canGoNext={focusQueueState.canGoNext}
            allDeferred={focusQueueState.allDeferred}
            busy={operationBusy}
            approving={approvingId === focusQueueState.currentCandidate?.externalCandidateId}
            excluding={excludingId === focusQueueState.currentCandidate?.externalCandidateId}
            showApprove
            showExclude
            showDefer
            primaryAction="approve"
            onApprove={() => {
              const c = focusQueueState.currentCandidate;
              if (c) void handleApprove(c);
            }}
            onExclude={() => {
              const c = focusQueueState.currentCandidate;
              if (c) void handleExclude(c);
            }}
            onDefer={focusQueueState.deferCurrent}
            onClearDeferred={focusQueueState.clearDeferred}
            onPrev={focusQueueState.goPrev}
            onNext={focusQueueState.goNext}
            onShowAll={() => setFilter('all')}
            onShowNotApprovable={() => setFilter('not_approvable')}
            emptyMessage="作業可能な候補はありません。"
          />
        ) : (
          <>
            <Daily30CandidateQueueHeader showActions />
            <Daily30CandidateList
              candidates={pageItems}
              showApprove
              layout="queue"
              approvingId={approvingId}
              excludingId={excludingId}
              onApprove={(c) => void handleApprove(c)}
              onExclude={(c) => void handleExclude(c)}
              approvalBlockHints={approvalBlockHints}
              emptyMessage="表示できる候補がありません。フィルターを変更してください。"
            />
          </>
        )}
      </section>

      {humanExcludedCount > 0 ? (
        <p className="hint daily30-excluded-hint">除外済み {humanExcludedCount}件</p>
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

      <DevDetails title="今日の収集情報" className="daily30-collection-info-collapse">
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
              <> · ローカル保存</>
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

        <div className="hint daily30-pipeline-summary">
          パイプライン内訳: {pipelineCountChips(pipelineCounts) ?? '—'}
        </div>

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
    </div>
  );
}
