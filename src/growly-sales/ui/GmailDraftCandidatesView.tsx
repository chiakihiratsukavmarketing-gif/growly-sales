import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { GmailDraftCreateDialog } from './GmailDraftCreateDialog.js';
import { GmailDraftCreateResultPanel } from './GmailDraftCreateResultPanel.js';
import { ApproveDraftDialog } from './ApproveDraftDialog.js';
import { EmailSourceDisplay, emailSourceInfoFromOutreachView } from './EmailSourceDisplay.js';
import { PageHeader } from './common/PageHeader.js';
import { EmptyState } from './common/EmptyState.js';
import { SearchAndFilterBar } from './common/SearchAndFilterBar.js';
import { FilterEmptyState } from './common/FilterEmptyState.js';
import {
  DRAFT_CANDIDATE_FILTER_OPTIONS,
  filterByCompanyName,
  matchesDraftCandidateFilter,
} from './leadFilterUtils.js';
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
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

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

  const allCandidates = data?.candidates ?? [];

  const filteredCandidates = useMemo(() => {
    let items = allCandidates;
    items = items.filter((c) => matchesDraftCandidateFilter(c, statusFilter));
    items = filterByCompanyName(items, search, (c) => c.companyName);
    return items;
  }, [allCandidates, statusFilter, search]);

  const pendingCandidates = filteredCandidates.filter((c) => c.humanReviewStatus === 'pending');
  const approvedCandidates = filteredCandidates.filter((c) => c.humanReviewStatus === 'approved');

  const clearFilters = useCallback(() => {
    setSearch('');
    setStatusFilter('all');
  }, []);

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
      setApproveSuccess(`${updated.companyName} を承認しました。Gmail下書きを作成できます。`);
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

  const totalCandidates = allCandidates.length;

  function renderCandidateCard(candidate: GmailDraftCandidateDetail, isPending: boolean) {
    return (
      <article
        key={candidate.leadId}
        className={`gmail-candidate-card ${isPending ? 'gmail-candidate-pending-review' : ''}`}
      >
        <div className="gmail-candidate-main">
          <h4 className="pending-company">{candidate.companyName}</h4>
          <p className="pending-meta">件名: {candidate.subject}</p>
          <div className="gmail-candidate-email-block">
            <p className="pending-meta gmail-candidate-to">
              <span className="daily30-field-label">メール</span>
              <span title={candidate.to}>{candidate.to}</span>
            </p>
            <EmailSourceDisplay
              info={emailSourceInfoFromOutreachView({ ...candidate, to: candidate.to })}
              variant="under-email"
              showWarnings
              className="gmail-candidate-email-source"
            />
          </div>
          <div className="candidate-badges">
            <LeadStatusBadge kind="human" value={candidate.humanReviewStatus} />
          </div>
          {!candidate.canCreate && candidate.blockReason && (
            <p className="hint warning-text">{candidate.blockReason}</p>
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
              <p className="pending-hint">Gmailでの送信は人間が行います</p>
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
      <PageHeader
        title="下書き候補"
        subtitle="承認済み Lead の Gmail 下書きを作成します。自動送信は行いません。"
      />

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

      {totalCandidates > 0 && (
        <SearchAndFilterBar
          searchValue={search}
          onSearchChange={setSearch}
          filterValue={statusFilter}
          onFilterChange={setStatusFilter}
          filterOptions={DRAFT_CANDIDATE_FILTER_OPTIONS}
          resultCount={filteredCandidates.length}
          totalCount={totalCandidates}
          onClear={clearFilters}
        />
      )}

      {totalCandidates === 0 && (
        <EmptyState
          title="Gmail下書きに進める候補はありません"
          reason="未送信かつメールアドレスがあり、営業文が揃った Lead が承認済みになるとここに表示されます。送信済み・下書き済みは重複表示しません。"
          actionLabel="Lead一覧で候補を確認する"
          onAction={() => onNavigateToTab?.('leads')}
        />
      )}

      {totalCandidates > 0 && filteredCandidates.length === 0 && (
        <FilterEmptyState onClear={clearFilters} />
      )}

      {pendingCandidates.length > 0 && (
        <SectionCard title={`承認待ち（${pendingCandidates.length}件）`} className="gmail-pending-review-section">
          <div className="gmail-candidate-list draft-candidate-filtered-list">
            {pendingCandidates.map((c) => renderCandidateCard(c, true))}
          </div>
        </SectionCard>
      )}

      {approvedCandidates.length > 0 && (
        <SectionCard title={`Gmail下書き作成（${approvedCandidates.length}件）`}>
          <div className="gmail-candidate-list draft-candidate-filtered-list">
            {approvedCandidates.map((c) => renderCandidateCard(c, false))}
          </div>
        </SectionCard>
      )}

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
          candidate={approveCandidate}
          approving={approving}
          onConfirm={() => void handleConfirmApprove()}
          onCancel={() => !approving && setApproveCandidate(null)}
        />
      )}
    </div>
  );
}
