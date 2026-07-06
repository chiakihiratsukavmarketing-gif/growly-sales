import type { Lead } from '../types/lead.js';
import type { OfferProfile } from '../config/offerProfile.js';
import {
  getOutreachFromDisplayName,
  getOutreachFromEmail,
  getOutreachReplyToEmail,
  getOutreachSignatureEmail,
} from '../config/env.js';
import { hasEmailCandidates, isFormCopyOnlyLead } from '../analytics/contactPathTypes.js';
import {
  buildEmailOutreachCandidateView,
  selectGmailDraftCreationTargets,
  selectGmailDraftTabLeads,
  type EmailOutreachCandidateView,
} from '../outreach/outreachPolicy.js';
import {
  countAwaitingReplyLeads,
  inferNextActionForLead,
  selectAwaitingReplyLeads,
} from '../workflow/replyManagement.js';
import { isPendingGmailSendRecordLead } from '../workflow/recordManualGmailSent.js';
import {
  buildDailySalesChecklist,
  type DailyChecklistItem,
} from './buildDailySalesChecklist.js';
import {
  buildWeeklySalesSummary,
  type WeeklySalesSummary,
} from './buildWeeklySalesSummary.js';
import { buildTodaySalesQueue, type SalesQueueItem } from './buildTodaySalesQueue.js';
import {
  getReferenceOpenRateMetricsSync,
} from '../mail-operations/openTrackingStore.js';
import type { ReferenceOpenRateMetrics } from '../mail-operations/openTrackingTypes.js';
import { loadMailSuppressionStoreSync } from '../mail-operations/suppressionStore.js';
import { isActiveSuppressionStatus } from '../mail-operations/suppressionTypes.js';
import { OPEN_TRACKING_PRIVACY_NOTE } from '../mail-operations/openTrackingPrivacy.js';

export type { ReferenceOpenRateMetrics };

export interface MailOpsReferenceMetrics {
  manualSentCount: number;
  trackableSendCount: number;
  openedSendCount: number;
  referenceOpenRate: number | null;
  replyCount: number;
  referenceReplyRate: number | null;
  activeSuppressionCount: number;
  referenceSuppressionRate: number | null;
  note: string;
}

export type { DailyChecklistItem };

export interface SalesDashboardMetrics {
  totalLeads: number;
  initialEmailSentCount: number;
  manualSentCount: number;
  awaitingReplyCount: number;
  gmailDraftCandidateCount: number;
  gmailDraftPendingReviewCount: number;
  gmailDraftReadyCount: number;
  emailNotSentCount: number;
  formOnlyLeadCount: number;
  followUpTargetCount: number;
  pendingGmailSendRecordCount: number;
  humanReviewPendingCount: number;
}

export interface OutreachSenderConfig {
  fromEmail: string;
  fromDisplayName: string;
  replyToEmail: string;
  signatureEmail: string;
}

export interface MimeVerificationCheck {
  id: string;
  label: string;
  ok: boolean;
}

export interface MimeVerificationStatus {
  status: 'ready';
  label: string;
  summary: string;
  checks: MimeVerificationCheck[];
  note: string;
}

export type RecommendedActionCategory =
  | 'gmail_draft'
  | 'send_record'
  | 'reply_check'
  | 'follow_up'
  | 'weekly_review'
  | 'requested_report'
  | 'approval'
  | 'candidate_collection'
  | 'general';

export type RecommendedActionTargetTab =
  | 'dashboard'
  | 'draft-candidates'
  | 'send-records'
  | 'reply-management'
  | 'follow-up'
  | 'candidate-collection'
  | 'weekly-review'
  | 'leads';

export interface RecommendedActionItem {
  priority: number;
  category: RecommendedActionCategory;
  targetTab: RecommendedActionTargetTab | null;
  companyName: string;
  leadId: string | null;
  action: string;
}

