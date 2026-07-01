import type { Lead } from '../types/lead.js';
import type { OfferProfile } from '../config/offerProfile.js';
import {
  resolveEmailSourceFromLead,
  type EmailSourcePageType,
} from '../candidates/resolveEmailSourceDisplay.js';
import {
  buildCollectionProfileDisplayFromLead,
  type CollectionProfileDisplayInfo,
} from '../candidates/resolveCollectionProfileDisplay.js';
import { containsProhibitedClaim } from '../config/offerProfile.js';
import { containsProhibitedPhrase } from '../generation/generationUtils.js';
import { hasEmailCandidates, hasContactForm, isFormCopyOnlyLead } from '../analytics/contactPathTypes.js';
import { isFollowUpOnlyLead } from './outreachEligibility.js';

export type OutreachDeferStatus =
  | 'email_ready'
  | 'form_later'
  | 'phone_or_unknown'
  | 'sent'
  | 'follow_up_only'
  | 'blocked';

export interface EmailOutreachCandidateView {
  companyName: string;
  websiteUrl: string;
  emailCandidates: string[];
  emailCandidateSourceUrls: string[];
  email: string;
  emailSourceUrl: string | null;
  emailSourceLabel: string;
  emailSourceCompactLabel: string;
  sourcePageType: EmailSourcePageType;
  officialSiteUrl: string | null;
  isOfficialSiteOrigin: boolean;
  emailSourceConfirmed: boolean;
  isPlaceholderEmail: boolean;
  isPersonalEmail: boolean;
  batchId: string | null;
  source: string | null;
  humanReviewStatus: Lead['humanReviewStatus'];
  sendStatus: Lead['sendStatus'];
  gmailDraftStatus: Lead['gmailDraftStatus'];
  replyStatus: Lead['replyStatus'];
  dealStatus: Lead['dealStatus'];
  exclusionReason: string | null;
  outreachDeferStatus: OutreachDeferStatus;
  recommendedAction: string;
  collectionProfileId: string | null;
  collectionProfileName: string | null;
  collectionMode: Lead['collectionMode'];
  industryCategory: Lead['industryCategory'];
  areaStrategy: Lead['areaStrategy'];
  prefecture: string | null;
  discoverySource: Lead['discoverySource'];
  discoverySourceSite: Lead['discoverySourceSite'];
  discoverySourceLabel: string | null;
  discoverySourceUrl: string | null;
  sourceComplianceStatus: Lead['sourceComplianceStatus'];
  collectionProfile: CollectionProfileDisplayInfo;
}

function findProhibitedPhrase(lead: Lead, offer?: OfferProfile): string | null {
  const fullText = `${lead.emailSubject}\n${lead.emailBody}`;
  const fromList = containsProhibitedPhrase(fullText, offer?.prohibitedClaims ?? []);
  if (fromList) return fromList;
  if (offer && containsProhibitedClaim(fullText, offer)) {
    return 'offerProfileの禁止表現';
  }
  return null;
}

export function getOutreachDeferStatus(lead: Lead): OutreachDeferStatus {
  if (lead.sendStatus === 'sent' || lead.sendStatus === 'manual_sent') return 'sent';
  if (isFollowUpOnlyLead(lead)) return 'follow_up_only';
  if (lead.doNotContact || lead.sendStatus === 'blocked') return 'blocked';
  if (hasEmailCandidates(lead)) return 'email_ready';
  if (isFormCopyOnlyLead(lead)) return 'form_later';
  return 'phone_or_unknown';
}

/** メール営業の初回対象から replyStatus=replied を除外 */
export function isRepliedInitialOutreachExcluded(lead: Lead): boolean {
  return lead.replyStatus === 'replied';
}

