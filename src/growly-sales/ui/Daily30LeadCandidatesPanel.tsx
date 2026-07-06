import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ExternalLeadCandidate } from '../adapters/externalLeadCandidateTypes.js';
import {
  GENERATE_DAILY_30_COPY_GATE_LABEL,
  fetchDaily30LeadCandidates,
  runDaily30GenerateCopy,
} from './daily30CopyApi.js';
import {
  Daily30CandidateList,
  Daily30CandidateQueueHeader,
  workQueueTitleForLeadView,
} from './Daily30CandidateCards.js';
import { filterDaily30UiListCandidates } from './daily30ExcludeUi.js';
import { HumanGateConfirmModal } from './HumanGateConfirmModal.js';
import { DevDetails } from './common/DevDetails.js';
import { Daily30GenerateCopyGateDev } from './Daily30GenerateCopyGateDev.js';
import { filterByCompanyName } from './leadFilterUtils.js';
import { CandidateDisplayModeToggle } from './CandidateDisplayModeToggle.js';
import { Daily30CandidateFocusView } from './Daily30CandidateFocusView.js';
import {
  DISPLAY_MODE_STORAGE_KEY_LEAD,
  loadStoredDisplayMode,
  saveStoredDisplayMode,
  type CandidateDisplayMode,
} from './daily30CandidateFocusMode.js';
import { useCandidateFocusQueue } from './useCandidateFocusQueue.js';
import type { Daily30SuppressionBlockHint } from '../candidates/buildDaily30CopySuppressionHints.js';

interface Daily30LeadCandidatesPanelProps {
  onError: (message: string) => void;
  onSuccess?: (message: string) => void;
  refreshKey?: number;
  onChanged?: () => void;
  sessionExcludedIds?: ReadonlySet<string>;
  onDisplayModeChange?: (mode: CandidateDisplayMode) => void;
}

function resolveGenerateCopyDisabledReason(
  approvedCount: number,
  copyTargetsCount: number
): string | null {
  if (approvedCount === 0) {
    return 'Lead登録済み候補がありません。先に候補収集タブで Lead化承認を行ってください。';
  }
  if (copyTargetsCount === 0) {
    return '営業文生成待ちの候補がありません。';
  }
  return null;
}

