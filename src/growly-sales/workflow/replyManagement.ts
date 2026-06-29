import type { Lead, ReplyStatus } from '../types/lead.js';

/** 返信管理フェーズで使う nextAction（日本語ラベル） */
export const OUTREACH_NEXT_ACTIONS = [
  '返信待ち',
  'フォローアップ',
  '診断レポート作成',
  '対象外',
] as const;

export type OutreachNextAction = (typeof OUTREACH_NEXT_ACTIONS)[number];

/** 返信管理UIで優先表示する replyStatus */
export const REPLY_MANAGEMENT_STATUSES: readonly ReplyStatus[] = [
  'none',
  'replied',
  'bounced',
  'declined',
  'interested',
  'requested_report',
] as const;

export interface ReplyManagementUpdate {
  replyStatus?: ReplyStatus;
  replySummary?: string;
  nextAction?: OutreachNextAction | string;
  repliedAt?: string | null;
  followUpDueAt?: string | null;
  communicationMemo?: string;
}

export function isOutreachNextAction(value: string): value is OutreachNextAction {
  return (OUTREACH_NEXT_ACTIONS as readonly string[]).includes(value);
}

export function inferNextActionForLead(lead: Lead): OutreachNextAction {
  if (lead.doNotContact || lead.replyStatus === 'declined' || lead.replyStatus === 'not_interested') {
    return '対象外';
  }
  if (lead.replyStatus === 'requested_report') {
    return '診断レポート作成';
  }
  if (
    lead.replyStatus === 'replied' ||
    lead.replyStatus === 'interested' ||
    lead.replyStatus === 'follow_up_needed' ||
    lead.replyStatus === 'meeting_scheduled' ||
    isFollowUpOnlySentLead(lead)
  ) {
    return 'フォローアップ';
  }
  if (lead.sendStatus === 'sent' || lead.sendStatus === 'manual_sent') {
    return '返信待ち';
  }
  return '対象外';
}

export function isFollowUpOnlySentLead(lead: Lead): boolean {
  const contacted = lead.sendStatus === 'sent' || lead.sendStatus === 'manual_sent';
  const engaged =
    lead.replyStatus !== 'none' &&
    lead.replyStatus !== 'no_reply' &&
    lead.replyStatus !== 'bounced';
  return contacted && engaged;
}

export function isAwaitingReplyLead(lead: Lead): boolean {
  return (
    lead.sendStatus === 'sent' &&
    lead.replyStatus === 'none' &&
    !lead.doNotContact &&
    inferNextActionForLead(lead) === '返信待ち'
  );
}

export function countAwaitingReplyLeads(leads: Lead[]): number {
  return leads.filter(isAwaitingReplyLead).length;
}

export function selectAwaitingReplyLeads(leads: Lead[]): Lead[] {
  return leads.filter(isAwaitingReplyLead);
}

function syncReplyAliases(lead: Lead): Lead {
  const repliedAt = lead.repliedAt ?? lead.replyReceivedAt ?? null;
  const followUpDueAt = lead.followUpDueAt ?? lead.followUpDate ?? null;
  const replySummary = lead.replySummary?.trim() ? lead.replySummary : lead.replyMemo ?? '';

  return {
    ...lead,
    repliedAt,
    replyReceivedAt: repliedAt,
    followUpDueAt,
    followUpDate: followUpDueAt,
    replySummary,
    replyMemo: replySummary || lead.replyMemo,
  };
}

/** 検証・差分メモ用にエクスポート */
export function syncReplyAliasesForExport(lead: Lead): Lead {
  return syncReplyAliases(lead);
}

export function applyReplyManagementUpdate(lead: Lead, update: ReplyManagementUpdate): Lead {
  const now = new Date().toISOString();
  let next = syncReplyAliases({ ...lead });

  if (update.replyStatus !== undefined) {
    next.replyStatus = update.replyStatus;
    if (update.replyStatus !== 'none' && !update.repliedAt) {
      next.repliedAt = now;
      next.replyReceivedAt = now;
    }
    if (update.replyStatus === 'none') {
      next.repliedAt = null;
      next.replyReceivedAt = null;
    }
  }

  if (update.repliedAt !== undefined) {
    next.repliedAt = update.repliedAt;
    next.replyReceivedAt = update.repliedAt;
  }

  if (update.replySummary !== undefined) {
    next.replySummary = update.replySummary;
    next.replyMemo = update.replySummary;
  }

  if (update.followUpDueAt !== undefined) {
    next.followUpDueAt = update.followUpDueAt;
    next.followUpDate = update.followUpDueAt;
  }

  if (update.communicationMemo !== undefined) {
    next.communicationMemo = update.communicationMemo;
  }

  if (update.nextAction !== undefined) {
    next.nextAction = update.nextAction;
  } else {
    next.nextAction = inferNextActionForLead(next);
  }

  next.updatedAt = now;
  return syncReplyAliases(next);
}

/** 送信済み初回メールLeadを返信管理フェーズ用に正規化 */
export function prepareLeadForReplyPhase(lead: Lead): Lead {
  if (lead.sendStatus !== 'sent' && lead.sendStatus !== 'manual_sent') {
    return syncReplyAliases(lead);
  }

  const nextAction = isFollowUpOnlySentLead(lead) ? 'フォローアップ' : inferNextActionForLead(lead);
  return syncReplyAliases({
    ...lead,
    nextAction,
    replySummary: lead.replySummary ?? lead.replyMemo ?? '',
  });
}

export function buildReplyManagementView(lead: Lead) {
  const normalized = syncReplyAliases(lead);
  return {
    companyName: normalized.companyName,
    sendStatus: normalized.sendStatus,
    replyStatus: normalized.replyStatus,
    nextAction: normalized.nextAction,
    repliedAt: normalized.repliedAt,
    replySummary: normalized.replySummary,
    followUpDueAt: normalized.followUpDueAt,
    communicationMemo: normalized.communicationMemo,
    gmailDraftId: normalized.gmailDraftId,
    isAwaitingReply: isAwaitingReplyLead(normalized),
    isFollowUpOnly: isFollowUpOnlySentLead(normalized),
  };
}
