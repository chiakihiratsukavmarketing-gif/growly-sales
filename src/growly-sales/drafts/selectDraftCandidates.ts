import type { Lead } from '../types/lead.js';
import type { OfferProfile } from '../config/offerProfile.js';
import { containsProhibitedClaim } from '../config/offerProfile.js';
import { containsProhibitedPhrase } from '../generation/generationUtils.js';
import { hasEmailCandidates, hasContactForm } from '../analytics/contactPathTypes.js';
import { isFollowUpOnlyLead } from '../outreach/outreachEligibility.js';
import { MOJIBAKE_REPLACEMENT_CHAR } from '../storage/csvEncoding.js';

export interface DraftCandidateRecord {
  leadId: string;
  companyName: string;
  area: string;
  industry: string;
  websiteUrl: string;
  instagramUrl: string | null;
  contactFormUrl: string | null;
  emailCandidates: string[];
  emailSubject: string;
  emailBody: string;
  salesAngle: string;
  companyAnalysis: string;
  customHook: string;
  reviewComment: string;
  sourceUrls: string[];
  exportedAt: string;
}

export interface ExcludedLeadRecord {
  leadId: string;
  companyName: string;
  reason: string;
}

export interface DraftSelectionResult {
  candidates: DraftCandidateRecord[];
  excluded: ExcludedLeadRecord[];
}

function hasMojibakeInExportFields(lead: Lead): boolean {
  const fields = [
    lead.companyName,
    lead.area,
    lead.industry,
    lead.emailSubject,
    lead.emailBody,
  ];
  return fields.some((f) => f.includes(MOJIBAKE_REPLACEMENT_CHAR));
}

function hasContactChannel(lead: Lead): boolean {
  return hasEmailCandidates(lead) || hasContactForm(lead);
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

/** 下書きエクスポート対象外の理由。null なら候補 */
export function getDraftExclusionReason(lead: Lead, offer?: OfferProfile): string | null {
  if (isFollowUpOnlyLead(lead)) {
    return '初回営業済み・返信あり（フォローアップのみ・新規営業メール対象外）';
  }

  if (lead.humanReviewStatus === 'pending') {
    return 'humanReviewStatus=pending（人間承認待ち）';
  }
  if (lead.humanReviewStatus === 'rejected') {
    return 'humanReviewStatus=rejected（却下）';
  }
  if (lead.humanReviewStatus === 'needs_revision') {
    return 'humanReviewStatus=needs_revision（修正依頼）';
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
  if (lead.reviewStatus !== 'approve') {
    return `reviewStatus=${lead.reviewStatus}`;
  }

  if (lead.sendStatus === 'sent') {
    return 'sendStatus=sent（送信済）';
  }
  if (lead.sendStatus === 'blocked') {
    return 'sendStatus=blocked（ブロック）';
  }
  if (lead.sendStatus !== 'not_sent') {
    return `sendStatus=${lead.sendStatus}`;
  }

  if (lead.doNotContact) {
    return 'doNotContact=true（連絡禁止）';
  }

  if (lead.riskLevel === 'high') {
    return 'riskLevel=high';
  }
  if (lead.riskLevel !== 'low' && lead.riskLevel !== 'medium') {
    return `riskLevel=${lead.riskLevel}`;
  }

  if (!lead.emailSubject?.trim()) {
    return 'emailSubjectが空';
  }
  if (!lead.emailBody?.trim()) {
    return 'emailBodyが空';
  }

  if (!hasEmailCandidates(lead)) {
    if (hasContactForm(lead)) {
      return 'contactFormOnly（form_later・後回し）';
    }
    if (!hasContactChannel(lead)) {
      return '問い合わせ導線なし（電話のみ/不明・対象外）';
    }
  }

  const prohibited = findProhibitedPhrase(lead, offer);
  if (prohibited) {
    return `禁止表現を検出: ${prohibited}`;
  }

  if (hasMojibakeInExportFields(lead)) {
    return '文字化けの可能性（）';
  }

  if (!lead.sourceUrls.length) {
    return 'sourceUrlsが空';
  }

  return null;
}

export function leadToDraftCandidate(lead: Lead, exportedAt: string): DraftCandidateRecord {
  return {
    leadId: lead.id,
    companyName: lead.companyName,
    area: lead.area,
    industry: lead.industry,
    websiteUrl: lead.websiteUrl,
    instagramUrl: lead.instagramUrl,
    contactFormUrl: lead.contactFormUrl,
    emailCandidates: [...lead.emailCandidates],
    emailSubject: lead.emailSubject,
    emailBody: lead.emailBody,
    salesAngle: lead.salesAngle,
    companyAnalysis: lead.companyAnalysis,
    customHook: lead.customHook,
    reviewComment: lead.reviewComment,
    sourceUrls: [...lead.sourceUrls],
    exportedAt,
  };
}

export function selectDraftCandidates(
  leads: Lead[],
  offer?: OfferProfile,
  exportedAt = new Date().toISOString()
): DraftSelectionResult {
  const candidates: DraftCandidateRecord[] = [];
  const excluded: ExcludedLeadRecord[] = [];

  for (const lead of leads) {
    const reason = getDraftExclusionReason(lead, offer);
    if (reason) {
      excluded.push({
        leadId: lead.id,
        companyName: lead.companyName,
        reason,
      });
    } else {
      candidates.push(leadToDraftCandidate(lead, exportedAt));
    }
  }

  return { candidates, excluded };
}

export interface DraftStats {
  totalLeads: number;
  approvedCount: number;
  draftCandidateCount: number;
  notSentCount: number;
  doNotContactCount: number;
}

export function computeDraftStats(leads: Lead[], offer?: OfferProfile): DraftStats {
  const { candidates } = selectDraftCandidates(leads, offer);
  return {
    totalLeads: leads.length,
    approvedCount: leads.filter((l) => l.humanReviewStatus === 'approved').length,
    draftCandidateCount: candidates.length,
    notSentCount: leads.filter((l) => l.sendStatus === 'not_sent').length,
    doNotContactCount: leads.filter((l) => l.doNotContact).length,
  };
}
