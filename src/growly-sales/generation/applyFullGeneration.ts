import type { Lead } from '../types/lead.js';
import type { OfferProfile } from '../config/offerProfile.js';
import type { TargetProfile } from '../config/targetProfile.js';
import { generateCompanyAnalysis } from './generateCompanyAnalysis.js';
import { generateCustomHook } from './generateCustomHook.js';
import { generateSalesEmail } from './generateSalesEmail.js';
import { isOutreachEligible } from './generationUtils.js';
import { isInitialOutreachEligible, isFollowUpOnlyLead } from '../outreach/outreachEligibility.js';
import { generateSalesAngle } from '../scoring/generateSalesAngle.js';
import { scoreLead } from '../scoring/scoreLead.js';
import { reviewSalesEmail } from '../review/reviewSalesEmail.js';
import { assertNotSuppressed } from '../mail-operations/index.js';

export interface GenerationProfiles {
  target: TargetProfile;
  offer: OfferProfile;
}

export interface GenerationStats {
  processed: number;
  generated: number;
  rejected: number;
  revised: number;
  approved: number;
  skipped: number;
}

function preserveWorkflowState(before: Lead, after: Lead): Lead {
  const sendStatus =
    before.sendStatus === 'blocked' || before.doNotContact
      ? 'blocked'
      : before.sendStatus === 'sent'
        ? 'sent'
        : before.manualSentAt
          ? 'manual_sent'
          : before.sendStatus ?? 'not_sent';

  return {
    ...after,
    sendStatus,
    manualSentAt: before.manualSentAt,
    manualSendMethod: before.manualSendMethod,
    replyStatus: before.replyStatus ?? 'none',
    replyReceivedAt: before.replyReceivedAt,
    replyMemo: before.replyMemo ?? '',
    followUpDate: before.followUpDate,
    followUpMemo: before.followUpMemo ?? '',
    dealStatus: before.dealStatus ?? 'none',
    outcomeMemo: before.outcomeMemo ?? '',
    communicationMemo: before.communicationMemo ?? '',
    doNotContact: before.doNotContact,
    gmailDraftStatus: before.gmailDraftStatus ?? 'none',
    gmailDraftId: before.gmailDraftId,
    gmailDraftCreatedAt: before.gmailDraftCreatedAt,
    gmailDraftError: before.gmailDraftError ?? '',
    gmailDraftPreviewedAt: before.gmailDraftPreviewedAt,
  };
}

export function applyFullGenerationToLead(lead: Lead, profiles: GenerationProfiles): Lead {
  const primaryEmail = lead.emailCandidates[0] ?? null;
  assertNotSuppressed({
    tenantId: 'want-reach',
    lead,
    leadId: lead.id,
    emailAddress: primaryEmail,
    operation: 'generate_sales_copy',
  });

  const now = new Date().toISOString();
  const salesAngle = generateSalesAngle(lead, profiles.offer);
  const leadScore = scoreLead(lead, profiles.target);
  const companyAnalysis = generateCompanyAnalysis(lead, {
    salesAngle,
    offer: profiles.offer,
    target: profiles.target,
  });
  const customHookResult = generateCustomHook(lead, { offer: profiles.offer });

  const customHook = customHookResult.customHook;
  const hookMeta = {
    hookSourceType: customHookResult.hookSourceType,
    hookSourceUrl: customHookResult.hookSourceUrl,
    customHookReason: customHookResult.customHookReason,
  };

  if (!isInitialOutreachEligible(lead) || lead.doNotContact) {
    if (isFollowUpOnlyLead(lead)) {
      return preserveWorkflowState(lead, {
        ...lead,
        nextAction: lead.nextAction?.trim()
          ? lead.nextAction
          : 'フォローアップのみ（初回営業メール・Gmail下書き対象外）',
        updatedAt: now,
      });
    }

    if (lead.sendStatus === 'sent' || lead.sendStatus === 'manual_sent') {
      return preserveWorkflowState(lead, {
        ...lead,
        salesAngle,
        leadScore,
        companyAnalysis,
        customHook,
        ...hookMeta,
        updatedAt: now,
      });
    }

    const review = reviewSalesEmail(
      { ...lead, emailSubject: '', emailBody: '', salesAngle, companyAnalysis, customHook, leadScore },
      profiles.offer
    );
    return preserveWorkflowState(lead, {
      ...lead,
      salesAngle,
      leadScore,
      companyAnalysis,
      customHook,
      ...hookMeta,
      emailSubject: '',
      emailBody: '',
      reviewStatus: review.reviewStatus === 'pending' ? 'reject' : review.reviewStatus,
      reviewComment: review.reviewComment,
      nextAction: review.nextAction,
      humanReviewStatus: 'pending',
      sendStatus: 'not_sent',
      replyStatus: lead.replyStatus ?? 'none',
      updatedAt: now,
    });
  }

  const { emailSubject, emailBody } = generateSalesEmail(lead, {
    customHook,
    salesAngle,
    offer: profiles.offer,
  });

  const review = reviewSalesEmail(
    { ...lead, salesAngle, leadScore, companyAnalysis, customHook, emailSubject, emailBody },
    profiles.offer
  );

  return preserveWorkflowState(lead, {
    ...lead,
    salesAngle,
    leadScore,
    companyAnalysis,
    customHook,
    ...hookMeta,
    emailSubject: review.reviewStatus === 'reject' ? '' : emailSubject,
    emailBody: review.reviewStatus === 'reject' ? '' : emailBody,
    reviewStatus: review.reviewStatus,
    reviewComment: review.reviewComment,
    nextAction: review.nextAction,
    humanReviewStatus: 'pending',
    sendStatus: 'not_sent',
    updatedAt: now,
  });
}