export interface SalesDashboard {
  metrics: SalesDashboardMetrics;
  outreachSender: OutreachSenderConfig;
  mimeVerification: MimeVerificationStatus;
  /** 最優先アクション1件のみ（日次運用） */
  topRecommendedAction: RecommendedActionItem | null;
  recommendedActions: RecommendedActionItem[];
  dailyChecklist: DailyChecklistItem[];
  weeklySummary: {
    thisWeek: WeeklySalesSummary;
    lastWeek: WeeklySalesSummary;
  };
  requestedReportLeadCount: number;
  requestedReportLeadsPreview: { leadId: string; companyName: string }[];
  todaySalesQueue: SalesQueueItem[];
  gmailDraftCandidatesPreview: EmailOutreachCandidateView[];
  referenceOpenRate: ReferenceOpenRateMetrics;
  mailOpsReference: MailOpsReferenceMetrics;
}

function buildMimeVerificationStatus(): MimeVerificationStatus {
  return {
    status: 'ready',
    label: 'MIME修正適用済み',
    summary:
      'From/Reply-To の本文混入を防ぐ RFC 2822 + base64 本文エンコードを使用。下書き作成時はローカル検証と drafts.get 検証を行います。',
    checks: [
      { id: 'rfc2822', label: 'RFC 2822 + CRLF 区切り', ok: true },
      { id: 'base64-body', label: 'Content-Transfer-Encoding: base64（本文のみ）', ok: true },
      { id: 'from-header', label: 'From: 表示名 <sendAsメール>', ok: true },
      { id: 'reply-to', label: 'Reply-To ヘッダー分離', ok: true },
      { id: 'post-verify', label: '作成後 drafts.get 検証（失敗時削除）', ok: true },
    ],
    note: '画面表示のみ。Gmail API は呼び出していません。',
  };
}

