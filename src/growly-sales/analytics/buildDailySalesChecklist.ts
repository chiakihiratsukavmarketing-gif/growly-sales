import type { Lead } from '../types/lead.js';
import type { OfferProfile } from '../config/offerProfile.js';
import { hasEmailCandidates } from '../analytics/contactPathTypes.js';
import {
  selectGmailDraftCreationTargets,
  selectGmailDraftTabLeads,
} from '../outreach/outreachPolicy.js';
import {
  countAwaitingReplyLeads,
  inferNextActionForLead,
  selectAwaitingReplyLeads,
} from '../workflow/replyManagement.js';
import { isPendingGmailSendRecordLead } from '../workflow/recordManualGmailSent.js';

export type DailyChecklistTargetTab =
  | 'draft-candidates'
  | 'send-records'
  | 'reply-management'
  | 'follow-up'
  | 'candidate-collection'
  | 'leads'
  | 'dashboard';

export type DailyChecklistItemStatus = 'attention' | 'routine' | 'optional' | 'ok';

export interface DailyChecklistItem {
  id: string;
  order: number;
  label: string;
  description: string;
  status: DailyChecklistItemStatus;
  targetTab: DailyChecklistTargetTab | null;
  badge: string | null;
}

export function buildDailySalesChecklist(leads: Lead[], offer?: OfferProfile): DailyChecklistItem[] {
  const awaitingCount = countAwaitingReplyLeads(leads);
  const requestedReportCount = leads.filter(
    (l) => (l.sendStatus === 'sent' || l.sendStatus === 'manual_sent') && l.replyStatus === 'requested_report'
  ).length;
  const tabLeads = selectGmailDraftTabLeads(leads, offer);
  const readyTargets = selectGmailDraftCreationTargets(leads, offer);
  const pendingReview = tabLeads.filter((l) => l.humanReviewStatus === 'pending');
  const pendingSendRecord = leads.filter(isPendingGmailSendRecordLead);
  const followUpCount = leads.filter((l) => inferNextActionForLead(l) === 'フォローアップ').length;
  const emailNotSentCount = leads.filter(
    (l) => hasEmailCandidates(l) && l.sendStatus === 'not_sent'
  ).length;
  const noDraftCandidates = tabLeads.length === 0;

  const items: DailyChecklistItem[] = [
    {
      id: 'check_replies',
      order: 1,
      label: '返信待ちLeadを確認する',
      description:
        'Gmail受信トレイで返信有無を確認。返信なしなら変更不要。返信ありの場合のみ返信管理で記録。',
      status: awaitingCount > 0 ? 'attention' : 'ok',
      targetTab: 'reply-management',
      badge: awaitingCount > 0 ? `${awaitingCount}件` : null,
    },
    {
      id: 'requested_report',
      order: 2,
      label: '診断希望Leadを確認する',
      description: 'replyStatus=requested_report を最優先で対応（自動作成なし）。',
      status: requestedReportCount > 0 ? 'attention' : 'ok',
      targetTab: 'reply-management',
      badge: requestedReportCount > 0 ? `${requestedReportCount}件` : null,
    },
    {
      id: 'add_candidates',
      order: 3,
      label: '新規Lead候補を追加する',
      description: 'input-sites.csv に会社URLを追加（Gmail下書き候補が尽きたら実施）。',
      status: noDraftCandidates ? 'attention' : 'optional',
      targetTab: 'candidate-collection',
      badge: noDraftCandidates ? '候補0件' : null,
    },
    {
      id: 'extract_email',
      order: 4,
      label: 'メールありLeadを抽出する',
      description: 'day1 実行後、email-outreach-candidates でメールあり候補を確認。',
      status: noDraftCandidates ? 'attention' : 'optional',
      targetTab: 'candidate-collection',
      badge: emailNotSentCount > 0 ? `未送信${emailNotSentCount}件` : null,
    },
    {
      id: 'review_draft_candidates',
      order: 5,
      label: 'Gmail下書き候補を確認する',
      description: '下書き候補タブで内容確認。承認待ちがあれば承認する。',
      status: tabLeads.length > 0 ? 'attention' : 'ok',
      targetTab: 'draft-candidates',
      badge:
        tabLeads.length > 0
          ? pendingReview.length > 0
            ? `承認待ち${pendingReview.length}`
            : `${tabLeads.length}件`
          : null,
    },
    {
      id: 'create_drafts',
      order: 6,
      label: 'Gmail下書きを作成する',
      description: 'CREATE_DRAFTS ゲート付きで1社ずつ作成（自動送信なし）。',
      status: readyTargets.length > 0 ? 'attention' : pendingReview.length > 0 ? 'routine' : 'ok',
      targetTab: 'draft-candidates',
      badge: readyTargets.length > 0 ? `作成可${readyTargets.length}` : null,
    },
    {
      id: 'manual_gmail_send',
      order: 7,
      label: 'Gmailで手動送信する',
      description: 'Gmailアプリで下書きを開き、内容確認後に人間が手動送信。',
      status: pendingSendRecord.length > 0 ? 'attention' : 'optional',
      targetTab: 'send-records',
      badge: pendingSendRecord.length > 0 ? `${pendingSendRecord.length}件` : null,
    },
    {
      id: 'record_sent',
      order: 8,
      label: '送信済み記録をする',
      description: '送信記録タブで「手動送信済みに記録」（Growly Sales からは送信しない）。',
      status: pendingSendRecord.length > 0 ? 'attention' : 'ok',
      targetTab: 'send-records',
      badge: pendingSendRecord.length > 0 ? `${pendingSendRecord.length}件` : null,
    },
    {
      id: 'record_reply',
      order: 9,
      label: '返信があれば返信管理に記録する',
      description:
        'replyStatus / replySummary（要約のみ）/ followUpDueAt を更新。返信本文全文は保存しない。',
      status: awaitingCount > 0 ? 'routine' : 'optional',
      targetTab: 'reply-management',
      badge: null,
    },
  ];

  if (followUpCount > 0) {
    items.push({
      id: 'follow_up',
      order: 9,
      label: 'フォローアップ対象を確認する',
      description: 'フォローアップタブで次の連絡を計画。',
      status: 'routine',
      targetTab: 'follow-up',
      badge: `${followUpCount}件`,
    });
  }

  return items.sort((a, b) => a.order - b.order);
}
