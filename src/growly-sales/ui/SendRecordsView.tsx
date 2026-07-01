import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Lead } from '../../types/lead.js';
import type { ManualGmailSendPreview } from '../workflow/recordManualGmailSent.js';
import { fetchLeads } from './api.js';
import {
  fetchSendRecordPending,
  recordManualGmailSentApi,
} from './sendRecordApi.js';
import { SectionCard } from './SectionCard.js';
import { ManualSendRecordDialog } from './ManualSendRecordDialog.js';
import { PageHeader } from './common/PageHeader.js';
import { EmptyState } from './common/EmptyState.js';
import { SearchAndFilterBar } from './common/SearchAndFilterBar.js';
import { FilterEmptyState } from './common/FilterEmptyState.js';
import { replyStatusLabel } from './displayLabels.js';
import { nextActionLabel } from './leadDisplayUtils.js';
import {
  filterByCompanyName,
  matchesSendRecordRow,
  SEND_RECORD_FILTER_OPTIONS,
  sendRecordRowCompanyName,
  type SendRecordRow,
} from './leadFilterUtils.js';
import type { SalesFlowTab } from './GrowlySalesDashboard.js';

interface SendRecordsViewProps {
  onError: (message: string) => void;
  onRecordSuccess?: (lead: Lead) => void;
  refreshKey?: number;
  highlightLeadId?: string | null;
  onNavigateToTab?: (tab: SalesFlowTab) => void;
}

function isSentLead(lead: Lead): boolean {
  return lead.sendStatus === 'sent' || lead.sendStatus === 'manual_sent';
}

function formatSentDate(lead: Lead): string {
  if (lead.manualSentAt) {
    return new Date(lead.manualSentAt).toLocaleDateString('ja-JP');
  }
  return '—';
}

function replyDisplayLabel(lead: Lead): string {
  const status = lead.replyStatus ?? 'none';
  if (status === 'none' && (lead.sendStatus === 'sent' || lead.sendStatus === 'manual_sent')) {
    return '未確認';
  }
  return replyStatusLabel(status);
}

