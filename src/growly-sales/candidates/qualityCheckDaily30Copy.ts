import type { ExternalLeadCandidate } from '../adapters/externalLeadCandidateTypes.js';
import type { Lead } from '../types/lead.js';
import { findDuplicateReason, leadMatchesCandidate } from '../adapters/dedupeExternalCandidates.js';
import { getOutreachSignatureEmail } from '../config/env.js';
import { verifyLeadEmailBodyForGmailDraft } from '../integrations/gmail/gmailDraftLeadValidation.js';
import { MECHANICAL_IMPRESSION_PHRASES } from '../generation/generationUtils.js';
import { reviewSalesEmail } from '../review/reviewSalesEmail.js';
import type { OfferProfile } from '../config/offerProfile.js';
import { isAllowedCorporateEmail, looksLikePersonalEmail, isFreeEmailDomain } from '../safety/contactPolicy.js';

export interface Daily30QualityCheckResult {
  ok: boolean;
  exclude: boolean;
  errors: string[];
}

function hasMechanicalPhrase(text: string): string | null {
  for (const phrase of MECHANICAL_IMPRESSION_PHRASES) {
    if (text.includes(phrase)) return phrase;
  }
  return null;
}

function checkTargetEmail(targetEmail: string | null): string[] {
  const errors: string[] = [];
  if (!targetEmail?.trim()) {
    errors.push('送信先メール（targetEmail）が未設定');
    return errors;
  }
  const email = targetEmail.trim().toLowerCase();
  if (isFreeEmailDomain(email) || looksLikePersonalEmail(email)) {
    errors.push('個人メールの可能性があるため除外');
    return errors;
  }
  if (!isAllowedCorporateEmail(email)) {
    errors.push('公開代表・問い合わせメールではない可能性');
  }
  return errors;
}

/** 下書き候補化前の品質チェック */
export function qualityCheckDaily30Copy(
  candidate: ExternalLeadCandidate,
  stubLead: Lead,
  existingLeads: Lead[],
  offer: OfferProfile
): Daily30QualityCheckResult {
  const errors: string[] = [];
  let exclude = false;

  const subject = candidate.generatedEmailSubject?.trim() ?? '';
  const body = candidate.generatedEmailBody?.trim() ?? '';
  const customHook = candidate.generatedCustomHook?.trim() ?? '';
  const companyName = candidate.companyName.trim();

  errors.push(...checkTargetEmail(candidate.targetEmail));
  if (errors.some((e) => e.includes('個人メール'))) {
    exclude = true;
  }

  const dup = findDuplicateReason(candidate, existingLeads, []);
  if (dup) {
    const matched = existingLeads.find((l) => leadMatchesCandidate(l, candidate));
    if (matched?.sendStatus === 'sent' || matched?.sendStatus === 'manual_sent') {
      errors.push(`送信済みLeadと重複: ${matched.companyName}`);
      exclude = true;
    } else {
      errors.push(dup);
      exclude = true;
    }
  }

  if (!subject) {
    errors.push('件名が空');
  } else if (!subject.includes(companyName)) {
    errors.push('件名に会社名が含まれていない');
  }

  if (!body) {
    errors.push('本文が空');
  }

  const reviewLead: Lead = {
    ...stubLead,
    emailSubject: subject,
    emailBody: body,
    customHook,
    customHookReason: candidate.generatedCustomHookReason ?? '',
  };

  const review = reviewSalesEmail(reviewLead, offer);
  if (review.reviewStatus === 'reject') {
    errors.push(`校閲NG: ${review.reviewComment}`);
  }

  const bodyErrors = verifyLeadEmailBodyForGmailDraft(reviewLead, body);
  errors.push(...bodyErrors);

  const signatureEmail = getOutreachSignatureEmail();
  if (signatureEmail !== 'c_hiratsuka@wantreach.jp') {
    errors.push(`署名Email設定が期待値と異なる: ${signatureEmail}`);
  }

  const mechanicalInHook = hasMechanicalPhrase(customHook);
  if (mechanicalInHook) {
    errors.push(`customHookが機械的: ${mechanicalInHook}`);
  }
  const mechanicalInBody = hasMechanicalPhrase(body);
  if (mechanicalInBody) {
    errors.push(`本文が機械的: ${mechanicalInBody}`);
  }

  if (candidate.contactFormUrl && body.includes(candidate.contactFormUrl)) {
    errors.push('本文にフォームURLが含まれている');
  }
  for (const src of candidate.emailCandidateSourceUrls ?? []) {
    if (src.trim() && body.includes(src.trim())) {
      errors.push('本文に確認元URLが含まれている');
    }
  }

  if (companyName && body && !body.includes(companyName)) {
    errors.push('本文に会社名が含まれていない（矛盾の可能性）');
  }
  if (candidate.area?.trim() && body && !body.includes(candidate.area.trim().slice(0, 2))) {
    // 地域の大まかな整合（県名の一部など）— 厳しすぎる場合は revise のみ
  }

  const uniqueErrors = [...new Set(errors.filter(Boolean))];
  return {
    ok: uniqueErrors.length === 0,
    exclude,
    errors: uniqueErrors,
  };
}
