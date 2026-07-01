import type { Lead, ReplyStatus } from '../../types/lead.js';
import {
  inferNextActionForLead,
  isAwaitingReplyLead,
  resolveNextActionForLead,
} from '../workflow/replyManagement.js';
import {
  REPLY_MANAGEMENT_UI_STATUSES,
  REPLY_SUMMARY_MAX_LENGTH,
  inferNextActionFromReplyStatus,
  replyStatusLabel,
  isReplyManagementApiStatus,
} from '../workflow/replyManagementValidation.js';

export { REPLY_MANAGEMENT_UI_STATUSES, REPLY_SUMMARY_MAX_LENGTH, inferNextActionFromReplyStatus };

/** 返信管理フォーム「次の対応」選択肢（保存値 → UIラベル） */
export const REPLY_NEXT_STEP_OPTIONS = [
  { value: '返信待ち', label: '返信待ち' },
  { value: 'フォローアップ', label: '再連絡' },
  { value: '対象外', label: '対応不要' },
  { value: '要確認', label: '要確認' },
] as const;

export const NEXT_ACTION_OPTIONS = REPLY_NEXT_STEP_OPTIONS.map((o) => o.value);

export interface ReplyFormDraft {
  replyStatus: ReplyStatus;
  replySummary: string;
  repliedAtLocal: string;
  followUpDueAt: string;
  nextAction: string;
  nextActionManual: boolean;
}

export function toDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

export function toDateInputValue(value: string | null | undefined): string {
  if (!value?.trim()) return '';
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function fromDatetimeLocalValue(value: string): string | null {
  if (!value.trim()) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function leadToReplyFormDraft(lead: Lead): ReplyFormDraft {
  const replyStatus = isReplyManagementApiStatus(lead.replyStatus)
    ? lead.replyStatus
    : isUiReplyStatus(lead.replyStatus)
      ? lead.replyStatus
      : 'none';
  return {
    replyStatus,
    replySummary: lead.replySummary ?? lead.replyMemo ?? '',
    repliedAtLocal: toDatetimeLocalValue(lead.repliedAt ?? lead.replyReceivedAt),
    followUpDueAt: toDateInputValue(lead.followUpDueAt ?? lead.followUpDate),
    nextAction: resolveNextActionForLead(lead),
    nextActionManual: false,
  };
}

function isUiReplyStatus(status: ReplyStatus): status is (typeof REPLY_MANAGEMENT_UI_STATUSES)[number] {
  return (REPLY_MANAGEMENT_UI_STATUSES as readonly string[]).includes(status);
}

export function applyReplyStatusToDraft(
  draft: ReplyFormDraft,
  replyStatus: ReplyStatus
): ReplyFormDraft {
  const next: ReplyFormDraft = { ...draft, replyStatus };
  if (!draft.nextActionManual) {
    next.nextAction = inferNextActionFromReplyStatus(replyStatus);
  }
  if (replyStatus === 'declined' || replyStatus === 'bounced') {
    next.nextAction = '対象外';
    next.nextActionManual = true;
  }
  if (replyStatus === 'none' || replyStatus === 'no_reply') {
    next.repliedAtLocal = '';
  }
  return next;
}

export type ReplyRowCategory =
  | 'awaiting'
  | 'replied'
  | 'interested'
  | 'requested_report'
  | 'declined'
  | 'bounced'
  | 'follow_up';

export function getReplyRowCategory(lead: Lead): ReplyRowCategory {
  switch (lead.replyStatus) {
    case 'requested_report':
      return 'requested_report';
    case 'bounced':
      return 'bounced';
    case 'declined':
      return 'declined';
    case 'interested':
      return 'interested';
    case 'replied':
      return 'replied';
    case 'none':
      return 'awaiting';
    case 'no_reply':
      return 'declined';
    default:
      if (inferNextActionForLead(lead) === 'フォローアップ') return 'follow_up';
      return isAwaitingReplyLead(lead) ? 'awaiting' : 'follow_up';
  }
}

export function getReplyRowClass(lead: Lead): string {
  return `reply-row reply-row-${getReplyRowCategory(lead)}`;
}

export function getReplyRowTag(lead: Lead): string {
  const status = isReplyManagementApiStatus(lead.replyStatus)
    ? lead.replyStatus
    : isUiReplyStatus(lead.replyStatus)
      ? lead.replyStatus
      : 'none';
  return replyStatusLabel(status);
}

export function formatReplySummaryPreview(summary: string): string {
  const trimmed = summary.trim();
  if (!trimmed) return '（なし）';
  if (trimmed.length <= 80) return trimmed;
  return `${trimmed.slice(0, 80)}…`;
}

export function requiresFollowUpDueDate(nextAction: string): boolean {
  return nextAction === 'フォローアップ';
}

export function requiresReplySummary(draft: ReplyFormDraft): boolean {
  if (draft.replyStatus === 'none' || draft.replyStatus === 'no_reply') return false;
  if (draft.nextAction === '対象外') return false;
  return true;
}

export function buildReplyFormPayload(draft: ReplyFormDraft) {
  const followUpDueAt =
    draft.nextAction === '対象外'
      ? null
      : draft.followUpDueAt.trim()
        ? draft.followUpDueAt.trim()
        : null;
  return {
    replyStatus: draft.replyStatus,
    replySummary: draft.replySummary.trim(),
    repliedAt: fromDatetimeLocalValue(draft.repliedAtLocal),
    followUpDueAt,
    nextAction: draft.nextAction,
  };
}

export function hasDraftChanges(lead: Lead, draft: ReplyFormDraft): boolean {
  const original = leadToReplyFormDraft(lead);
  const payload = buildReplyFormPayload(draft);
  const originalPayload = buildReplyFormPayload(original);
  return JSON.stringify(payload) !== JSON.stringify(originalPayload);
}
