import type { Lead } from '../types/lead.js';
import type { OfferProfile } from '../config/offerProfile.js';
import { selectGmailDraftTabLeads, selectGmailDraftCreationTargets } from '../outreach/outreachPolicy.js';
import { isPendingGmailSendRecordLead } from '../workflow/recordManualGmailSent.js';
import { selectAwaitingReplyLeads, inferNextActionForLead } from '../workflow/replyManagement.js';
import { isFollowUpSuppressed, isResendSuppressed } from '../mail-operations/index.js';

export type SalesQueueCategory =
  | 'requested_report_unhandled'
  | 'follow_up_overdue'
  | 'no_reply_7plus'
  | 'send_record_pending'
  | 'gmail_draft_candidates'
  | 'reply_waiting'
  | 'candidate_collection_needed'
  | 'requested_report_in_progress';

export interface SalesQueueItem {
  category: SalesQueueCategory;
  title: string;
  count: number;
  description: string;
  targetTab: 'reply-management' | 'follow-up' | 'send-records' | 'draft-candidates' | 'candidate-collection';
  leadPreview: { leadId: string; companyName: string }[];
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function elapsedDaysFromSent(lead: Lead, today: Date): number | null {
  const sentAt = lead.manualSentAt ?? null;
  if (!sentAt) return null;
  const t = Date.parse(sentAt);
  if (!Number.isFinite(t)) return null;
  return Math.floor((today.getTime() - t) / (24 * 3600 * 1000));
}

export function buildTodaySalesQueue(leads: Lead[], offer?: OfferProfile): SalesQueueItem[] {
  const today = startOfToday();
  const requestedReport = leads.filter(
    (l) =>
      (l.sendStatus === 'sent' || l.sendStatus === 'manual_sent') &&
      l.replyStatus === 'requested_report' &&
      !l.doNotContact
  );
  const requestedUnhandled = requestedReport.filter((l) => l.dealStatus === 'none');
  const requestedInProgress = requestedReport.filter((l) => l.dealStatus === 'open');

  const followUpTargets = leads.filter(
    (l) => inferNextActionForLead(l) === 'フォローアップ' && !l.doNotContact && !isFollowUpSuppressed(l)
  );
  const followUpOverdue = followUpTargets.filter((l) => {
    if (!l.followUpDueAt) return false;
    const t = Date.parse(l.followUpDueAt);
    return Number.isFinite(t) && t <= today.getTime();
  });

  const awaiting = selectAwaitingReplyLeads(leads);
  const noReply7Plus = awaiting.filter((l) => {
    if (isResendSuppressed(l)) return false;
    const days = elapsedDaysFromSent(l, today);
    return days !== null && days >= 7;
  });

  const sendRecordPending = leads.filter(isPendingGmailSendRecordLead);
  const tabLeads = selectGmailDraftTabLeads(leads, offer);
  const readyTargets = selectGmailDraftCreationTargets(leads, offer);
  const needsCandidateCollection = tabLeads.length === 0;

  const items: SalesQueueItem[] = [
    {
      category: 'requested_report_unhandled',
      title: '未対応の診断希望',
      count: requestedUnhandled.length,
      description:
        'requested_report は「診断レポート作成が必要」。dealStatus=none は未対応。対応開始/完了後は手動で dealStatus=open にしてください（自動作成なし）。',
      targetTab: 'reply-management',
      leadPreview: requestedUnhandled.slice(0, 3).map((l) => ({ leadId: l.id, companyName: l.companyName })),
    },
    {
      category: 'follow_up_overdue',
      title: '期限切れフォローアップ',
      count: followUpOverdue.length,
      description: 'followUpDueAt が今日以前です。優先してフォローアップを計画してください（自動送信なし）。',
      targetTab: 'follow-up',
      leadPreview: followUpOverdue.slice(0, 3).map((l) => ({ leadId: l.id, companyName: l.companyName })),
    },
    {
      category: 'no_reply_7plus',
      title: '7日以上返信なし（フォローアップ検討）',
      count: noReply7Plus.length,
      description: '返信管理で候補を確認し、必要な場合のみ followUpDueAt / nextAction を更新してください（自動変更なし）。',
      targetTab: 'reply-management',
      leadPreview: noReply7Plus.slice(0, 3).map((l) => ({ leadId: l.id, companyName: l.companyName })),
    },
    {
      category: 'send_record_pending',
      title: '送信記録待ち',
      count: sendRecordPending.length,
      description: 'Gmailで手動送信後、「送信記録」タブで記録してください（自動送信なし）。',
      targetTab: 'send-records',
      leadPreview: sendRecordPending.slice(0, 3).map((l) => ({ leadId: l.id, companyName: l.companyName })),
    },
    {
      category: 'gmail_draft_candidates',
      title: 'Gmail下書き候補',
      count: tabLeads.length,
      description:
        tabLeads.length === 0
          ? '候補はありません。候補収集（input-sites.csv → day1 → generate）を実行してください。'
          : '下書き候補タブで承認→CREATE_DRAFTSで下書き作成（自動送信なし）。',
      targetTab: tabLeads.length === 0 ? 'candidate-collection' : 'draft-candidates',
      leadPreview: readyTargets.slice(0, 3).map((l) => ({ leadId: l.id, companyName: l.companyName })),
    },
    {
      category: 'reply_waiting',
      title: '返信待ち（受信確認）',
      count: awaiting.length,
      description: 'Gmail受信トレイで返信有無を確認。返信ありの場合のみ返信管理で要約を記録します。',
      targetTab: 'reply-management',
      leadPreview: awaiting.slice(0, 3).map((l) => ({ leadId: l.id, companyName: l.companyName })),
    },
    {
      category: 'candidate_collection_needed',
      title: '候補収集が必要',
      count: needsCandidateCollection ? 1 : 0,
      description:
        'Gmail下書き候補が0件です。input-sites.csv 追加 → day1 → generate → email-outreach-candidates を実行してください。',
      targetTab: 'candidate-collection',
      leadPreview: [],
    },
    {
      category: 'requested_report_in_progress',
      title: '診断希望（対応中）',
      count: requestedInProgress.length,
      description:
        'dealStatus=open を「対応中」として管理しています（自動作成なし）。必要なら followUpDueAt を設定してください。',
      targetTab: 'reply-management',
      leadPreview: requestedInProgress.slice(0, 3).map((l) => ({ leadId: l.id, companyName: l.companyName })),
    },
  ];

  // Keep stable order as defined above.
  return items;
}

