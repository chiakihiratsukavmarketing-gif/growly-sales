import { useCallback, useEffect, useState } from 'react';
import type { ExternalLeadCandidate } from '../adapters/externalLeadCandidateTypes.js';
import { SectionCard } from './SectionCard.js';
import { InfoBanner } from './InfoBanner.js';
import {
  GENERATE_DAILY_30_COPY_GATE_LABEL,
  approveExternalCandidateForLead,
  fetchDaily30LeadCandidates,
  runDaily30GenerateCopy,
} from './daily30CopyApi.js';

interface Daily30LeadCandidatesPanelProps {
  onError: (message: string) => void;
  onSuccess?: (message: string) => void;
  refreshKey?: number;
  onChanged?: () => void;
}

export function Daily30LeadCandidatesPanel({
  onError,
  onSuccess,
  refreshKey = 0,
  onChanged,
}: Daily30LeadCandidatesPanelProps) {
  const [loading, setLoading] = useState(true);
  const [approvalPending, setApprovalPending] = useState<ExternalLeadCandidate[]>([]);
  const [approvedForLead, setApprovedForLead] = useState<ExternalLeadCandidate[]>([]);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [gateInput, setGateInput] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generateMessage, setGenerateMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchDaily30LeadCandidates();
      setApprovalPending(data.approvalPending);
      setApprovedForLead(data.approvedForLead);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Lead化候補の読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  async function handleApprove(candidate: ExternalLeadCandidate): Promise<void> {
    setApprovingId(candidate.externalCandidateId);
    try {
      const updated = await approveExternalCandidateForLead(candidate.externalCandidateId);
      setApprovalPending((prev) =>
        prev.filter((c) => c.externalCandidateId !== updated.externalCandidateId)
      );
      setApprovedForLead((prev) => [...prev.filter((c) => c.externalCandidateId !== updated.externalCandidateId), updated]);
      onSuccess?.(`${updated.companyName} を Lead 化候補として承認しました（leads.json には未取り込み）`);
      onChanged?.();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Lead化承認に失敗しました');
    } finally {
      setApprovingId(null);
    }
  }

  async function handleGenerateCopy(): Promise<void> {
    if (gateInput.trim() !== GENERATE_DAILY_30_COPY_GATE_LABEL) return;
    setGenerating(true);
    setGenerateMessage(null);
    try {
      const result = await runDaily30GenerateCopy(gateInput.trim());
      setGenerateMessage(result.message);
      setGateInput('');
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

  const gateOk = gateInput.trim() === GENERATE_DAILY_30_COPY_GATE_LABEL;
  const copyTargets = approvedForLead.filter(
    (c) => c.pipelineStatus === 'ready_for_copy' || c.pipelineStatus === 'needs_review'
  );

  if (loading) return <p className="loading">Lead化候補を読み込み中…</p>;

  return (
    <SectionCard title="Daily 30 — Lead化承認・営業文生成" className="daily30-lead-candidates-card">
      <InfoBanner variant="info">
        email_found 候補を<strong>Lead化候補</strong>として承認します。承認後も leads.json
        には書き込みません（下書き候補取り込みは別セクション）。営業文生成は{' '}
        <code>{GENERATE_DAILY_30_COPY_GATE_LABEL}</code> 入力時のみ実行します。
      </InfoBanner>

      <h3 className="subsection-title">Lead化承認待ち（{approvalPending.length}件）</h3>
      {approvalPending.length === 0 ? (
        <p className="hint">承認待ちの候補はありません。</p>
      ) : (
        <ul className="candidate-list">
          {approvalPending.map((c) => (
            <li key={c.externalCandidateId} className="candidate-list-item">
              <div>
                <strong>{c.companyName}</strong>
                <span className="hint"> — {c.area} / {c.emailCandidates[0]}</span>
              </div>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={approvingId === c.externalCandidateId}
                onClick={() => void handleApprove(c)}
              >
                {approvingId === c.externalCandidateId ? '承認中…' : 'Lead化を承認'}
              </button>
            </li>
          ))}
        </ul>
      )}

      <h3 className="subsection-title">承認済み（営業文生成対象: {copyTargets.length}件）</h3>
      {approvedForLead.length === 0 ? (
        <p className="hint">承認済み候補はありません。</p>
      ) : (
        <ul className="candidate-list compact">
          {approvedForLead.map((c) => (
            <li key={c.externalCandidateId}>
              {c.companyName} — {c.pipelineStatus}
              {c.copyGeneratedAt ? ' / 営業文生成済' : ''}
              {c.failureReason ? ` / ${c.failureReason}` : ''}
            </li>
          ))}
        </ul>
      )}

      <div className="daily30-generate-gate">
        <label className="hint">
          営業文生成・品質チェック — 確認のため <code>{GENERATE_DAILY_30_COPY_GATE_LABEL}</code> と入力
        </label>
        <div className="daily30-fetch-row">
          <input
            className="input"
            value={gateInput}
            onChange={(e) => setGateInput(e.target.value)}
            placeholder={GENERATE_DAILY_30_COPY_GATE_LABEL}
            disabled={generating || copyTargets.length === 0}
          />
          <button
            type="button"
            className="btn btn-primary"
            disabled={!gateOk || generating || copyTargets.length === 0}
            onClick={() => void handleGenerateCopy()}
          >
            {generating ? '生成中…' : '営業文生成・品質チェック'}
          </button>
        </div>
        {copyTargets.length === 0 && (
          <p className="hint">先に Lead 化承認を行ってください。</p>
        )}
        {generateMessage && <p className="hint success-text">{generateMessage}</p>}
      </div>
    </SectionCard>
  );
}
