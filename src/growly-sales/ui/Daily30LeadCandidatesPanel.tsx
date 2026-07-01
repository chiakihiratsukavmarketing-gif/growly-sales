import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ExternalLeadCandidate } from '../adapters/externalLeadCandidateTypes.js';
import { SectionCard } from './SectionCard.js';
import { InfoBanner } from './InfoBanner.js';
import { SummaryStatCard } from './SummaryStatCard.js';
import {
  GENERATE_DAILY_30_COPY_GATE_LABEL,
  approveExternalCandidateForLead,
  excludeDaily30CandidateApi,
  fetchDaily30LeadCandidates,
  runDaily30GenerateCopy,
} from './daily30CopyApi.js';
import { confirmDaily30LeadApproval } from './confirmDaily30LeadApproval.js';
import { confirmDaily30CandidateExclude } from './confirmDaily30CandidateExclude.js';
import { Daily30CandidateList } from './Daily30CandidateCards.js';
import { countDaily30LeadCopyWorkflow } from '../candidates/resolveDaily30WorkflowStatus.js';
import { filterDaily30UiListCandidates } from './daily30ExcludeUi.js';
import { HumanGateConfirmModal } from './HumanGateConfirmModal.js';
import { DevDetails } from './common/DevDetails.js';
import { Daily30GenerateCopyGateDev } from './Daily30GenerateCopyGateDev.js';

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

  const workflowCounts = useMemo(
    () => countDaily30LeadCopyWorkflow([...approvalPending, ...approvedForLead]),
    [approvalPending, approvedForLead]
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

  return (
    <SectionCard title="Lead化承認・営業文" className="daily30-lead-candidates-card">
      <InfoBanner variant="info">
        メール取得済候補を確認してLead化承認します。承認のみでは leads.json に書き込みません。営業文生成は確認ボタン実行時のみ（送信・下書き作成なし）。
      </InfoBanner>

      <div className="stats-grid daily30-workflow-stats">
        <SummaryStatCard value={workflowCounts.approvedLead} label="Lead化承認済み" highlight />
        <SummaryStatCard
          value={workflowCounts.copyPending}
          label="営業文生成待ち"
          highlight={workflowCounts.copyPending > 0}
        />
        <SummaryStatCard value={workflowCounts.copyGenerated} label="営業文生成済み" />
        <SummaryStatCard
          value={workflowCounts.qualityPassed}
          label="品質チェック済み"
          highlight={workflowCounts.qualityPassed > 0}
        />
      </div>

      <h3 className="subsection-title">Lead化承認待ち（{approvalPending.length}件）</h3>
      <Daily30CandidateList
        candidates={approvalPending}
        showApprove
        approvingId={approvingId}
        excludingId={excludingId}
        onApprove={(c) => void handleApprove(c)}
        onExclude={(c) => void handleExclude(c)}
        approvalBlockHints={approvalBlockHints}
        emptyMessage="承認待ち候補はありません。セクション1で収集結果を確認してください。"
      />

      <h3 className="subsection-title">承認済み・営業文対象（{approvedForLead.length}件）</h3>
      <Daily30CandidateList
        candidates={approvedForLead}
        emptyMessage="承認済み候補はありません。"
      />

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
    </SectionCard>
  );
}
