import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ExternalLeadCandidate } from '../adapters/externalLeadCandidateTypes.js';
import {
  GENERATE_DAILY_30_COPY_GATE_LABEL,
  approveExternalCandidateForLead,
  excludeDaily30CandidateApi,
  fetchDaily30LeadCandidates,
  runDaily30GenerateCopy,
} from './daily30CopyApi.js';
import { confirmDaily30LeadApproval } from './confirmDaily30LeadApproval.js';
import { confirmDaily30CandidateExclude } from './confirmDaily30CandidateExclude.js';
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

interface Daily30LeadCandidatesPanelProps {
  onError: (message: string) => void;
  onSuccess?: (message: string) => void;
  refreshKey?: number;
  onChanged?: () => void;
  sessionExcludedIds?: ReadonlySet<string>;
  onMarkExcluded?: (candidateId: string) => void;
}

function resolveGenerateCopyDisabledReason(
  approvedCount: number,
  copyTargetsCount: number
): string | null {
  if (approvedCount === 0) {
    return 'Lead化承認済み候補がありません。先に Lead化承認を行ってください。';
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
  onMarkExcluded,
}: Daily30LeadCandidatesPanelProps) {
  const [loading, setLoading] = useState(true);
  const [approvalPending, setApprovalPending] = useState<ExternalLeadCandidate[]>([]);
  const [approvedForLead, setApprovedForLead] = useState<ExternalLeadCandidate[]>([]);
  const [approvalBlockHints, setApprovalBlockHints] = useState<
    Record<string, { blockReason: string; duplicateLeadName?: string }>
  >({});
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [excludingId, setExcludingId] = useState<string | null>(null);
  const [gateInput, setGateInput] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generateMessage, setGenerateMessage] = useState<string | null>(null);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [view, setView] = useState<
    'actionable' | 'pending' | 'approved' | 'generated'
  >('actionable');
  const [query, setQuery] = useState('');
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [displayMode, setDisplayMode] = useState<CandidateDisplayMode>(() =>
    loadStoredDisplayMode(DISPLAY_MODE_STORAGE_KEY_LEAD, 'focus')
  );

  const setDisplayModePersisted = useCallback((mode: CandidateDisplayMode) => {
    setDisplayMode(mode);
    saveStoredDisplayMode(DISPLAY_MODE_STORAGE_KEY_LEAD, mode);
  }, []);

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
        (c) => c.pipelineStatus === 'ready_for_copy' || c.pipelineStatus === 'needs_review'
      ),
    [approvedForLead]
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
      setApprovalPending(filterDaily30UiListCandidates(data.approvalPending, sessionExcludedIds));
      setApprovedForLead(filterDaily30UiListCandidates(data.approvedForLead, sessionExcludedIds));
      setApprovalBlockHints(data.approvalBlockHints ?? {});
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

  const pendingFiltered = useMemo(() => {
    return filterByCompanyName(approvalPending, query, (c) => c.companyName ?? '');
  }, [approvalPending, query]);

  const approvedFiltered = useMemo(() => {
    return filterByCompanyName(approvedForLead, query, (c) => c.companyName ?? '');
  }, [approvedForLead, query]);

  const actionable = useMemo(() => {
    const list = pendingFiltered;
    const score = (c: ExternalLeadCandidate) => (approvalBlockHints[c.externalCandidateId] ? 1 : 0);
    return [...list].sort((a, b) => score(a) - score(b));
  }, [pendingFiltered, approvalBlockHints]);

  const generated = useMemo(() => {
    return approvedFiltered.filter(
      (c) => c.pipelineStatus === 'copy_generated' || c.pipelineStatus === 'ready_for_draft'
    );
  }, [approvedFiltered]);

  const activeList =
    view === 'pending'
      ? pendingFiltered
      : view === 'approved'
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
  const focusQueueState = useCandidateFocusQueue(activeList, approvalBlockHints, focusFilterKey);

  const operationBusy =
    approvingId !== null || excludingId !== null || generating;

  const focusPrimaryAction =
    view === 'generated'
      ? 'view_copy'
      : view === 'approved'
        ? 'generate_copy'
        : 'approve';

  async function handleApprove(candidate: ExternalLeadCandidate): Promise<void> {
    if (!confirmDaily30LeadApproval(candidate)) return;
    setApprovingId(candidate.externalCandidateId);
    try {
      const updated = await approveExternalCandidateForLead(candidate.externalCandidateId);
      setApprovalPending((prev) =>
        prev.filter((c) => c.externalCandidateId !== updated.externalCandidateId)
      );
      setApprovedForLead((prev) => [
        ...prev.filter((c) => c.externalCandidateId !== updated.externalCandidateId),
        updated,
      ]);
      onSuccess?.(
        `${updated.companyName} を Lead 化候補として承認しました（leads.json には未取り込み）`
      );
      focusQueueState.recordProcessed();
      onChanged?.();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Lead化承認に失敗しました');
    } finally {
      setApprovingId(null);
    }
  }

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

  async function handleExclude(candidate: ExternalLeadCandidate): Promise<void> {
    const reason = confirmDaily30CandidateExclude(candidate);
    if (!reason) return;
    const candidateId = candidate.externalCandidateId;
    setExcludingId(candidateId);
    onMarkExcluded?.(candidateId);
    setApprovalPending((prev) => prev.filter((c) => c.externalCandidateId !== candidateId));
    setApprovedForLead((prev) => prev.filter((c) => c.externalCandidateId !== candidateId));
    try {
      const result = await excludeDaily30CandidateApi(candidateId, reason, candidate);
      if (!result.ok || !result.persisted) {
        throw new Error('候補の除外状態を保存できませんでした');
      }
      onMarkExcluded?.(result.candidateId);
      focusQueueState.recordProcessed();
      onSuccess?.(`${candidate.companyName} を候補から除外しました`);
      await load();
      const refreshed = await fetchDaily30LeadCandidates();
      const stillPending = refreshed.approvalPending.some(
        (c) => c.externalCandidateId === result.candidateId
      );
      if (stillPending) {
        throw new Error('除外後もサーバーが候補を返しています。再読み込みしてください。');
      }
      onChanged?.();
    } catch (err) {
      onError(err instanceof Error ? err.message : '候補の除外に失敗しました');
      await load();
    } finally {
      setExcludingId(null);
    }
  }

  if (loading) return <p className="loading">Lead化候補を読み込み中…</p>;

  const queueTitle = workQueueTitleForLeadView(view);

  return (
    <div className="daily30-lead-candidates-card daily30-work-queue-panel">
      <section className="daily30-work-queue" aria-label="Lead化作業キュー">
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
            Lead化承認済み {workflowCounts.approved}件 · 営業文生成待ち {workflowCounts.copyPending}件
          </p>
        </header>

        <div className="daily30-candidate-tools daily30-candidate-tools-sticky">
          <div className="daily30-candidate-tools-row">
            <input
              className="input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="会社名で検索"
              aria-label="会社名で検索"
            />
            <select className="input" value={view} onChange={(e) => setView(e.target.value as typeof view)}>
              <option value="actionable">作業可能（推奨）</option>
              <option value="pending">承認待ち</option>
              <option value="approved">承認済み</option>
              <option value="generated">営業文生成済み</option>
            </select>
            {displayMode === 'list' ? (
              <>
                <label className="hint">
                  表示件数{' '}
                  <select className="input input-xs" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                  </select>
                </label>
                <div className="hint">{activeList.length === 0 ? '0件' : `${start + 1}–${end}`} / {activeList.length}件</div>
                <button type="button" className="btn btn-secondary btn-sm" disabled={safePage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  前へ
                </button>
                <span className="hint">{safePage} / {pageCount}</span>
                <button type="button" className="btn btn-secondary btn-sm" disabled={safePage >= pageCount} onClick={() => setPage((p) => Math.min(pageCount, p + 1))}>
                  次へ
                </button>
              </>
            ) : null}
          </div>
        </div>

        {displayMode === 'focus' ? (
          <Daily30CandidateFocusView
            variant="lead"
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
            showApprove={view !== 'approved' && view !== 'generated'}
            showExclude={view !== 'approved' && view !== 'generated'}
            showDefer={view !== 'approved' && view !== 'generated'}
            primaryAction={focusPrimaryAction}
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
            onGenerateCopy={() => setShowGenerateModal(true)}
            emptyMessage="表示できる候補がありません。"
          />
        ) : (
          <>
            <Daily30CandidateQueueHeader showActions={view !== 'approved' && view !== 'generated'} />
            <Daily30CandidateList
              candidates={pageItems}
              layout="queue"
              showApprove={view !== 'approved' && view !== 'generated'}
              approvingId={approvingId}
              excludingId={excludingId}
              onApprove={(c) => void handleApprove(c)}
              onExclude={(c) => void handleExclude(c)}
              approvalBlockHints={approvalBlockHints}
              emptyMessage="表示できる候補がありません。"
            />
          </>
        )}
      </section>

      <div className="daily30-generate-gate human-gate-action-block">
        <h3 className="subsection-title">営業文生成</h3>
        <p className="hint human-gate-action-hint">
          Lead化承認済み候補に営業文を作成します。Gmail下書き・送信は行いません。
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

      {showGenerateModal && (
        <HumanGateConfirmModal
          title="営業文を生成する"
          message="Lead化承認済み候補に対して営業文を生成します。Gmail下書き作成・送信は行いません。実行しますか？"
          targetCount={copyTargets.length}
          safetyNotes={[
            'Gmail下書きは作成しません',
            'Gmail送信は行いません',
            `Lead化承認済み ${approvedForLead.length} 件のうち、生成対象 ${copyTargets.length} 件`,
          ]}
          confirmLabel="営業文を生成する"
          confirming={generating}
          onConfirm={() => void executeGenerateCopy()}
          onCancel={() => !generating && setShowGenerateModal(false)}
        />
      )}
    </div>
  );
}
