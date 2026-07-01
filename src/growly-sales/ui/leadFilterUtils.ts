import type { Lead } from '../../types/lead.js';
import {
  hasContactForm,
  hasEmailCandidates,
  isFormCopyOnlyLead,
} from '../analytics/contactPathTypes.js';
import {
  findDuplicateCandidateGroups,
  isDuplicateCandidate,
  isExclusionCandidate,
  isFormOutreachTarget,
  isGmailOutreachTarget,
  isNeedsReviewLead,
} from '../workflow/leadPhaseBInventory.js';
import {
  isAwaitingReplyLead,
  needsFollowUpDateSetup,
  resolveNextActionForLead,
} from '../workflow/replyManagement.js';
import type { GmailDraftCandidateDetail } from './gmailDraftCandidatesApi.js';
import type { ExternalLeadCandidate } from '../adapters/externalLeadCandidateTypes.js';
import type { ManualGmailSendPreview } from '../workflow/recordManualGmailSent.js';

export interface FilterOption {
  value: string;
  label: string;
}

/** 検索用に正規化（NFKC・小文字・空白除去） */
export function normalizeSearchText(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/\s+/g, '');
}

export function matchesCompanySearch(companyName: string, query: string): boolean {
  const q = normalizeSearchText(query);
  if (!q) return true;
  const normalized = normalizeSearchText(companyName);
  return normalized.includes(q);
}

export function filterByCompanyName<T>(
  items: T[],
  query: string,
  getName: (item: T) => string
): T[] {
  if (!query.trim()) return items;
  return items.filter((item) => matchesCompanySearch(getName(item), query));
}

export function collectUniqueAreas(leads: Lead[]): string[] {
  const areas = new Set<string>();
  for (const lead of leads) {
    const area = lead.area?.trim();
    if (area) areas.add(area);
  }
  return [...areas].sort((a, b) => a.localeCompare(b, 'ja'));
}

// ── Lead一覧 ──

export const LEAD_LIST_FILTER_OPTIONS: FilterOption[] = [
  { value: 'all', label: 'すべて' },
  { value: 'gmail_outreach', label: 'Gmail営業対象' },
  { value: 'form_outreach', label: 'フォーム営業対象' },
  { value: 'phase_b_needs_review', label: '要確認' },
  { value: 'exclusion_candidate', label: '除外候補' },
  { value: 'duplicate_candidate', label: '重複候補' },
  { value: 'pending_review', label: '承認待ち' },
  { value: 'approved', label: '承認済み' },
  { value: 'draft_created', label: '下書き済み' },
  { value: 'sent', label: '送信済み' },
  { value: 'form_only', label: 'フォームのみ' },
  { value: 'has_email', label: 'メールあり' },
  { value: 'no_email', label: 'メールなし' },
  { value: 'do_not_contact', label: '連絡禁止' },
  { value: 'needs_revision', label: '修正が必要' },
  { value: 'rejected', label: '却下' },
];

/** 重複候補フィルター用（全Leadリストを渡す） */
export function matchesLeadListFilterWithContext(
  lead: Lead,
  filter: string,
  allLeads: Lead[]
): boolean {
  if (filter === 'duplicate_candidate') {
    return isDuplicateCandidate(lead, findDuplicateCandidateGroups(allLeads));
  }
  return matchesLeadListFilter(lead, filter);
}

export function matchesLeadListFilter(lead: Lead, filter: string): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'gmail_outreach':
      return isGmailOutreachTarget(lead);
    case 'form_outreach':
      return isFormOutreachTarget(lead);
    case 'phase_b_needs_review':
      return isNeedsReviewLead(lead);
    case 'exclusion_candidate':
      return isExclusionCandidate(lead);
    case 'duplicate_candidate':
      return false;
    case 'pending_review':
      return lead.humanReviewStatus === 'pending';
    case 'approved':
      return lead.humanReviewStatus === 'approved';
    case 'draft_created':
      return lead.gmailDraftStatus === 'draft_created';
    case 'sent':
      return lead.sendStatus === 'sent' || lead.sendStatus === 'manual_sent';
    case 'form_only':
      return isFormCopyOnlyLead(lead);
    case 'has_email':
      return hasEmailCandidates(lead);
    case 'no_email':
      return !hasEmailCandidates(lead);
    case 'do_not_contact':
      return lead.doNotContact;
    case 'needs_revision':
      return lead.reviewStatus === 'revise';
    case 'rejected':
      return lead.humanReviewStatus === 'rejected';
    default:
      return true;
  }
}

