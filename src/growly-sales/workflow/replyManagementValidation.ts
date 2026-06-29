import type { Lead, ReplyStatus } from '../types/lead.js';
import {
  inferNextActionForLead,
  type OutreachNextAction,
  type ReplyManagementUpdate,
  syncReplyAliasesForExport,
} from './replyManagement.js';

/** 返信管理UIで選択可能な replyStatus */
export const REPLY_MANAGEMENT_UI_STATUSES: readonly ReplyStatus[] = [
  'none',
  'replied',
  'interested',
  'requested_report',
  'declined',
  'bounced',
] as const;

export const REPLY_SUMMARY_MAX_LENGTH = 500;

export class ReplyManagementNotAllowedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReplyManagementNotAllowedError';
  }
}

export class ReplyManagementValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReplyManagementValidationError';
  }
}

export function isReplyManagementUiStatus(value: string): value is ReplyStatus {
  return (REPLY_MANAGEMENT_UI_STATUSES as readonly string[]).includes(value);
}

export function isValidFollowUpDueAt(value: string | null | undefined): boolean {
  if (value === null || value === undefined || value === '') return true;
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return false;
  const [y, m, d] = trimmed.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

/** replyStatus から nextAction を推論（UI用） */
export function inferNextActionFromReplyStatus(replyStatus: ReplyStatus): OutreachNextAction {
  switch (replyStatus) {
    case 'none':
    case 'no_reply':
      return '返信待ち';
    case 'replied':
    case 'interested':
    case 'follow_up_needed':
    case 'meeting_scheduled':
      return 'フォローアップ';
    case 'requested_report':
      return '診断レポート作成';
    case 'declined':
    case 'bounced':
    case 'not_interested':
      return '対象外';
    default:
      return '対象外';
  }
}

export function assertReplyManagementEligible(lead: Lead): void {
  if (lead.sendStatus !== 'sent' && lead.sendStatus !== 'manual_sent') {
    throw new ReplyManagementNotAllowedError(
      '返信管理の更新対象外です（sendStatus=sent または manual_sent のみ）'
    );
  }
}

export function validateReplyManagementUpdatePayload(update: ReplyManagementUpdate): void {
  if (update.replyStatus !== undefined && !isReplyManagementUiStatus(update.replyStatus)) {
    throw new ReplyManagementValidationError(
      `不正な replyStatus です。許可: ${REPLY_MANAGEMENT_UI_STATUSES.join(', ')}`
    );
  }
  if (update.followUpDueAt !== undefined && !isValidFollowUpDueAt(update.followUpDueAt)) {
    throw new ReplyManagementValidationError('followUpDueAt は YYYY-MM-DD 形式で指定してください');
  }
  if (update.replySummary !== undefined && update.replySummary.length > REPLY_SUMMARY_MAX_LENGTH) {
    throw new ReplyManagementValidationError(
      `replySummary は ${REPLY_SUMMARY_MAX_LENGTH} 文字以内にしてください`
    );
  }
}

function formatField(value: string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '（なし）';
  return value;
}

export function buildReplyManagementDiffMemo(before: Lead, after: Lead): string | null {
  const b = syncReplyAliasesForExport(before);
  const a = syncReplyAliasesForExport(after);
  const parts: string[] = [];

  if (b.replyStatus !== a.replyStatus) {
    parts.push(`replyStatus:${b.replyStatus}→${a.replyStatus}`);
  }
  if (b.replySummary !== a.replySummary) {
    parts.push('replySummary:更新');
  }
  if (b.repliedAt !== a.repliedAt) {
    parts.push(`repliedAt:${formatField(b.repliedAt)}→${formatField(a.repliedAt)}`);
  }
  if (b.followUpDueAt !== a.followUpDueAt) {
    parts.push(`followUpDueAt:${formatField(b.followUpDueAt)}→${formatField(a.followUpDueAt)}`);
  }
  if (b.nextAction !== a.nextAction) {
    parts.push(`nextAction:${b.nextAction}→${a.nextAction}`);
  }

  if (parts.length === 0) return null;
  return `返信管理UI更新 / ${parts.join(' / ')}`;
}

export function appendReplyManagementDiffMemo(before: Lead, after: Lead): Lead {
  const diffLine = buildReplyManagementDiffMemo(before, after);
  if (!diffLine) return after;
  if (after.communicationMemo.includes(diffLine)) return after;
  return {
    ...after,
    communicationMemo: [after.communicationMemo, diffLine].filter(Boolean).join(' / '),
  };
}

export function replyStatusLabel(status: ReplyStatus): string {
  const labels: Partial<Record<ReplyStatus, string>> = {
    none: '返信待ち',
    replied: '返信あり',
    interested: '興味あり',
    requested_report: '診断希望',
    declined: '辞退',
    bounced: 'バウンス',
  };
  return labels[status] ?? status;
}

export function isFollowUpTargetLead(lead: Lead): boolean {
  return inferNextActionForLead(lead) === 'フォローアップ';
}