/** 日次運用の最優先アクション1件（優先順位は Phase 19 仕様） */
export function buildTopRecommendedAction(
  leads: Lead[],
  offer?: OfferProfile
): RecommendedActionItem {
  const tabLeads = selectGmailDraftTabLeads(leads, offer);
  const readyTargets = selectGmailDraftCreationTargets(leads, offer);
  const pendingReview = tabLeads.filter((l) => l.humanReviewStatus === 'pending');
  const pendingSendRecord = leads.filter(isPendingGmailSendRecordLead);
  const awaiting = selectAwaitingReplyLeads(leads);
  const followUpLeads = leads.filter((l) => inferNextActionForLead(l) === 'フォローアップ');
  const requestedReportLeads = leads.filter(
    (l) =>
      (l.sendStatus === 'sent' || l.sendStatus === 'manual_sent') &&
      l.replyStatus === 'requested_report' &&
      !l.doNotContact
  );

  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const overdueFollowUps = followUpLeads.filter((l) => {
    if (!l.followUpDueAt) return false;
    const t = Date.parse(l.followUpDueAt);
    return Number.isFinite(t) && t <= now.getTime();
  });

  const noReply7DaysLeads = awaiting.filter((l) => {
    const sentAt = l.manualSentAt ?? null;
    if (!sentAt) return false;
    const t = Date.parse(sentAt);
    if (!Number.isFinite(t)) return false;
    const days = Math.floor((now.getTime() - t) / (24 * 3600 * 1000));
    return days >= 7;
  });

  if (requestedReportLeads.length > 0) {
    return {
      priority: 1,
      category: 'requested_report',
      targetTab: 'reply-management',
      companyName:
        requestedReportLeads.length === 1
          ? requestedReportLeads[0].companyName
          : `診断希望 ${requestedReportLeads.length}社`,
      leadId: requestedReportLeads[0]?.id ?? null,
      action: '診断レポート作成が必要（自動生成なし）。次アクションを「診断レポート作成」にして対応。',
    };
  }

  if (overdueFollowUps.length > 0) {
    return {
      priority: 2,
      category: 'follow_up',
      targetTab: 'follow-up',
      companyName:
        overdueFollowUps.length === 1
          ? overdueFollowUps[0].companyName
          : `期限切れフォローアップ ${overdueFollowUps.length}社`,
      leadId: overdueFollowUps[0]?.id ?? null,
      action: 'followUpDueAt が今日以前です。フォローアップタブで優先対応してください。',
    };
  }

  if (noReply7DaysLeads.length > 0) {
    return {
      priority: 3,
      category: 'follow_up',
      targetTab: 'reply-management',
      companyName:
        noReply7DaysLeads.length === 1
          ? noReply7DaysLeads[0].companyName
          : `7日以上返信なし ${noReply7DaysLeads.length}社`,
      leadId: noReply7DaysLeads[0]?.id ?? null,
      action: '送信から7日以上返信がありません。フォローアップ候補として内容確認（自動変更なし）',
    };
  }

  if (pendingSendRecord.length > 0) {
    return {
      priority: 4,
      category: 'send_record',
      targetTab: 'send-records',
      companyName:
        pendingSendRecord.length === 1
          ? pendingSendRecord[0].companyName
          : `送信記録待ち ${pendingSendRecord.length}社`,
      leadId: pendingSendRecord[0]?.id ?? null,
      action: 'Gmailで手動送信後、「送信記録」タブで記録してください（自動送信なし）',
    };
  }

  if (awaiting.length > 0) {
    return {
      priority: 5,
      category: 'reply_check',
      targetTab: 'reply-management',
      companyName: `返信待ち ${awaiting.length}社`,
      leadId: awaiting[0]?.id ?? null,
      action: 'Gmail受信トレイで返信有無を確認。返信ありの場合のみ返信管理で記録',
    };
  }

  if (tabLeads.length > 0) {
    const focus = pendingReview[0] ?? readyTargets[0] ?? tabLeads[0];
    return {
      priority: 6,
      category: pendingReview.length > 0 ? 'approval' : 'gmail_draft',
      targetTab: 'draft-candidates',
      companyName:
        tabLeads.length === 1 ? tabLeads[0].companyName : `Gmail下書き候補 ${tabLeads.length}社`,
      leadId: focus?.id ?? null,
      action:
        pendingReview.length > 0
          ? `内容確認 → 承認 → CREATE_DRAFTS で下書き作成（${pendingReview.length}社が承認待ち）`
          : 'Gmail下書き作成（CREATE_DRAFTS・手動送信のみ）',
    };
  }

  if (tabLeads.length === 0) {
    return {
      priority: 7,
      category: 'candidate_collection',
      targetTab: 'candidate-collection',
      companyName: '候補収集',
      leadId: null,
      action:
        'Gmail下書き候補が0件 — input-sites.csv → day1 → generate → 下書き候補で承認',
    };
  }

  if (followUpLeads.length > 0) {
    return {
      priority: 8,
      category: 'follow_up',
      targetTab: 'follow-up',
      companyName:
        followUpLeads.length === 1
          ? followUpLeads[0].companyName
          : `フォローアップ ${followUpLeads.length}社`,
      leadId: followUpLeads[0]?.id ?? null,
      action: 'フォローアップ対象を確認し、次の連絡を計画',
    };
  }

  return {
    priority: 9,
    category: 'general',
    targetTab: null,
    companyName: '—',
    leadId: null,
    action: '返信待ち Lead の受信確認を継続',
  };
}

function buildMailOpsReferenceMetrics(
  leads: Lead[],
  openRate: ReferenceOpenRateMetrics
): MailOpsReferenceMetrics {
  const sentLeads = leads.filter(
    (l) => l.sendStatus === 'sent' || l.sendStatus === 'manual_sent'
  );
  const manualSentCount = sentLeads.length;
  const replyCount = sentLeads.filter(
    (l) => l.replyStatus && l.replyStatus !== 'none'
  ).length;
  const suppressionStore = loadMailSuppressionStoreSync();
  const activeSuppressionCount = suppressionStore.records.filter((r) =>
    isActiveSuppressionStatus(r.status)
  ).length;
  return {
    manualSentCount,
    trackableSendCount: openRate.trackableSendCount,
    openedSendCount: openRate.openedSendCount,
    referenceOpenRate: openRate.referenceOpenRate,
    replyCount,
    referenceReplyRate: manualSentCount > 0 ? replyCount / manualSentCount : null,
    activeSuppressionCount,
    referenceSuppressionRate:
      manualSentCount > 0 ? activeSuppressionCount / manualSentCount : null,
    note: OPEN_TRACKING_PRIVACY_NOTE,
  };
}