export function matchesLeadAreaFilter(lead: Lead, areaFilter: string): boolean {
  if (!areaFilter || areaFilter === 'all') return true;
  return (lead.area?.trim() ?? '') === areaFilter;
}

// ── 返信管理 ──

export const REPLY_MANAGEMENT_FILTER_OPTIONS: FilterOption[] = [
  { value: 'all', label: 'すべて' },
  { value: 'gmail_check', label: 'Gmail確認待ち' },
  { value: 'awaiting_reply', label: '返信待ち' },
  { value: 'no_reply_confirmed', label: '返信なし確認済み' },
  { value: 'replied', label: '返信あり' },
  { value: 'followup_unset', label: 'フォロー日未設定' },
  { value: 'followup_set', label: 'フォロー予定あり' },
  { value: 'declined', label: '辞退' },
  { value: 'bounced', label: 'バウンス' },
];

export function matchesReplyManagementFilter(lead: Lead, filter: string): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'gmail_check':
      return isAwaitingReplyLead(lead);
    case 'awaiting_reply':
      return lead.replyStatus === 'none';
    case 'no_reply_confirmed':
      return lead.replyStatus === 'no_reply';
    case 'replied':
      return (
        lead.replyStatus === 'replied' ||
        lead.replyStatus === 'interested' ||
        lead.replyStatus === 'requested_report' ||
        lead.replyStatus === 'follow_up_needed' ||
        lead.replyStatus === 'meeting_scheduled'
      );
    case 'followup_unset':
      return needsFollowUpDateSetup(lead);
    case 'followup_set':
      return Boolean(lead.followUpDueAt?.trim() || lead.followUpDate?.trim());
    case 'declined':
      return lead.replyStatus === 'declined' || lead.replyStatus === 'not_interested';
    case 'bounced':
      return lead.replyStatus === 'bounced';
    default:
      return true;
  }
}

// ── 下書き候補 ──

export const DRAFT_CANDIDATE_FILTER_OPTIONS: FilterOption[] = [
  { value: 'all', label: 'すべて' },
  { value: 'can_create', label: '作成可能' },
  { value: 'pending_review', label: '承認待ち' },
  { value: 'created', label: '作成済み' },
  { value: 'excluded', label: '除外済み' },
];

export function matchesDraftCandidateFilter(
  candidate: GmailDraftCandidateDetail,
  filter: string
): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'can_create':
      return candidate.canCreate;
    case 'pending_review':
      return candidate.humanReviewStatus === 'pending';
    case 'created':
      return candidate.gmailDraftStatus === 'draft_created';
    case 'excluded':
      return !candidate.canCreate;
    default:
      return true;
  }
}

// ── 送信記録 ──

export const SEND_RECORD_FILTER_OPTIONS: FilterOption[] = [
  { value: 'all', label: 'すべて' },
  { value: 'pending_draft', label: '未送信下書きあり' },
  { value: 'sent', label: '送信済み' },
  { value: 'reply_unconfirmed', label: '返信未確認' },
  { value: 'replied', label: '返信あり' },
  { value: 'no_reply', label: '返信なし' },
  { value: 'bounced', label: 'バウンス' },
  { value: 'declined', label: '辞退' },
];

export type SendRecordRow =
  | { kind: 'pending'; item: ManualGmailSendPreview }
  | { kind: 'sent'; lead: Lead };

export function matchesSendRecordRow(row: SendRecordRow, filter: string): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'pending_draft':
      return row.kind === 'pending';
    case 'sent':
      return row.kind === 'sent';
    case 'reply_unconfirmed':
      return (
        row.kind === 'sent' &&
        (row.lead.replyStatus === 'none' || !row.lead.replyStatus)
      );
    case 'replied':
      return (
        row.kind === 'sent' &&
        row.lead.replyStatus !== 'none' &&
        row.lead.replyStatus !== 'no_reply' &&
        row.lead.replyStatus !== 'bounced' &&
        row.lead.replyStatus !== 'declined' &&
        row.lead.replyStatus !== 'not_interested'
      );
    case 'no_reply':
      return row.kind === 'sent' && row.lead.replyStatus === 'no_reply';
    case 'bounced':
      return row.kind === 'sent' && row.lead.replyStatus === 'bounced';
    case 'declined':
      return (
        row.kind === 'sent' &&
        (row.lead.replyStatus === 'declined' || row.lead.replyStatus === 'not_interested')
      );
    default:
      return true;
  }
}

