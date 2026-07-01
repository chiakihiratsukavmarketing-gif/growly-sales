import type { ExternalLeadCandidate } from '../adapters/externalLeadCandidateTypes.js';

function hasWebsiteUrl(candidate: ExternalLeadCandidate): boolean {
  return Boolean(candidate.websiteUrl?.trim() || candidate.officialSiteUrl?.trim());
}

function hasCorporateEmail(candidate: ExternalLeadCandidate): boolean {
  return (candidate.emailCandidates?.length ?? 0) > 0;
}

function hasEmailSourceUrls(candidate: ExternalLeadCandidate): boolean {
  return (candidate.emailCandidateSourceUrls?.length ?? 0) > 0;
}

function isNotImported(candidate: ExternalLeadCandidate): boolean {
  return (
    candidate.importStatus !== 'imported' &&
    candidate.importStatus !== 'duplicate' &&
    candidate.importStatus !== 'excluded'
  );
}

function isNotExcludedPipeline(candidate: ExternalLeadCandidate): boolean {
  return candidate.pipelineStatus !== 'duplicate' && candidate.pipelineStatus !== 'excluded';
}

/** Daily 30: Lead化前レビュー対象（email_found・未取り込み・必須フィールドあり） */
export function isDaily30LeadReviewCandidate(candidate: ExternalLeadCandidate): boolean {
  if (candidate.pipelineStatus !== 'email_found') return false;
  if (!isNotImported(candidate)) return false;
  if (!isNotExcludedPipeline(candidate)) return false;
  if (!candidate.companyName?.trim()) return false;
  if (!hasWebsiteUrl(candidate)) return false;
  if (!hasCorporateEmail(candidate)) return false;
  if (!hasEmailSourceUrls(candidate)) return false;
  return true;
}

/** Lead化承認待ち（レビュー対象かつ未承認） */
export function isDaily30LeadApprovalPending(candidate: ExternalLeadCandidate): boolean {
  return isDaily30LeadReviewCandidate(candidate) && candidate.importStatus !== 'approved_for_lead';
}

/** Lead化承認済み（営業文生成対象） */
export function isDaily30LeadApproved(candidate: ExternalLeadCandidate): boolean {
  return (
    candidate.importStatus === 'approved_for_lead' &&
    candidate.pipelineStatus === 'ready_for_copy' &&
    isNotExcludedPipeline(candidate)
  );
}

/** 営業文生成・品質チェックのパイプライン対象 */
export function isDaily30CopyPipelineTarget(candidate: ExternalLeadCandidate): boolean {
  if (candidate.importStatus !== 'approved_for_lead') return false;
  if (candidate.pipelineStatus === 'ready_for_draft') return false;
  if (candidate.pipelineStatus === 'duplicate' || candidate.pipelineStatus === 'excluded') {
    return false;
  }
  return candidate.pipelineStatus === 'ready_for_copy' || candidate.pipelineStatus === 'needs_review';
}

export function selectDaily30LeadReviewCandidates(
  candidates: ExternalLeadCandidate[]
): ExternalLeadCandidate[] {
  return candidates.filter(isDaily30LeadReviewCandidate);
}

export function selectDaily30LeadApprovalPending(
  candidates: ExternalLeadCandidate[]
): ExternalLeadCandidate[] {
  return candidates.filter(isDaily30LeadApprovalPending);
}

export function selectDaily30CopyPipelineTargets(
  candidates: ExternalLeadCandidate[]
): ExternalLeadCandidate[] {
  return candidates.filter(isDaily30CopyPipelineTarget);
}