export function buildSalesDashboard(leads: Lead[], offer?: OfferProfile): SalesDashboard {
  const initialEmailSentCount = leads.filter((l) => l.sendStatus === 'sent').length;
  const manualSentCount = leads.filter((l) => l.sendStatus === 'manual_sent').length;
  const awaitingReplyCount = countAwaitingReplyLeads(leads);
  const tabLeads = selectGmailDraftTabLeads(leads, offer);
  const readyTargets = selectGmailDraftCreationTargets(leads, offer);
  const emailNotSentCount = leads.filter(
    (l) => hasEmailCandidates(l) && l.sendStatus === 'not_sent'
  ).length;
  const formOnlyLeadCount = leads.filter(isFormCopyOnlyLead).length;
  const followUpTargetCount = leads.filter((l) => inferNextActionForLead(l) === 'フォローアップ').length;
  const pendingGmailSendRecordCount = leads.filter(isPendingGmailSendRecordLead).length;
  const humanReviewPendingCount = leads.filter((l) => l.humanReviewStatus === 'pending').length;
  const requestedReportLeads = leads.filter(
    (l) =>
      (l.sendStatus === 'sent' || l.sendStatus === 'manual_sent') &&
      l.replyStatus === 'requested_report' &&
      !l.doNotContact
  );
  const topRecommendedAction = buildTopRecommendedAction(leads, offer);
  const dailyChecklist = buildDailySalesChecklist(leads, offer);
  const weekNow = new Date();
  const weekLast = new Date(weekNow);
  weekLast.setDate(weekLast.getDate() - 7);

  const weeklySummary = {
    thisWeek: buildWeeklySalesSummary(leads, weekNow, {
      currentAwaitingReplyCount: awaitingReplyCount,
      currentFollowUpTargetCount: followUpTargetCount,
    }),
    lastWeek: buildWeeklySalesSummary(leads, weekLast, {
      currentAwaitingReplyCount: awaitingReplyCount,
      currentFollowUpTargetCount: followUpTargetCount,
    }),
  };
  const todaySalesQueue = buildTodaySalesQueue(leads, offer);
  const referenceOpenRate = getReferenceOpenRateMetricsSync();
  const mailOpsReference = buildMailOpsReferenceMetrics(leads, referenceOpenRate);

  return {
    metrics: {
      totalLeads: leads.length,
      initialEmailSentCount,
      manualSentCount,
      awaitingReplyCount,
      gmailDraftCandidateCount: tabLeads.length,
      gmailDraftPendingReviewCount: tabLeads.filter((l) => l.humanReviewStatus === 'pending').length,
      gmailDraftReadyCount: readyTargets.length,
      emailNotSentCount,
      formOnlyLeadCount,
      followUpTargetCount,
      pendingGmailSendRecordCount,
      humanReviewPendingCount,
    },
    outreachSender: {
      fromEmail: getOutreachFromEmail(),
      fromDisplayName: getOutreachFromDisplayName(),
      replyToEmail: getOutreachReplyToEmail(),
      signatureEmail: getOutreachSignatureEmail(),
    },
    mimeVerification: buildMimeVerificationStatus(),
    topRecommendedAction,
    recommendedActions: [topRecommendedAction],
    dailyChecklist,
    weeklySummary,
    requestedReportLeadCount: requestedReportLeads.length,
    requestedReportLeadsPreview: requestedReportLeads
      .slice(0, 5)
      .map((l) => ({ leadId: l.id, companyName: l.companyName })),
    todaySalesQueue,
    gmailDraftCandidatesPreview: readyTargets
      .slice(0, 8)
      .map((lead) => buildEmailOutreachCandidateView(lead, offer)),
    referenceOpenRate,
    mailOpsReference,
  };
}