export function sendRecordRowCompanyName(row: SendRecordRow): string {
  return row.kind === 'pending' ? row.item.companyName : row.lead.companyName;
}

// ── フォローアップ ──

export type FollowUpDueBucket = 'today' | 'overdue' | 'this_week' | 'unset' | 'no_action';

export const FOLLOW_UP_FILTER_OPTIONS: FilterOption[] = [
  { value: 'all', label: 'すべて' },
  { value: 'today', label: '今日対応' },
  { value: 'overdue', label: '期限切れ' },
  { value: 'this_week', label: '今週対応' },
  { value: 'unset', label: '日付未設定' },
  { value: 'no_action', label: '対応不要' },
];

export function classifyFollowUpDue(lead: Lead, today: Date): FollowUpDueBucket {
  if (lead.doNotContact) return 'no_action';
  const contacted = lead.sendStatus === 'sent' || lead.sendStatus === 'manual_sent';
  const resolvedNext = resolveNextActionForLead(lead);
  const isFollowTarget =
    resolvedNext === 'フォローアップ' ||
    lead.replyStatus === 'requested_report' ||
    lead.replyStatus === 'follow_up_needed';

  if (!contacted) return 'no_action';
  if (resolvedNext === '対象外') return 'no_action';
  if (resolvedNext === '要確認') return 'no_action';
  if (!isFollowTarget) return 'no_action';

  if (!lead.followUpDueAt?.trim()) return 'unset';
  const t = Date.parse(lead.followUpDueAt);
  if (!Number.isFinite(t)) return 'unset';
  const due = new Date(t);
  due.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((due.getTime() - today.getTime()) / (24 * 3600 * 1000));
  if (diffDays < 0) return 'overdue';
  if (diffDays === 0) return 'today';
  if (diffDays <= 7) return 'this_week';
  return 'this_week';
}

export function matchesFollowUpFilter(lead: Lead, filter: string, today: Date): boolean {
  if (filter === 'all') return true;
  return classifyFollowUpDue(lead, today) === filter;
}

// ── 候補収集 ──

export const CANDIDATE_COLLECTION_FILTER_OPTIONS: FilterOption[] = [
  { value: 'all', label: 'すべて' },
  { value: 'approval_pending', label: 'Lead化承認待ち' },
  { value: 'approved', label: '承認済み' },
  { value: 'has_email', label: 'メールあり' },
  { value: 'has_form', label: 'フォームあり' },
  { value: 'no_email', label: 'メールなし' },
  { value: 'form_only', label: 'フォームのみ' },
  { value: 'excluded', label: '除外' },
];

export function matchesExternalCandidateFilter(
  candidate: ExternalLeadCandidate,
  filter: string
): boolean {
  const emails = candidate.emailCandidates ?? [];
  const hasEmail = emails.some((e) => e.trim().length > 0);
  const hasForm = Boolean(candidate.contactFormUrl?.trim());
  const formOnly = !hasEmail && hasForm;

  switch (filter) {
    case 'all':
      return true;
    case 'approval_pending':
      return (
        candidate.importStatus === 'needs_review' ||
        candidate.importStatus === 'preview' ||
        candidate.pipelineStatus === 'needs_review'
      );
    case 'approved':
      return (
        candidate.importStatus === 'approved_for_lead' ||
        candidate.importStatus === 'approved_for_import'
      );
    case 'has_email':
      return hasEmail;
    case 'has_form':
      return hasForm;
    case 'no_email':
      return !hasEmail;
    case 'form_only':
      return formOnly;
    case 'excluded':
      return (
        candidate.importStatus === 'skipped' ||
        candidate.importStatus === 'duplicate' ||
        candidate.pipelineStatus === 'excluded' ||
        candidate.pipelineStatus === 'duplicate'
      );
    default:
      return true;
  }
}