/** Gmail下書き作成対象外の理由。null なら作成候補 */
export function getGmailDraftExclusionReason(lead: Lead, offer?: OfferProfile): string | null {
  if (!hasEmailCandidates(lead)) {
    if (hasContactForm(lead)) {
      return 'contactFormOnly（form_later・Gmail下書き対象外）';
    }
    return 'emailCandidatesなし（電話のみ/導線不明・対象外）';
  }

  if (lead.sendStatus === 'sent' || lead.sendStatus === 'manual_sent') {
    if (isFollowUpOnlyLead(lead)) {
      return '初回営業済み・返信あり（フォローアップのみ・Gmail下書き対象外）';
    }
    if (lead.sendStatus === 'sent') {
      return 'sendStatus=sent（送信済）';
    }
    return 'sendStatus=manual_sent（手動送信済）';
  }
  if (lead.sendStatus !== 'not_sent') {
    return `sendStatus=${lead.sendStatus}`;
  }

  if (isRepliedInitialOutreachExcluded(lead)) {
    return 'replyStatus=replied（初回営業対象外）';
  }
  if (isFollowUpOnlyLead(lead)) {
    return '初回営業済み・返信あり（フォローアップのみ・Gmail下書き対象外）';
  }

  if (lead.dealStatus === 'open') {
    return 'dealStatus=open（商談化済・Gmail下書き対象外）';
  }

  if (lead.replyStatus === 'declined' || lead.replyStatus === 'not_interested') {
    return `replyStatus=${lead.replyStatus}（初回営業対象外）`;
  }

  if (lead.gmailDraftStatus !== 'none') {
    if (lead.gmailDraftStatus === 'draft_created') {
      return 'gmailDraftStatus=draft_created（Gmail下書き作成済み）';
    }
    return `gmailDraftStatus=${lead.gmailDraftStatus}`;
  }

  if (lead.humanReviewStatus === 'rejected') {
    return 'humanReviewStatus=rejected（却下）';
  }
  if (lead.humanReviewStatus === 'needs_revision') {
    return 'humanReviewStatus=needs_revision（修正依頼）';
  }
  if (lead.humanReviewStatus === 'pending') {
    return 'humanReviewStatus=pending（内容確認後に承認が必要）';
  }
  if (lead.humanReviewStatus !== 'approved') {
    return `humanReviewStatus=${lead.humanReviewStatus}`;
  }

  if (lead.reviewStatus === 'reject') {
    return 'reviewStatus=reject（校閲NG）';
  }
  if (lead.reviewStatus === 'revise') {
    return 'reviewStatus=revise（校閲要修正）';
  }

  if (lead.doNotContact) {
    return 'doNotContact=true（連絡禁止）';
  }
  if (lead.riskLevel === 'high') {
    return 'riskLevel=high';
  }

  if (!lead.emailSubject?.trim()) {
    return 'emailSubjectが空';
  }
  if (!lead.emailBody?.trim()) {
    return 'emailBodyが空';
  }

  const prohibited = findProhibitedPhrase(lead, offer);
  if (prohibited) {
    return `禁止表現を検出: ${prohibited}`;
  }

  return null;
}

export function isGmailDraftEligible(lead: Lead, offer?: OfferProfile): boolean {
  return getGmailDraftExclusionReason(lead, offer) === null;
}

export function getRecommendedOutreachAction(
  lead: Lead,
  exclusionReason: string | null
): string {
  if (exclusionReason === null) {
    if (lead.humanReviewStatus === 'pending') {
      return '内容確認のうえ Gmail下書き作成（CREATE_DRAFTS・手動送信のみ）';
    }
    return 'Gmail下書き作成（CREATE_DRAFTS・手動送信のみ）';
  }
  if (exclusionReason.includes('form_later')) {
    return 'form_later — 後回し。人間がフォーム送信した場合のみ manual_form として記録';
  }
  if (exclusionReason.includes('draft_created')) {
    return 'Gmail下書き確認 → 人間が手動送信 → sendStatus=sent / manual_gmail で記録';
  }
  if (exclusionReason.includes('送信済') || exclusionReason.includes('manual_sent')) {
    return '返信待ちまたはフォローアップ管理';
  }
  if (exclusionReason.includes('replied') || exclusionReason.includes('フォローアップ')) {
    return 'フォローアップのみ（初回Gmail下書き対象外）';
  }
  if (exclusionReason.includes('pending') || exclusionReason.includes('承認')) {
    return '人間承認後にGmail下書き作成';
  }
  if (exclusionReason.includes('emailSubject') || exclusionReason.includes('emailBody')) {
    return 'npm run growly-sales:generate で営業文生成後、Gmail下書き作成';
  }
  if (exclusionReason.includes('emailCandidatesなし')) {
    return 'day1でメール再抽出、または Phase 21 fetch でメールあり候補を追加';
  }
  return '対象外 — 状態確認';
}

