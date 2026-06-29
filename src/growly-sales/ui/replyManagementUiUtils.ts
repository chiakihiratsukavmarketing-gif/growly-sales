import type { Lead, ReplyStatus } from '../../types/lead.js';
import {
  OUTREACH_NEXT_ACTIONS,
  isAwaitingReplyLead,
  inferNextActionForLead,
} from '../workflow/replyManagement.js';
import {
  REPLY_MANAGEMENT_UI_STATUSES,
  REPLY_SUMMARY_MAX_LENGTH,
  inferNextActionFromReplyStatus,
  replyStatusLabel,
} from '../workflow/replyManagementValidation.js';

export { REPLY_MANAGEMENT_UI_STATUSES, REPLY_SUMMARY_MAX_LENGTH, inferNextActionFromReplyStatus };

export const NEXT_ACTION_OPTIONS = [...OUTREACH_NEXT_ACTIONS];

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

export function fromDatetimeLocalValue(value: string): string | null {
  if (!value.trim()) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function leadToReplyFormDraft(lead: Lead): ReplyFormDraft {
  return {
    replyStatus: isUiReplyStatus(lead.replyStatus) ? lead.replyStatus : 'none',
    replySummary: lead.replySummary ?? lead.replyMemo ?? '',
    repliedAtLocal: toDatetimeLocalValue(lead.repliedAt ?? lead.replyReceivedAt),
    followUpDueAt: lead.followUpDueAt ?? lead.followUpDate ?? '',
    nextAction: lead.nextAction || inferNextActionForLead(lead),
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
  if (replyStatus === 'none') {
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
    default:
      if (inferNextActionForLead(lead) === 'フォローアップ') return 'follow_up';
      return isAwaitingReplyLead(lead) ? 'awaiting' : 'follow_up';
  }
}

export function getReplyRowClass(lead: Lead): string {
  return `reply-row reply-row-${getReplyRowCategory(lead)}`;
}

export function getReplyRowTag(lead: Lead): string {
  return replyStatusLabel(
    isUiReplyStatus(lead.replyStatus) ? lead.replyStatus : 'none'
  );
}

export function formatReplySummaryPreview(summary: string): string {
  const trimmed = summary.trim();
  if (!trimmed) return '（なし）';
  if (trimmed.length <= 80) return trimmed;
  return `${trimmed.slice(0, 80)}…`;
}

export function buildReplyFormPayload(draft: ReplyFormDraft) {
  return {
    replyStatus: draft.replyStatus,
    replySummary: draft.replySummary.trim(),
    repliedAt: fromDatetimeLocalValue(draft.repliedAtLocal),
    followUpDueAt: draft.followUpDueAt.trim() || null,
    nextAction: draft.nextAction,
  };
}

export function hasDraftChanges(lead: Lead, draft: ReplyFormDraft): boolean {
  const original = leadToReplyFormDraft(lead);
  const payload = buildReplyFormPayload(draft);
  const originalPayload = buildReplyFormPayload(original);
  return JSON.stringify(payload) !== JSON.stringify(originalPayload);
}