export function SendRecordsView({
  onError,
  onRecordSuccess,
  refreshKey = 0,
  highlightLeadId = null,
  onNavigateToTab,
}: SendRecordsViewProps) {
  const [pending, setPending] = useState<ManualGmailSendPreview[]>([]);
  const [sentLeads, setSentLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogPreview, setDialogPreview] = useState<ManualGmailSendPreview | null>(null);
  const [recording, setRecording] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const highlightRef = useRef<HTMLElement | null>(null);

  const allRows = useMemo((): SendRecordRow[] => {
    const pendingRows: SendRecordRow[] = pending.map((item) => ({ kind: 'pending', item }));
    const sentRows: SendRecordRow[] = sentLeads.map((lead) => ({ kind: 'sent', lead }));
    return [...pendingRows, ...sentRows];
  }, [pending, sentLeads]);

  const filteredRows = useMemo(() => {
    let rows = allRows.filter((row) => matchesSendRecordRow(row, statusFilter));
    rows = filterByCompanyName(rows, search, sendRecordRowCompanyName);
    return rows;
  }, [allRows, statusFilter, search]);

  const pendingFiltered = filteredRows.filter((r) => r.kind === 'pending');
  const sentFiltered = filteredRows.filter((r) => r.kind === 'sent');

  const clearFilters = useCallback(() => {
    setSearch('');
    setStatusFilter('all');
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setSuccessMessage(null);
    try {
      const [pendingRes, allLeads] = await Promise.all([fetchSendRecordPending(), fetchLeads()]);
      setPending(pendingRes.pending);
      setSentLeads(
        allLeads
          .filter(isSentLead)
          .sort((a, b) => {
            const ta = a.manualSentAt ?? a.updatedAt;
            const tb = b.manualSentAt ?? b.updatedAt;
            return tb.localeCompare(ta);
          })
      );
    } catch (err) {
      onError(err instanceof Error ? err.message : '送信記録の読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  useEffect(() => {
    if (!highlightLeadId || loading) return;
    const el = highlightRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlightLeadId, loading, pending]);

  async function handleConfirmRecord(): Promise<void> {
    if (!dialogPreview) return;
    setRecording(true);
    try {
      const result = await recordManualGmailSentApi(dialogPreview.leadId, {
        draftId: dialogPreview.draftId,
      });
      setDialogPreview(null);
      setSuccessMessage(`${result.preview.companyName} を送信済みに記録しました`);
      onRecordSuccess?.(result.lead);
      await load();
    } catch (err) {
      onError(err instanceof Error ? err.message : '手動送信の記録に失敗しました');
      setDialogPreview(null);
    } finally {
      setRecording(false);
    }
  }

  if (loading) return <p className="loading">送信記録を読み込み中…</p>;

  return (
    <div className="send-records-view">
      <PageHeader
        title="送信記録"
        subtitle="Gmailで手動送信した後、ここで記録します。自動送信は行いません。"
      />
      {successMessage && <div className="alert alert-success">{successMessage}</div>}

      <SearchAndFilterBar
        searchValue={search}
        onSearchChange={setSearch}
        filterValue={statusFilter}
        onFilterChange={setStatusFilter}
        filterOptions={SEND_RECORD_FILTER_OPTIONS}
        resultCount={filteredRows.length}
        totalCount={allRows.length}
        onClear={clearFilters}
      />

      {allRows.length === 0 ? (
        <EmptyState
          title="送信記録はまだありません"
          nextHint="Gmail下書き作成後、手動送信してここで記録してください。"
        />
      ) : filteredRows.length === 0 ? (
        <FilterEmptyState onClear={clearFilters} />
      ) : (
        <>
          {(statusFilter === 'all' || statusFilter === 'pending_draft') && (
            <SectionCard
              title={`未送信・Gmail下書きあり（${pendingFiltered.length}件）`}
              className="send-pending-section send-records-filtered-section"
            >
              {pendingFiltered.length === 0 ? (
                <p className="hint">条件に一致する未送信下書きはありません。</p>
              ) : (
                <div className="pending-record-list">
                  {pendingFiltered.map((row) => {
                    if (row.kind !== 'pending') return null;
                    const item = row.item;
                    const highlighted = highlightLeadId === item.leadId;
                    return (
                      <article
                        key={item.leadId}
                        ref={highlighted ? highlightRef : undefined}
                        className={`pending-record-card ${highlighted ? 'pending-record-highlight' : ''}`}
                      >
                        <div className="pending-record-main">
                          <h4 className="pending-company">{item.companyName}</h4>
                          <p className="pending-meta">To: {item.to}</p>
                          <p className="pending-subject">件名: {item.subject}</p>
                        </div>
                        <div className="pending-record-actions">
                          <p className="pending-hint">Gmailで送信後に押してください</p>
                          <button
                            type="button"
                            className="btn btn-primary"
                            onClick={() => setDialogPreview(item)}
                          >
                            手動送信済みに記録
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </SectionCard>
          )}

          {(statusFilter === 'all' || statusFilter !== 'pending_draft') && sentFiltered.length > 0 && (
            <SectionCard title={`送信済み（${sentFiltered.length}件）`} className="send-records-filtered-section">
              <div className="lead-table-wrap">
                <table className="lead-table lead-table-compact">
                  <thead>
                    <tr>
                      <th>会社名</th>
                      <th>送信日</th>
                      <th>返信状態</th>
                      <th>次アクション</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sentFiltered.map((row) => {
                      if (row.kind !== 'sent') return null;
                      const lead = row.lead;
                      return (
                        <tr key={lead.id}>
                          <td className="company-name">{lead.companyName}</td>
                          <td>{formatSentDate(lead)}</td>
                          <td>
                            <span className={`reply-display reply-display-${lead.replyStatus ?? 'none'}`}>
                              {replyDisplayLabel(lead)}
                            </span>
                          </td>
                          <td>{nextActionLabel(lead.nextAction || '—')}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          )}

          {statusFilter !== 'all' &&
            statusFilter !== 'pending_draft' &&
            sentFiltered.length === 0 &&
            pendingFiltered.length === 0 && (
              <FilterEmptyState onClear={clearFilters} />
            )}
        </>
      )}

      {pending.length === 0 && allRows.length > 0 && statusFilter === 'all' && (
        <EmptyState
          title="現在、Gmailで送信待ちの下書きはありません"
          nextHint="次は返信管理で受信確認をしてください。"
          actionLabel="返信管理へ進む"
          onAction={() => onNavigateToTab?.('reply-management')}
        />
      )}

      {dialogPreview && (
        <ManualSendRecordDialog
          preview={dialogPreview}
          recording={recording}
          onConfirm={() => void handleConfirmRecord()}
          onCancel={() => !recording && setDialogPreview(null)}
        />
      )}
    </div>
  );
}