export function compareEmailOutreachPriority(a: Lead, b: Lead): number {
  const score = (lead: Lead): number => {
    let s = 0;
    if (hasEmailCandidates(lead)) s += 1000;
    if (lead.sendStatus === 'not_sent') s += 500;
    if (lead.humanReviewStatus === 'approved') s += 200;
    else if (lead.humanReviewStatus === 'pending') s += 100;
    if (lead.gmailDraftStatus === 'none') s += 50;
    if (lead.leadScore === 'A') s += 30;
    else if (lead.leadScore === 'B') s += 20;
    if (lead.emailCandidateConfidence === 'high') s += 10;
    return s;
  };
  return score(b) - score(a);
}

export function buildEmailOutreachCandidateView(
  lead: Lead,
  offer?: OfferProfile
): EmailOutreachCandidateView {
  const exclusionReason = getGmailDraftExclusionReason(lead, offer);
  const emailSource = resolveEmailSourceFromLead(lead);
  const collectionProfile = buildCollectionProfileDisplayFromLead(lead);
  return {
    companyName: lead.companyName,
    websiteUrl: lead.websiteUrl,
    emailCandidates: [...lead.emailCandidates],
    emailCandidateSourceUrls: [...lead.emailCandidateSourceUrls],
    email: emailSource.email,
    emailSourceUrl: emailSource.emailSourceUrl,
    emailSourceLabel: emailSource.emailSourceLabel,
    emailSourceCompactLabel: emailSource.emailSourceCompactLabel,
    sourcePageType: emailSource.sourcePageType,
    officialSiteUrl: emailSource.officialSiteUrl,
    isOfficialSiteOrigin: emailSource.isOfficialSiteOrigin,
    emailSourceConfirmed: emailSource.emailSourceConfirmed,
    isPlaceholderEmail: emailSource.isPlaceholderEmail,
    isPersonalEmail: emailSource.isPersonalEmail,
    batchId: emailSource.batchId,
    source: emailSource.source,
    humanReviewStatus: lead.humanReviewStatus,
    sendStatus: lead.sendStatus,
    gmailDraftStatus: lead.gmailDraftStatus,
    replyStatus: lead.replyStatus,
    dealStatus: lead.dealStatus,
    exclusionReason,
    outreachDeferStatus: getOutreachDeferStatus(lead),
    recommendedAction: getRecommendedOutreachAction(lead, exclusionReason),
    collectionProfileId: lead.collectionProfileId ?? null,
    collectionProfileName: lead.collectionProfileName ?? null,
    collectionMode: lead.collectionMode ?? null,
    industryCategory: lead.industryCategory ?? null,
    areaStrategy: lead.areaStrategy ?? null,
    prefecture: lead.prefecture ?? null,
    discoverySource: lead.discoverySource ?? null,
    discoverySourceSite: lead.discoverySourceSite ?? null,
    discoverySourceLabel: lead.discoverySourceLabel ?? null,
    discoverySourceUrl: lead.discoverySourceUrl ?? null,
    sourceComplianceStatus: lead.sourceComplianceStatus ?? null,
    collectionProfile,
  };
}

export function selectGmailDraftCreationTargets(leads: Lead[], offer?: OfferProfile): Lead[] {
  return leads
    .filter((lead) => isGmailDraftEligible(lead, offer))
    .sort(compareEmailOutreachPriority);
}

/** 下書き候補タブに表示する Lead（承認待ち pending を含む。作成可能かは isGmailDraftEligible で判定） */
export function selectGmailDraftTabLeads(leads: Lead[], offer?: OfferProfile): Lead[] {
  return leads
    .filter((lead) => {
      if (lead.sendStatus !== 'not_sent') return false;
      if (lead.gmailDraftStatus === 'draft_created') return false;
      if (!hasEmailCandidates(lead)) return false;
      if (!lead.emailSubject?.trim() || !lead.emailBody?.trim()) return false;
      if (lead.doNotContact) return false;
      if (lead.humanReviewStatus === 'rejected' || lead.humanReviewStatus === 'needs_revision') {
        return false;
      }
      const reason = getGmailDraftExclusionReason(lead, offer);
      if (reason?.includes('pending')) return true;
      return isGmailDraftEligible(lead, offer);
    })
    .sort(compareEmailOutreachPriority);
}

export function selectTopEmailOutreachCandidates(
  leads: Lead[],
  limit: number,
  offer?: OfferProfile
): EmailOutreachCandidateView[] {
  return selectGmailDraftCreationTargets(leads, offer)
    .slice(0, limit)
    .map((lead) => buildEmailOutreachCandidateView(lead, offer));
}
