import { useCallback, useEffect, useState } from 'react';
import type { Lead } from '../../types/lead.js';
import type { CreateGmailDraftForLeadResult } from '../workflow/createGmailDraftForLead.js';
import { approveLead } from './api.js';
import {
  createGmailDraftApi,
  fetchGmailDraftCandidates,
  type GmailDraftCandidateDetail,
} from './gmailDraftCandidatesApi.js';
import { LeadStatusBadge } from './LeadStatusBadge.js';
import { SectionCard } from './SectionCard.js';
import { InfoBanner } from './InfoBanner.js';
import { GmailDraftCreateDialog } from './GmailDraftCreateDialog.js';
import { GmailDraftCreateResultPanel } from './GmailDraftCreateResultPanel.js';
import { ApproveDraftDialog } from './ApproveDraftDialog.js';
import type { SalesFlowTab } from './GrowlySalesDashboard.js';

interface GmailDraftCandidatesViewProps {
  onError: (message: string) => void;
  onDraftCreated?: (lead: Lead) => void;
  onNavigateToTab?: (tab: SalesFlowTab, highlightLeadId?: string) => void;
  refreshKey?: number;
}

export function GmailDraftCandidatesView({
  onError,
  onDraftCreated,
  onNavigateToTab,
  refreshKey = 0,
}: GmailDraftCandidatesViewProps) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchGmailDraftCandidates>> | null>(null);
  const [dialogCandidate, setDialogCandidate] = useState<GmailDraftCandidateDetail | null>(null);
  const [approveCandidate, setApproveCandidate] = useState<GmailDraftCandidateDetail | null>(null);
  const [gateInput, setGateInput] = useState('');
  const [creating, setCreating] = useState(false);
  const [approving, setApproving] = useState(false);
  const [createResult, setCreateResult] = useState<CreateGmailDraftForLeadResult | null>(null);
  const [approveSuccess, setApproveSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchGmailDraftCandidates();
      setData(result);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Gmail下書き候補の読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  async function handleConfirmCreate(): Promise<void> {
    if (!dialogCandidate) return;
    setCreating(true);
    try {
      const result = await createGmailDraftApi(dialogCandidate.leadId, gateInput.trim());
      setDialogCandidate(null);
      setGateInput('');
      setCreateResult(result);
      onDraftCreated?.(result.lead);
      await load();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Gmail下書きの作成に失敗しました');
      setDialogCandidate(null);
      setGateInput('');
    } finally {
      setCreating(false);
    }
  }

  async function handleConfirmApprove(): Promise<void> {
    if (!approveCandidate) return;
    setApproving(true);
    try {
      const updated = await approveLead(approveCandidate.leadId);
      setApproveCandidate(null);
      setApproveSuccess(`${updated.companyName} を承認しました。CREATE_DRAFTS で下書き作成できます。`);
      onDraftCreated?.(updated);
      await load();
    } catch (err) {
      onError(err instanceof Error ? err.message : '承認に失敗しました');
      setApproveCandidate(null);
    } finally {
      setApproving(false);
    }
  }

  if (loading) return <p className="loading">Gmail下書き候補を読み込み中…</p>;
  if (!data) return null;

  const pendingCandidates = data.candidates.filter((c) => c.humanReviewStatus === 'pending');
  const approvedCandidates = data.candidates.filter((c) => c.humanReviewStatus === 'approved');

  function renderCandidateCard(candidate: GmailDraftCandidateDetail, isPending: boolean) {
    return (
      <article
        key={candidate.leadId}
        className={`gmail-candidate-card ${isPending ? 'gmail-candidate-pending-review' : ''}`}
      >
        <div className="gmail-candidate-main">
          <h4 className="pending-company">{candidate.companyName}</h4>
          <p className="pending-meta">
            To: {candidate.to} / 件名: {candidate.subject}
          </p>
          <p className="pending-subject">customHook: {candidate.customHook || '—'}</p>
          <div className="candidate-badges">
            <LeadStatusBadge kind="human" value={candidate.humanReviewStatus} />
            <LeadStatusBadge kind="send" value={candidate.sendStatus} />
            <span className="badge badge-neutral">{candidate.gmailDraftStatus}</span>
          </div>
          {isPending && (
            <InfoBanner variant="warning">
              内容確認が必要です。承認後にのみ Gmail 下書きを作成できます（自動送信なし）。
            </InfoBanner>
          )}
          {!candidate.canCreate && candidate.blockReason && (
            <p className="hint warning-text">作成不可: {candidate.blockReason}</p>
          )}
        </div>
        <div className="gmail-candidate-actions">
          {isPending ? (
            <>
              <p className="pending-hint">承認は送信ではありません</p>
              <button
                type="button"
                className="btn btn-warn"
                onClick={() => setApproveCandidate(candidate)}
              >
                内容確認済み・承認する
              </button>
            </>
          ) : (
            <>
              <p className="pending-hint">送信はされません</p>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!candidate.canCreate}
                onClick={() => {
                  setGateInput('');
                  setDialogCandidate(candidate);
                }}
              >
                Gmail下書きを作成
              </button>
            </>
          )}
        </div>
      </article>
    );
  }

  return (
    <div className="gmail-draft-candidates-view">
      <InfoBanner variant="warning">
        Gmail下書きは1社ずつ作成します。users.drafts.create のみ — 自動送信は行いません。承認待ち（pending）は承認後に作成可能です。
      </InfoBanner>
      <p className="hint">
        候補 {data.totalCount}件（承認待ち {pendingCandidates.length} / 作成可能 {approvedCandidates.length}）/
        取得: {new Date(data.generatedAt).toLocaleString('ja-JP')}
      </p>

      {approveSuccess && <div className="alert alert-success">{approveSuccess}</div>}

      {createResult && (
        <GmailDraftCreateResultPanel
          result={createResult}
          onGoToSendRecords={() => {
            const leadId = createResult.lead.id;
            setCreateResult(null);
            onNavigateToTab?.('send-records', leadId);
          }}
          onDismiss={() => setCreateResult(null)}
        />
      )}

      {pendingCandidates.length > 0 && (
        <SectionCard
          title={`承認待ち（${pendingCandidates.length}件）`}
          className="gmail-pending-review-section"
        >
          <div className="gmail-candidate-list">
            {pendingCandidates.map((c) => renderCandidateCard(c, true))}
          </div>
        </SectionCard>
      )}

      <SectionCard title={`Gmail下書き作成候補（${approvedCandidates.length}件）`}>
        {approvedCandidates.length === 0 && pendingCandidates.length === 0 ? (
          <p className="hint">現在、Gmail下書き作成候補はありません。</p>
        ) : approvedCandidates.length === 0 ? (
          <p className="hint">承認済みの候補はありません。上の承認待ち Lead を確認してください。</p>
        ) : (
          <div className="gmail-candidate-list">
            {approvedCandidates.map((c) => renderCandidateCard(c, false))}
          </div>
        )}
      </SectionCard>

      {dialogCandidate && (
        <GmailDraftCreateDialog
          candidate={dialogCandidate}
          gateInput={gateInput}
          creating={creating}
          onGateInputChange={setGateInput}
          onConfirm={() => void handleConfirmCreate()}
          onCancel={() => !creating && setDialogCandidate(null)}
        />
      )}

      {approveCandidate && (
        <ApproveDraftDialog
          companyName={approveCandidate.companyName}
          approving={approving}
          onConfirm={() => void handleConfirmApprove()}
          onCancel={() => !approving && setApproveCandidate(null)}
        />
      )}
    </div>
  );
}