export function Daily30LeadCandidatesPanel({
  onError,
  onSuccess,
  refreshKey = 0,
  onChanged,
  sessionExcludedIds,
  onDisplayModeChange,
}: Daily30LeadCandidatesPanelProps) {
  const [loading, setLoading] = useState(true);
  const [approvedForLead, setApprovedForLead] = useState<ExternalLeadCandidate[]>([]);
  const [copySuppressionHints, setCopySuppressionHints] = useState<
    Record<string, Daily30SuppressionBlockHint>
  >({});
  const [gateInput, setGateInput] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generateMessage, setGenerateMessage] = useState<string | null>(null);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [view, setView] = useState<'actionable' | 'approved' | 'generated'>('actionable');
  const [query, setQuery] = useState('');
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [displayMode, setDisplayMode] = useState<CandidateDisplayMode>(() =>
    loadStoredDisplayMode(DISPLAY_MODE_STORAGE_KEY_LEAD, 'focus')
  );
  const [showFocusFilters, setShowFocusFilters] = useState(false);

  const setDisplayModePersisted = useCallback(
    (mode: CandidateDisplayMode) => {
      setDisplayMode(mode);
      saveStoredDisplayMode(DISPLAY_MODE_STORAGE_KEY_LEAD, mode);
      onDisplayModeChange?.(mode);
    },
    [onDisplayModeChange]
  );

  useEffect(() => {
    onDisplayModeChange?.(displayMode);
  }, [displayMode, onDisplayModeChange]);

  const workflowCounts = useMemo(
    () => ({
      approved: approvedForLead.length,
      copyPending: approvedForLead.filter(
        (c) => c.pipelineStatus === 'ready_for_copy' || c.pipelineStatus === 'needs_review'
      ).length,
    }),
    [approvedForLead]
  );

  const copyTargets = useMemo(
    () =>
      approvedForLead.filter(
        (c) =>
          (c.pipelineStatus === 'ready_for_copy' || c.pipelineStatus === 'needs_review') &&
          !copySuppressionHints[c.externalCandidateId]
      ),
    [approvedForLead, copySuppressionHints]
  );

  const generateDisabledReason = resolveGenerateCopyDisabledReason(
    approvedForLead.length,
    copyTargets.length
  );
  const canGenerateCopy = generateDisabledReason === null;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchDaily30LeadCandidates();
      setApprovedForLead(filterDaily30UiListCandidates(data.approvedForLead, sessionExcludedIds));
      setCopySuppressionHints(data.copySuppressionHints ?? {});
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Lead化候補の読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  }, [onError, sessionExcludedIds]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  useEffect(() => {
    setPage(1);
  }, [view, query, pageSize]);

  const approvedFiltered = useMemo(() => {
    return filterByCompanyName(approvedForLead, query, (c) => c.companyName ?? '');
  }, [approvedForLead, query]);

  const actionable = useMemo(() => {
    return approvedFiltered.filter(
      (c) => c.pipelineStatus === 'ready_for_copy' || c.pipelineStatus === 'needs_review'
    );
  }, [approvedFiltered]);

  const generated = useMemo(() => {
    return approvedFiltered.filter(
      (c) => c.pipelineStatus === 'copy_generated' || c.pipelineStatus === 'ready_for_draft'
    );
  }, [approvedFiltered]);

  const activeList =
    view === 'approved'
        ? approvedFiltered
        : view === 'generated'
          ? generated
          : actionable;

  const pageCount = Math.max(1, Math.ceil(activeList.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const start = (safePage - 1) * pageSize;
  const end = Math.min(activeList.length, start + pageSize);
  const pageItems = activeList.slice(start, end);

  const focusFilterKey = `${query}|${view}`;
  const focusQueueState = useCandidateFocusQueue(activeList, {}, focusFilterKey);
  const operationBusy = generating;
  const focusCurrent = focusQueueState.currentCandidate;
  const focusPrimaryAction =
    view === 'generated' ||
    focusCurrent?.pipelineStatus === 'ready_for_draft' ||
    Boolean(focusCurrent?.copyGeneratedAt)
      ? 'view_copy'
      : 'generate_copy';

  async function executeGenerateCopy(): Promise<void> {
    setGenerating(true);
    setGenerateMessage(null);
    try {
      const result = await runDaily30GenerateCopy(GENERATE_DAILY_30_COPY_GATE_LABEL);
      setGenerateMessage(result.message);
      setGateInput('');
      setShowGenerateModal(false);
      onSuccess?.(
        `営業文生成完了: 通過 ${result.stats.passed} / needs_review ${result.stats.needsReview} / excluded ${result.stats.excluded}`
      );
      onChanged?.();
      await load();
    } catch (err) {
      onError(err instanceof Error ? err.message : '営業文生成に失敗しました');
    } finally {
      setGenerating(false);
    }
  }

  async function handleGenerateCopyDev(): Promise<void> {
    if (gateInput.trim() !== GENERATE_DAILY_30_COPY_GATE_LABEL) return;
    await executeGenerateCopy();
  }

  if (loading) return <p className="loading">Lead登録済み候補を読み込み中…</p>;

  const queueTitle = workQueueTitleForLeadView(view);

  return (
    <>
      <div
        className={`daily30-lead-candidates-card daily30-work-queue-panel${displayMode === 'focus' ? ' daily30-work-queue-panel-focus' : ''}`}
      >
        <div className="daily30-candidate-work-primary">
          <section
            className={`daily30-work-queue${displayMode === 'focus' ? ' daily30-work-queue-focus' : ''}`}
            aria-label="営業文作業キュー"
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
                    <select className="input" value={view} onChange={(e) => setView(e.target.value as typeof view)}>
                      <option value="actionable">営業文作成待ち（推奨）</option>
                      <option value="approved">Lead登録済み</option>
                      <option value="generated">営業文生成済み</option>
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
                    <span className="daily30-section-count">{activeList.length}件</span>
                  </h3>
                  <CandidateDisplayModeToggle
                    mode={displayMode}
                    onChange={setDisplayModePersisted}
                    disabled={operationBusy}
                  />
                </div>
                <p className="hint daily30-work-queue-hint">
                  Lead登録済み候補から営業文作成へ進みます。営業文生成待ち {workflowCounts.copyPending}件
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
                  <select className="input" value={view} onChange={(e) => setView(e.target.value as typeof view)}>
                    <option value="actionable">営業文作成待ち（推奨）</option>
                    <option value="approved">Lead登録済み</option>
                    <option value="generated">営業文生成済み</option>
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
            variant="lead"
            title={queueTitle}
            candidate={focusQueueState.currentCandidate}
            approvalBlockHints={{}}
            remainingCount={focusQueueState.remainingCount}
            processedCount={focusQueueState.processedCount}
            focusIndex={focusQueueState.safeIndex}
            canGoPrev={focusQueueState.canGoPrev}
            canGoNext={focusQueueState.canGoNext}
            allDeferred={focusQueueState.allDeferred}
            busy={operationBusy}
            approving={false}
            excluding={false}
            showApprove={false}
            showExclude={false}
            showDefer
            primaryAction={focusPrimaryAction}
            onDefer={focusQueueState.deferCurrent}
            onClearDeferred={focusQueueState.clearDeferred}
            onPrev={focusQueueState.goPrev}
            onNext={focusQueueState.goNext}
            onGenerateCopy={() => setShowGenerateModal(true)}
            emptyMessage="表示できる候補がありません。"
            />
          </div>
        ) : (
          <div className="daily30-candidate-queue-list">
            <Daily30CandidateQueueHeader showActions={false} />
            <div className="daily30-candidate-queue-body">
              <Daily30CandidateList
                candidates={pageItems}
                layout="queue"
                showApprove={false}
                approvalBlockHints={{}}
                copySuppressionHints={copySuppressionHints}
                showActionColumn={false}
                emptyMessage="表示できる候補がありません。"
              />
            </div>
          </div>
        )}
          </section>
        </div>
      </div>

      {displayMode !== 'focus' ? (
      <aside className="daily30-candidate-work-aux" aria-label="Lead化・営業文の補助操作">
        <div className="daily30-generate-gate human-gate-action-block">
        <h3 className="subsection-title">営業文生成</h3>
        <p className="hint human-gate-action-hint">
          Lead登録済み候補に営業文を作成します。Gmail下書き・送信は行いません。
        </p>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!canGenerateCopy || generating}
          onClick={() => setShowGenerateModal(true)}
        >
          {generating ? '生成中…' : '営業文を生成する'}
        </button>
        {generateDisabledReason && (
          <p className="hint warning-text human-gate-disabled-reason">{generateDisabledReason}</p>
        )}
        {generateMessage && <p className="hint success-text">{generateMessage}</p>}

        <DevDetails title="詳細操作（開発者向け）">
          <Daily30GenerateCopyGateDev
            gateInput={gateInput}
            generating={generating}
            copyTargetsCount={copyTargets.length}
            onGateInputChange={setGateInput}
            onGenerate={() => void handleGenerateCopyDev()}
          />
        </DevDetails>
        </div>
      </aside>
      ) : null}

      {showGenerateModal && (
        <HumanGateConfirmModal
          title="営業文を生成する"
          message="Lead登録済み候補に対して営業文を生成します。Gmail下書き作成・送信は行いません。実行しますか？"
          targetCount={copyTargets.length}
          safetyNotes={[
            'Gmail下書きは作成しません',
            'Gmail送信は行いません',
            `Lead登録済み ${approvedForLead.length} 件のうち、生成対象 ${copyTargets.length} 件`,
          ]}
          confirmLabel="営業文を生成する"
          confirming={generating}
          onConfirm={() => void executeGenerateCopy()}
          onCancel={() => !generating && setShowGenerateModal(false)}
        />
      )}
    </>
  );
}
