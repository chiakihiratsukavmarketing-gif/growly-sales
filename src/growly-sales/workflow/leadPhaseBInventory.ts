/**
 * Phase B: 既存Lead整理・営業対象の棚卸し（読み取り専用分類）
 *
 * 完了条件:
 * - 全Leadが営業導線別に分類されている
 * - Gmail営業対象数・フォーム営業対象数・除外候補・重複候補が明確
 * - 次に送るべきLeadリストが確定している
 * - Phase C 前に既存Leadで使える営業対象が見えている
 */
import type { Lead } from '../types/lead.js';
import {
  hasContactForm,
  hasEmailCandidates,
  isFormCopyOnlyLead,
} from '../analytics/contactPathTypes.js';
import {
  isAwaitingReplyLead,
  needsFollowUpDateSetup,
  resolveNextActionForLead,
} from './replyManagement.js';

export const PHASE_B_COMPLETION_CRITERIA = [
  '全Leadが営業導線別に分類されている',
  'Gmail営業対象数が明確',
  'フォーム営業対象数が明確',
  '除外候補が明確',
  '重複候補が明確',
  '次に送るべきLeadリストが確定している',
  'Phase C に進む前に、既存Leadで使える営業対象が見えている',
] as const;

export type PhaseBInventoryCategory =
  | 'gmail_outreach'
  | 'form_outreach'
  | 'follow_up'
  | 'sent_reply_processed'
  | 'pending_approval'
  | 'needs_review'
  | 'exclusion_candidate'
  | 'do_not_contact'
  | 'duplicate_candidate';

export interface PhaseBLeadRow {
  id: string;
  companyName: string;
  hasEmail: boolean;
  hasForm: boolean;
  humanReviewStatus: Lead['humanReviewStatus'];
  sendStatus: Lead['sendStatus'];
  gmailDraftStatus: Lead['gmailDraftStatus'];
  replyStatus: Lead['replyStatus'];
  nextAction: string;
  recommendedNextStep: string;
}

export interface DuplicateGroup {
  matchKey: string;
  matchField: 'companyName' | 'websiteUrl' | 'email' | 'contactFormUrl' | 'instagramUrl';
  leadIds: string[];
  companyNames: string[];
}

export interface PhaseBInventoryReport {
  totalLeads: number;
  contactedCount: number;
  notContactedCount: number;
  gmailOutreach: PhaseBLeadRow[];
  formOutreach: PhaseBLeadRow[];
  followUpTargets: PhaseBLeadRow[];
  pendingApproval: PhaseBLeadRow[];
  needsReview: PhaseBLeadRow[];
  sentReplyProcessed: PhaseBLeadRow[];
  exclusionCandidates: Array<PhaseBLeadRow & { exclusionReasons: string[] }>;
  doNotContact: PhaseBLeadRow[];
  duplicateGroups: DuplicateGroup[];
  duplicateLeadIds: Set<string>;
  counts: Record<PhaseBInventoryCategory, number>;
  phaseBComplete: boolean;
  phaseBCompleteNotes: string[];
}

function isContacted(lead: Lead): boolean {
  return lead.sendStatus === 'sent' || lead.sendStatus === 'manual_sent';
}

function isRejected(lead: Lead): boolean {
  return lead.humanReviewStatus === 'rejected';
}

function hasOutreachCopyOrGeneratable(lead: Lead): boolean {
  const hasCopy = Boolean(lead.emailSubject?.trim() && lead.emailBody?.trim());
  const canGenerate = Boolean(lead.websiteUrl?.trim());
  return hasCopy || canGenerate;
}

function canUseFormCopy(lead: Lead): boolean {
  return (
    hasContactForm(lead) &&
    Boolean(lead.emailSubject?.trim() && lead.emailBody?.trim())
  );
}

function normalizeCompanyName(name: string): string {
  return name.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, '');
}

