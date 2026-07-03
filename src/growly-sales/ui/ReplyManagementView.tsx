import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Lead } from '../../types/lead.js';
import { fetchLeads } from './api.js';
import { updateLeadReplyManagementApi } from './communicationApi.js';
import {
  isAwaitingReplyLead,
  needsFollowUpDateSetup,
  resolveNextActionForLead,
} from '../workflow/replyManagement.js';
import {
  buildReplyFormPayload,
  leadToReplyFormDraft,
  REPLY_MANAGEMENT_UI_STATUSES,
  REPLY_NEXT_STEP_OPTIONS,
  applyReplyStatusToDraft,
  REPLY_SUMMARY_MAX_LENGTH,
  requiresFollowUpDueDate,
  requiresReplySummary,
  type ReplyFormDraft,
} from './replyManagementUiUtils.js';
import { replyStatusLabel as workflowReplyStatusLabel } from '../workflow/replyManagementValidation.js';
import { replyStatusLabel, nextActionLabel } from './displayLabels.js';
import { PageHeader } from './common/PageHeader.js';
import { TwoPaneLayout } from './common/TwoPaneLayout.js';
import { EmptyState } from './common/EmptyState.js';
import { SearchAndFilterBar } from './common/SearchAndFilterBar.js';
import { FilterEmptyState } from './common/FilterEmptyState.js';
import { ReplyManagementConfirmDialog } from './ReplyManagementConfirmDialog.js';
import {
  filterByCompanyName,
  matchesReplyManagementFilter,
  REPLY_MANAGEMENT_FILTER_OPTIONS,
} from './leadFilterUtils.js';

interface ReplyManagementViewProps {
  onError: (message: string) => void;
  onUpdated?: (lead: Lead) => void;
  refreshKey?: number;
  highlightLeadId?: string | null;
}

function startOfToday(): Date {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
}

function formatSentDate(lead: Lead): string {
  const sentAt = lead.manualSentAt ?? null;
  if (!sentAt) return '—';
  const d = new Date(sentAt);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('ja-JP');
}

function elapsedDays(lead: Lead, today: Date): number | null {
  const sentAt = lead.manualSentAt ?? null;
  if (!sentAt) return null;
  const t = Date.parse(sentAt);
  if (!Number.isFinite(t)) return null;
  return Math.floor((today.getTime() - t) / (24 * 3600 * 1000));
}

function replyListStatusLabel(lead: Lead): string {
  if (resolveNextActionForLead(lead) === '対象外') return '対応不要';
  if (needsFollowUpDateSetup(lead)) return 'フォロー日未設定';
  return replyStatusLabel(lead.replyStatus);
}

function sortReplyLeads(leads: Lead[], today: Date): Lead[] {
  return [...leads].sort((a, b) => {
    const aFollow = needsFollowUpDateSetup(a) ? 1 : 0;
    const bFollow = needsFollowUpDateSetup(b) ? 1 : 0;
    if (aFollow !== bFollow) return aFollow - bFollow;
    const da = elapsedDays(a, today) ?? -1;
    const db = elapsedDays(b, today) ?? -1;
    return db - da;
  });
}