/**
 * 送信前Leadの営業メールのみ新テンプレートで再生成（承認・sendStatusは維持）。
 * 旧Gmail下書きIDは無効化し、CREATE_DRAFTS での再作成を促す。
 */
export function refreshLeadSalesEmailTemplate(lead: Lead, offer: OfferProfile): Lead {
  if (!lead.customHook?.trim()) return lead;

  const { emailSubject, emailBody } = generateSalesEmail(lead, {
    customHook: lead.customHook,
    salesAngle: lead.salesAngle,
    offer,
  });

  const review = reviewSalesEmail({ ...lead, emailSubject, emailBody }, offer);
  const now = new Date().toISOString();
  const clearStaleDraft =
    lead.gmailDraftStatus === 'draft_created' && lead.sendStatus === 'not_sent';
  const staleDraftId = lead.gmailDraftId;

  return {
    ...lead,
    emailSubject: review.reviewStatus === 'reject' ? lead.emailSubject : emailSubject,
    emailBody: review.reviewStatus === 'reject' ? lead.emailBody : emailBody,
    reviewStatus: review.reviewStatus,
    reviewComment: review.reviewComment,
    nextAction: clearStaleDraft
      ? '新テンプレート反映済。npm run growly-sales:gmail-create-drafts（CREATE_DRAFTS 必須）'
      : lead.nextAction,
    communicationMemo: clearStaleDraft && staleDraftId
      ? [lead.communicationMemo, `旧Gmail下書き無効（${staleDraftId}）`].filter(Boolean).join(' / ')
      : lead.communicationMemo,
    gmailDraftStatus: clearStaleDraft ? 'none' : lead.gmailDraftStatus,
    gmailDraftId: clearStaleDraft ? null : lead.gmailDraftId,
    gmailDraftCreatedAt: clearStaleDraft ? null : lead.gmailDraftCreatedAt,
    gmailDraftError: clearStaleDraft ? '' : lead.gmailDraftError,
    updatedAt: now,
  };
}

export function applyFullGenerationToLeads(
  leads: Lead[],
  profiles: GenerationProfiles
): { leads: Lead[]; stats: GenerationStats } {
  const stats: GenerationStats = {
    processed: leads.length,
    generated: 0,
    rejected: 0,
    revised: 0,
    approved: 0,
    skipped: 0,
  };

  const updated = leads.map((lead) => {
    const result = applyFullGenerationToLead(lead, profiles);
    if (!isInitialOutreachEligible(lead) || lead.doNotContact) {
      stats.skipped++;
      stats.rejected++;
    } else {
      stats.generated++;
      if (result.reviewStatus === 'approve') stats.approved++;
      if (result.reviewStatus === 'revise') stats.revised++;
      if (result.reviewStatus === 'reject') stats.rejected++;
    }
    return result;
  });

  return { leads: updated, stats };
}