function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url.trim());
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
    const path = parsed.pathname.replace(/\/$/, '') || '';
    return `${host}${path}`;
  } catch {
    return url.trim().toLowerCase();
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function toRow(lead: Lead, recommendedNextStep: string): PhaseBLeadRow {
  return {
    id: lead.id,
    companyName: lead.companyName,
    hasEmail: hasEmailCandidates(lead),
    hasForm: hasContactForm(lead),
    humanReviewStatus: lead.humanReviewStatus,
    sendStatus: lead.sendStatus,
    gmailDraftStatus: lead.gmailDraftStatus,
    replyStatus: lead.replyStatus,
    nextAction: resolveNextActionForLead(lead),
    recommendedNextStep,
  };
}

/** Gmail営業対象（初回メール営業・下書き未作成） */
export function isGmailOutreachTarget(lead: Lead): boolean {
  if (!hasEmailCandidates(lead)) return false;
  if (isContacted(lead)) return false;
  if (lead.gmailDraftStatus === 'draft_created') return false;
  if (lead.doNotContact) return false;
  if (isRejected(lead)) return false;
  if (lead.replyStatus === 'declined' || lead.replyStatus === 'not_interested') return false;
  if (!hasOutreachCopyOrGeneratable(lead)) return false;
  if (lead.humanReviewStatus !== 'approved' && lead.humanReviewStatus !== 'pending') {
    return false;
  }
  return true;
}

/** フォーム営業対象（Gmail営業対象でないフォーム導線） */
export function isFormOutreachTarget(lead: Lead): boolean {
  if (!hasContactForm(lead)) return false;
  if (isContacted(lead)) return false;
  if (lead.doNotContact) return false;
  if (isRejected(lead)) return false;
  if (isGmailOutreachTarget(lead)) return false;
  return canUseFormCopy(lead) || Boolean(lead.websiteUrl?.trim());
}

/** フォローアップ対象（送信済み・要フォロー） */
export function isFollowUpTarget(lead: Lead): boolean {
  if (!isContacted(lead)) return false;
  if (lead.doNotContact) return false;
  const resolvedNext = resolveNextActionForLead(lead);
  if (resolvedNext === '対象外' || resolvedNext === '要確認') return false;
  return (
    resolvedNext === 'フォローアップ' ||
    lead.replyStatus === 'requested_report' ||
    lead.replyStatus === 'follow_up_needed'
  );
}

/** 送信済み・返信処理済み（Phase A 完了相当） */
export function isSentReplyProcessed(lead: Lead): boolean {
  if (!isContacted(lead)) return false;
  if (isAwaitingReplyLead(lead)) return false;
  if (needsFollowUpDateSetup(lead)) return false;
  return true;
}

/** 承認待ち（未送信） */
export function isPendingApprovalLead(lead: Lead): boolean {
  return !isContacted(lead) && lead.humanReviewStatus === 'pending' && !lead.doNotContact;
}

/** 要確認 */
export function isNeedsReviewLead(lead: Lead): boolean {
  if (resolveNextActionForLead(lead) === '要確認') return true;
  if (lead.humanReviewStatus === 'needs_revision') return true;
  if (lead.reviewStatus === 'revise') return true;
  return false;
}

const HOUSING_KEYWORDS = ['工務', '住宅', 'リフォーム', '建築', 'ハウス', 'ホーム', '建設'];

/** 除外候補の理由（一覧化のみ・自動変更なし） */
export function getLeadExclusionReasons(lead: Lead): string[] {
  const reasons: string[] = [];

  if (!hasEmailCandidates(lead)) reasons.push('メールなし');
  if (!hasContactForm(lead)) reasons.push('フォームなし');
  if (!lead.websiteUrl?.trim()) reasons.push('公式URLなし');

  if (isRejected(lead)) reasons.push('却下');

  if (
    !hasEmailCandidates(lead) &&
    !hasContactForm(lead) &&
    lead.websiteUrl?.trim()
  ) {
    reasons.push('営業導線が不明');
  }

  if (isContacted(lead) && resolveNextActionForLead(lead) === '対象外') {
    reasons.push('送信済みで次アクション不要');
  }

  const industry = lead.industry ?? '';
  const text = `${industry}${lead.companyName}`;
  if (
    industry.trim() &&
    !HOUSING_KEYWORDS.some((k) => text.includes(k))
  ) {
    reasons.push('工務店・住宅会社ではない可能性');
  }

  if (
    !isContacted(lead) &&
    !isGmailOutreachTarget(lead) &&
    !isFormOutreachTarget(lead) &&
    !hasOutreachCopyOrGeneratable(lead) &&
    (hasEmailCandidates(lead) || hasContactForm(lead))
  ) {
    reasons.push('営業文未生成');
  }

  return reasons;
}

/** 除外候補（連絡禁止・重複候補・稼働中導線以外） */
export function isExclusionCandidate(lead: Lead): boolean {
  if (lead.doNotContact) return false;
  if (isGmailOutreachTarget(lead)) return false;
  if (isFormOutreachTarget(lead)) return false;
  if (isFollowUpTarget(lead)) return false;
  if (isPendingApprovalLead(lead)) return false;
  if (isNeedsReviewLead(lead)) return false;

  const reasons = getLeadExclusionReasons(lead);
  if (reasons.length === 0) return false;

  if (isSentReplyProcessed(lead)) {
    return reasons.includes('送信済みで次アクション不要');
  }

  return !isContacted(lead) || reasons.includes('送信済みで次アクション不要');
}

export function findDuplicateCandidateGroups(leads: Lead[]): DuplicateGroup[] {
  const groups: DuplicateGroup[] = [];
  const pushGroup = (
    matchField: DuplicateGroup['matchField'],
    key: string,
    lead: Lead
  ): void => {
    if (!key) return;
    const fullKey = `${matchField}:${key}`;
    const existing = groups.find((g) => g.matchKey === fullKey);
    if (existing) {
      if (!existing.leadIds.includes(lead.id)) {
        existing.leadIds.push(lead.id);
        existing.companyNames.push(lead.companyName);
      }
    } else {
      groups.push({
        matchKey: fullKey,
        matchField,
        leadIds: [lead.id],
        companyNames: [lead.companyName],
      });
    }
  };

  for (const lead of leads) {
    const companyKey = normalizeCompanyName(lead.companyName);
    if (companyKey.length >= 2) {
      pushGroup('companyName', companyKey, lead);
    }
    if (lead.websiteUrl?.trim()) {
      pushGroup('websiteUrl', normalizeUrl(lead.websiteUrl), lead);
    }
    for (const email of lead.emailCandidates) {
      const e = normalizeEmail(email);
      if (e) pushGroup('email', e, lead);
    }
    if (lead.contactFormUrl?.trim()) {
      pushGroup('contactFormUrl', normalizeUrl(lead.contactFormUrl), lead);
    }
    if (lead.instagramUrl?.trim()) {
      pushGroup('instagramUrl', normalizeUrl(lead.instagramUrl), lead);
    }
  }

  return groups.filter((g) => g.leadIds.length > 1);
}

export function isDuplicateCandidate(lead: Lead, groups: DuplicateGroup[]): boolean {
  return groups.some((g) => g.leadIds.includes(lead.id));
}

function gmailRecommendedAction(lead: Lead): string {
  if (lead.humanReviewStatus === 'pending') {
    return '内容確認 → 承認 → Gmail下書き作成（CREATE_DRAFTS・手動送信）';
  }
  if (!lead.emailSubject?.trim() || !lead.emailBody?.trim()) {
    return 'npm run growly-sales:generate で営業文生成 → 下書き候補タブ';
  }
  return '下書き候補タブで Gmail下書き作成（CREATE_DRAFTS・手動送信）';
}

function formRecommendedAction(lead: Lead): string {
  if (lead.humanReviewStatus === 'pending') {
    return '内容確認 → 承認 → フォーム文面をコピーして手動送信';
  }
  if (!lead.emailSubject?.trim() || !lead.emailBody?.trim()) {
    return 'npm run growly-sales:generate で営業文生成 → フォームコピー運用';
  }
  return '下書き候補またはLead詳細からフォーム文面をコピー';
}

export function buildPhaseBInventoryReport(leads: Lead[]): PhaseBInventoryReport {
  const duplicateGroups = findDuplicateCandidateGroups(leads);
  const duplicateLeadIds = new Set(
    duplicateGroups.flatMap((g) => g.leadIds)
  );

  const gmailOutreach = leads
    .filter(isGmailOutreachTarget)
    .map((l) => toRow(l, gmailRecommendedAction(l)))
    .sort((a, b) => a.companyName.localeCompare(b.companyName, 'ja'));

  const formOutreach = leads
    .filter(isFormOutreachTarget)
    .map((l) => toRow(l, formRecommendedAction(l)))
    .sort((a, b) => a.companyName.localeCompare(b.companyName, 'ja'));

  const followUpTargets = leads
    .filter(isFollowUpTarget)
    .map((l) =>
      toRow(
        l,
        l.followUpDueAt?.trim()
          ? `フォローアップ（予定: ${l.followUpDueAt.slice(0, 10)}）`
          : 'フォロー予定日を設定'
      )
    )
    .sort((a, b) => a.companyName.localeCompare(b.companyName, 'ja'));

  const pendingApproval = leads
    .filter(isPendingApprovalLead)
    .map((l) =>
      toRow(
        l,
        isFormCopyOnlyLead(l)
          ? 'フォーム導線 — 承認後にコピー運用'
          : hasEmailCandidates(l)
            ? 'メール導線 — 承認後にGmail下書き'
            : '導線確認後に承認'
      )
    )
    .sort((a, b) => a.companyName.localeCompare(b.companyName, 'ja'));

  const needsReview = leads
    .filter(isNeedsReviewLead)
    .map((l) => toRow(l, '返信管理またはLead詳細で状態を確認'))
    .sort((a, b) => a.companyName.localeCompare(b.companyName, 'ja'));

  const sentReplyProcessed = leads
    .filter(isSentReplyProcessed)
    .map((l) => toRow(l, '返信処理済み — フォローまたは対応不要'))
    .sort((a, b) => a.companyName.localeCompare(b.companyName, 'ja'));

  const exclusionCandidates = leads
    .filter(isExclusionCandidate)
    .map((l) => ({
      ...toRow(l, '棚卸し確認 — 除外候補として人間が判断'),
      exclusionReasons: getLeadExclusionReasons(l),
    }))
    .sort((a, b) => a.companyName.localeCompare(b.companyName, 'ja'));

  const doNotContact = leads
    .filter((l) => l.doNotContact)
    .map((l) => toRow(l, '連絡禁止 — 操作しない'))
    .sort((a, b) => a.companyName.localeCompare(b.companyName, 'ja'));

  const contactedCount = leads.filter(isContacted).length;
  const notes: string[] = [];

  const classifiedIds = new Set<string>();
  for (const bucket of [
    gmailOutreach,
    formOutreach,
    followUpTargets,
    pendingApproval,
    needsReview,
    sentReplyProcessed,
    exclusionCandidates,
    doNotContact,
  ]) {
    for (const row of bucket) classifiedIds.add(row.id);
  }
  for (const id of duplicateLeadIds) classifiedIds.add(id);

  const unclassified = leads.filter((l) => !classifiedIds.has(l.id));
  if (unclassified.length > 0) {
    notes.push(`未分類Lead ${unclassified.length}件: ${unclassified.map((l) => l.companyName).join(', ')}`);
  }

  const phaseBComplete =
    unclassified.length === 0 &&
    gmailOutreach.length + formOutreach.length + followUpTargets.length >= 0;

  if (gmailOutreach.length === 0 && formOutreach.length === 0 && pendingApproval.length === 0) {
    notes.push('新規アウトリーチ対象（Gmail/フォーム）は現時点0件 — Phase C 前に候補収集が必要な可能性');
  }

  return {
    totalLeads: leads.length,
    contactedCount,
    notContactedCount: leads.length - contactedCount,
    gmailOutreach,
    formOutreach,
    followUpTargets,
    pendingApproval,
    needsReview,
    sentReplyProcessed,
    exclusionCandidates,
    doNotContact,
    duplicateGroups,
    duplicateLeadIds,
    counts: {
      gmail_outreach: gmailOutreach.length,
      form_outreach: formOutreach.length,
      follow_up: followUpTargets.length,
      sent_reply_processed: sentReplyProcessed.length,
      pending_approval: pendingApproval.length,
      needs_review: needsReview.length,
      exclusion_candidate: exclusionCandidates.length,
      do_not_contact: doNotContact.length,
      duplicate_candidate: duplicateLeadIds.size,
    },
    phaseBComplete,
    phaseBCompleteNotes: notes,
  };
}