export function ReplyManagementView({
  onError,
  onUpdated,
  refreshKey = 0,
  highlightLeadId = null,
}: ReplyManagementViewProps) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ReplyFormDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const formScrollRef = useRef<HTMLElement>(null);
  const listScrollRef = useRef<HTMLUListElement>(null);

  const today = useMemo(() => startOfToday(), []);

  const contactedLeads = useMemo(
    () =>
      leads.filter((l) => l.sendStatus === 'sent' || l.sendStatus === 'manual_sent'),
    [leads]
  );

  const filteredLeads = useMemo(() => {
    let items = contactedLeads;
    items = items.filter((l) => matchesReplyManagementFilter(l, statusFilter));
    items = filterByCompanyName(items, search, (l) => l.companyName);
    return sortReplyLeads(items, today);
  }, [contactedLeads, statusFilter, search, today]);

  const selectedLead = filteredLeads.find((l) => l.id === selectedId) ?? null;

  const clearFilters = useCallback(() => {
    setSearch('');
    setStatusFilter('all');
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setSuccessMessage(null);
    try {
      const data = await fetchLeads();
      const contacted = data.filter(
        (l) => l.sendStatus === 'sent' || l.sendStatus === 'manual_sent'
      );
      setLeads(contacted);
    } catch (err) {
      onError(err instanceof Error ? err.message : '返信管理の読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  useEffect(() => {
    if (!selectedLead) {
      setDraft(null);
      return;
    }
    setDraft(leadToReplyFormDraft(selectedLead));
    formScrollRef.current?.scrollTo(0, 0);
  }, [selectedLead?.id]);

  useEffect(() => {
    if (!highlightLeadId || loading) return;
    if (!contactedLeads.some((l) => l.id === highlightLeadId)) return;
    setSearch('');
    setStatusFilter('all');
  }, [highlightLeadId, loading, contactedLeads]);

  useEffect(() => {
    if (filteredLeads.length === 0) {
      setSelectedId(null);
      return;
    }
    if (highlightLeadId && filteredLeads.some((l) => l.id === highlightLeadId)) {
      setSelectedId(highlightLeadId);
      return;
    }
    if (!selectedId || !filteredLeads.some((l) => l.id === selectedId)) {
      setSelectedId(filteredLeads[0].id);
    }
  }, [filteredLeads, selectedId, highlightLeadId]);

  useEffect(() => {
    if (!selectedId) return;
    const row = listScrollRef.current?.querySelector('li.selected');
    const pane = listScrollRef.current;
    if (!row || !pane) return;
    const rowTop = (row as HTMLElement).offsetTop;
    const rowBottom = rowTop + (row as HTMLElement).offsetHeight;
    if (rowTop < pane.scrollTop) {
      pane.scrollTop = rowTop;
    } else if (rowBottom > pane.scrollTop + pane.clientHeight) {
      pane.scrollTop = rowBottom - pane.clientHeight;
    }
  }, [selectedId]);

  async function saveDraft(targetLead: Lead, nextDraft: ReplyFormDraft): Promise<void> {
    setSaving(true);
    try {
      const updated = await updateLeadReplyManagementApi(
        targetLead.id,
        buildReplyFormPayload(nextDraft)
      );
      setSuccessMessage(`${updated.companyName} の返信状況を保存しました`);
      onUpdated?.(updated);
      await load();
    } catch (err) {
      onError(err instanceof Error ? err.message : '返信状況の保存に失敗しました');
    } finally {
      setSaving(false);
      setConfirmOpen(false);
    }
  }

  function handleSaveClick(): void {
    if (!selectedLead || !draft) return;
    if (requiresReplySummary(draft) && !draft.replySummary.trim()) {
      onError('返信ありの場合は返信要約を入力してください');
      return;
    }
    if (requiresFollowUpDueDate(draft.nextAction) && !draft.followUpDueAt.trim()) {
      onError('再連絡の場合はフォロー予定日を入力してください');
      return;
    }
    setConfirmOpen(true);
  }

  async function handleNoReplyConfirmed(): Promise<void> {
    if (!selectedLead) return;
    const nextDraft = applyReplyStatusToDraft(leadToReplyFormDraft(selectedLead), 'no_reply');
    await saveDraft(selectedLead, nextDraft);
  }

  if (loading) return <p className="loading">返信管理を読み込み中…</p>;

  const listPane = (
    <div className="pane-inner pane-inner-list">
      <div className="pane-list-header">
        <strong>返信確認・フォロー設定</strong>
      </div>
      <SearchAndFilterBar
        searchValue={search}
        onSearchChange={setSearch}
        filterValue={statusFilter}
        onFilterChange={setStatusFilter}
        filterOptions={REPLY_MANAGEMENT_FILTER_OPTIONS}
        resultCount={filteredLeads.length}
        totalCount={contactedLeads.length}
        onClear={clearFilters}
      />
      {contactedLeads.length === 0 ? (
        <div className="pane-inner-empty">
          <EmptyState
            title="Gmail確認待ちの会社はありません"
            reason="送信記録済みで、返信確認が必要な Lead がありません。"
            nextHint="未送信の下書きがあれば送信記録タブを確認してください。"
          />
        </div>
      ) : filteredLeads.length === 0 ? (
        <div className="pane-inner-empty">
          <FilterEmptyState onClear={clearFilters} />
        </div>
      ) : (
        <ul className="reply-list-pane pane-list-scroll" ref={listScrollRef}>
          {filteredLeads.map((lead) => {
            const days = elapsedDays(lead, today);
            const active = lead.id === selectedId;
            return (
              <li key={lead.id} className={active ? 'selected' : ''}>
                <button
                  type="button"
                  className={`reply-list-item ${active ? 'selected' : ''}`}
                  onClick={() => setSelectedId(lead.id)}
                >
                  <span className="reply-list-company">{lead.companyName}</span>
                  <span className="reply-list-meta">
                    送信 {formatSentDate(lead)}
                    {days !== null ? ` · ${days}日経過` : ''}
                  </span>
                  <span className="reply-list-status">{replyListStatusLabel(lead)}</span>
                  <span className="reply-list-next">{nextActionLabel(lead.nextAction)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );

  const formPane =
    !selectedLead || !draft ? (
      <div className="pane-inner pane-inner-empty">
        <EmptyState title="左の一覧から会社を選択してください" />
      </div>
    ) : (
      <div className="pane-inner pane-inner-list">
        <section className="reply-form-pane pane-list-scroll" ref={formScrollRef}>
          <h3 className="reply-form-title">{selectedLead.companyName}</h3>
          <p className="hint">送信先: {selectedLead.emailCandidates[0] ?? '—'}</p>

          <div className="reply-form-actions-top">
            {isAwaitingReplyLead(selectedLead) && (
              <button
                type="button"
                className="btn btn-secondary"
                disabled={saving}
                onClick={() => void handleNoReplyConfirmed()}
              >
                返信なしで確認済みにする
              </button>
            )}
          </div>

          <label className="reply-field">
            <span className="reply-field-label">返信状態</span>
            <select
              value={draft.replyStatus}
              onChange={(e) =>
                setDraft(
                  applyReplyStatusToDraft(draft, e.target.value as ReplyFormDraft['replyStatus'])
                )
              }
            >
              {REPLY_MANAGEMENT_UI_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {workflowReplyStatusLabel(status)}
                </option>
              ))}
            </select>
          </label>

          <label className="reply-field">
            <span className="reply-field-label">次の対応</span>
            <select
              value={draft.nextAction}
              onChange={(e) =>
                setDraft({ ...draft, nextAction: e.target.value, nextActionManual: true })
              }
            >
              {REPLY_NEXT_STEP_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          {requiresFollowUpDueDate(draft.nextAction) && (
            <label className="reply-field">
              <span className="reply-field-label">フォロー予定日</span>
              <input
                type="date"
                value={draft.followUpDueAt}
                onChange={(e) => setDraft({ ...draft, followUpDueAt: e.target.value })}
              />
            </label>
          )}

          {requiresReplySummary(draft) && (
            <>
              <label className="reply-field">
                <span className="reply-field-label">返信日時</span>
                <input
                  type="datetime-local"
                  value={draft.repliedAtLocal}
                  onChange={(e) => setDraft({ ...draft, repliedAtLocal: e.target.value })}
                />
              </label>

              <label className="reply-field reply-field-wide">
                <span className="reply-field-label">返信要約（短いメモ）</span>
                <textarea
                  rows={3}
                  maxLength={REPLY_SUMMARY_MAX_LENGTH}
                  placeholder="返信内容の要約のみ（本文は保存しません）"
                  value={draft.replySummary}
                  onChange={(e) => setDraft({ ...draft, replySummary: e.target.value })}
                />
              </label>
            </>
          )}

          <div className="reply-form-footer">
            <button
              type="button"
              className="btn btn-primary"
              disabled={
                saving ||
                (requiresReplySummary(draft) && !draft.replySummary.trim()) ||
                (requiresFollowUpDueDate(draft.nextAction) && !draft.followUpDueAt.trim())
              }
              onClick={handleSaveClick}
            >
              この会社の返信状況を保存
            </button>
          </div>
        </section>
      </div>
    );

  return (
    <div className="reply-management-view tab-workspace">
      <PageHeader
        title="返信管理"
        subtitle="Gmail受信トレイを確認し、返信があった会社だけ要約を記録します。"
      />
      {successMessage && <div className="alert alert-success">{successMessage}</div>}
      <TwoPaneLayout left={listPane} right={formPane} leftAriaLabel="返信確認対象" rightAriaLabel="返信記録フォーム" />
      {confirmOpen && selectedLead && draft && (
        <ReplyManagementConfirmDialog
          lead={selectedLead}
          draft={draft}
          saving={saving}
          onConfirm={() => void saveDraft(selectedLead, draft)}
          onCancel={() => !saving && setConfirmOpen(false)}
        />
      )}
    </div>
  );
}
