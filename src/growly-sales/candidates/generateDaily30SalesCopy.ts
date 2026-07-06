import type { ExternalLeadCandidate } from '../adapters/externalLeadCandidateTypes.js';
import type { GenerationProfiles } from '../generation/applyFullGeneration.js';
import { generateCompanyAnalysis } from '../generation/generateCompanyAnalysis.js';
import { generateCustomHook } from '../generation/generateCustomHook.js';
import { generateSalesEmail } from '../generation/generateSalesEmail.js';
import { generateSalesAngle } from '../scoring/generateSalesAngle.js';
import { scoreLead } from '../scoring/scoreLead.js';
import { buildLeadStubFromExternalCandidate } from './buildLeadStubFromExternalCandidate.js';
import { pickDaily30TargetEmail } from './pickDaily30TargetEmail.js';
import { assertNotSuppressed, SuppressionBlockedError } from '../mail-operations/index.js';

export { SuppressionBlockedError };

export interface Daily30SalesCopyResult {
  candidate: ExternalLeadCandidate;
  stubLead: ReturnType<typeof buildLeadStubFromExternalCandidate>;
}

/** 承認済み候補に営業文を生成（leads.json には書き込まない） */
export function generateDaily30SalesCopyForCandidate(
  candidate: ExternalLeadCandidate,
  profiles: GenerationProfiles
): Daily30SalesCopyResult {
  const targetEmail = pickDaily30TargetEmail(candidate.emailCandidates ?? []);
  if (targetEmail) {
    assertNotSuppressed({
      tenantId: 'want-reach',
      emailAddress: targetEmail,
      leadId: candidate.externalCandidateId,
      operation: 'generate_sales_copy',
    });
  }

  const stubLead = buildLeadStubFromExternalCandidate(candidate);
  const salesAngle = generateSalesAngle(stubLead, profiles.offer);
  const leadScore = scoreLead(stubLead, profiles.target);
  const companyAnalysis = generateCompanyAnalysis(stubLead, {
    salesAngle,
    offer: profiles.offer,
    target: profiles.target,
  });
  const hookResult = generateCustomHook(stubLead, { offer: profiles.offer });
  const { emailSubject, emailBody } = generateSalesEmail(stubLead, {
    customHook: hookResult.customHook,
    salesAngle,
    offer: profiles.offer,
  });

  const primarySourceUrl =
    candidate.emailCandidateSourceUrls?.[0]?.trim() ||
    candidate.sourceUrl?.trim() ||
    null;
  const now = new Date().toISOString();

  const enrichedStub = {
    ...stubLead,
    salesAngle,
    leadScore,
    companyAnalysis,
    customHook: hookResult.customHook,
    hookSourceType: hookResult.hookSourceType,
    hookSourceUrl: hookResult.hookSourceUrl,
    customHookReason: hookResult.customHookReason,
    emailSubject,
    emailBody,
  };

  const updatedCandidate: ExternalLeadCandidate = {
    ...candidate,
    generatedEmailSubject: emailSubject,
    generatedEmailBody: emailBody,
    generatedCustomHook: hookResult.customHook,
    generatedCustomHookReason: hookResult.customHookReason,
    targetEmail,
    emailCandidateSourceUrl: primarySourceUrl,
    failureReason: null,
    copyGeneratedAt: now,
    updatedAt: now,
  };

  return { candidate: updatedCandidate, stubLead: enrichedStub };
}
