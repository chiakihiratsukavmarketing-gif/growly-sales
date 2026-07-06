import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ExternalLeadCandidate } from '../adapters/externalLeadCandidateTypes.js';
import { approveExternalCandidateForLead, excludeDaily30CandidateApi } from './daily30CopyApi.js';
import { confirmDaily30LeadApproval } from './confirmDaily30LeadApproval.js';
import { confirmDaily30CandidateExclude } from './confirmDaily30CandidateExclude.js';
import { fetchDaily30Dashboard, type Daily30DashboardResponse } from './daily30Api.js';
import { EmptyState } from './common/EmptyState.js';
import { DevDetails } from './common/DevDetails.js';
import { isDevApiErrorMessage } from './displayLabels.js';
import {
  Daily30CandidateList,
  Daily30CandidateQueueHeader,
  workQueueTitleForFilter,
} from './Daily30CandidateCards.js';
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
  onDisplayModeChange?: (mode: CandidateDisplayMode) => void;
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
  onDisplayModeChange,
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
  const [showFocusFilters, setShowFocusFilters] = useState(false);

  const setDisplayModePersisted = useCallback(
    (mode: CandidateDisplayMode) => {
      setDisplayMode(mode);
      saveStoredDisplayMode(DISPLAY_MODE_STORAGE_KEY_RESULTS, mode);
      onDisplayModeChange?.(mode);
    },
    [onDisplayModeChange]
  );

  useEffect(() => {
    onDisplayModeChange?.(displayMode);
  }, [displayMode, onDisplayModeChange]);

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

  const queueTitle = workQueueTitleForFilter(filter);

  return (
    <>
      <div
        className={`daily30-cloud-results-card daily30-work-queue-panel${displayMode === 'focus' ? ' daily30-work-queue-panel-focus' : ''}`}
      >
        <div className="daily30-candidate-work-primary">
          <section
            className={`daily30-work-queue${displayMode === 'focus' ? ' daily30-work-queue-focus' : ''}`}
            aria-label="候補作業キュー"
          >
          {displayMode === 'focus' ? (
            <div className="daily30-focus-mode-chrome">
              <div className="daily30-focus-mode-toolbar">
                <CandidateDisplayModeToggle
                  mode={displayMode}
                  onChange={setDisplayModePersisted}
                  disabled={operationBusy}
                />
                <button
                  type="button"
                  className="btn btn-secondary candidate-btn-toolbar"
                  aria-expanded={showFocusFilters}
                  onClick={() => setShowFocusFilters((v) => !v)}
                >
                  絞り込み
                </button>
              </div>
              {showFocusFilters ? (
                <div className="daily30-candidate-tools daily30-candidate-tools-bar daily30-candidate-tools-compact daily30-focus-filters">
                  <div className="daily30-candidate-tools-row daily30-candidate-tools-row-list">
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
                      <option value="email_missing">メール未確認（フォームのみ含む）</option>
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
                </div>
              ) : null}
            </div>
          ) : (
            <>
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

              <div className="daily30-candidate-tools daily30-candidate-tools-bar daily30-candidate-tools-compact">
                <div className="daily30-candidate-tools-row daily30-candidate-tools-row-list">
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
                    <option value="email_missing">メール未確認（フォームのみ含む）</option>
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
                  <div className="daily30-pager daily30-pager-compact">
                    <label className="hint daily30-page-size-label">
                      <span>表示件数</span>
                      <select
                        className="input input-xs daily30-page-size"
                        value={pageSize}
                        onChange={(e) => setPageSize(Number(e.target.value))}
                      >
                        <option value={10}>10</option>
                        <option value={25}>25</option>
                        <option value={50}>50</option>
                      </select>
                    </label>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm daily30-pager-button"
                      disabled={safePage <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      前へ
                    </button>
                    <span className="hint daily30-page-indicator">{safePage} / {pageCount}</span>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm daily30-pager-button"
                      disabled={safePage >= pageCount}
                      onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                    >
                      次へ
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}

        {displayMode === 'focus' ? (
          <div className="daily30-candidate-focus-viewport">
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
          </div>
        ) : (
          <div className="daily30-candidate-queue-list">
            <Daily30CandidateQueueHeader showActions />
            <div className="daily30-candidate-queue-body">
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
            </div>
          </div>
        )}
          </section>
        </div>
      </div>
    </>
  );
}
