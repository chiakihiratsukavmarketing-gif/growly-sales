import type { ExternalLeadCandidate } from '../adapters/externalLeadCandidateTypes.js';
import { externalCandidateDedupeKey } from '../adapters/dedupeExternalCandidates.js';
import { inferSourceComplianceStatus } from './daily30CollectionProfile.js';

/** 保存用フィールドを補完（既存JSONとの後方互換） */
export function enrichExternalLeadCandidate(
  candidate: ExternalLeadCandidate
): ExternalLeadCandidate {
  const duplicateKey = candidate.duplicateKey?.trim() || externalCandidateDedupeKey(candidate);
  return {
    ...candidate,
    duplicateKey,
    officialSiteUrl: candidate.officialSiteUrl ?? candidate.websiteUrl,
    category: candidate.category?.trim() || candidate.industry,
    notes: candidate.notes ?? '',
    contactFormUrl: candidate.contactFormUrl ?? null,
    emailCandidates: candidate.emailCandidates ?? [],
    emailCandidateSourceUrls: candidate.emailCandidateSourceUrls ?? [],
    collectedAt: candidate.collectedAt ?? candidate.createdAt,
    pipelineStatus: candidate.pipelineStatus ?? 'collected',
    prefecture: candidate.prefecture?.trim() || candidate.area || '',
    regionGroup: candidate.regionGroup ?? '',
    collectionPriority: candidate.collectionPriority ?? 0,
    collectionAreaSource: candidate.collectionAreaSource?.trim() || candidate.area || '',
    collectionBatchId: candidate.collectionBatchId?.trim() || '',
    emailVerifiedAt: candidate.emailVerifiedAt ?? null,
    generatedEmailSubject: candidate.generatedEmailSubject ?? null,
    generatedEmailBody: candidate.generatedEmailBody ?? null,
    generatedCustomHook: candidate.generatedCustomHook ?? null,
    generatedCustomHookReason: candidate.generatedCustomHookReason ?? null,
    targetEmail: candidate.targetEmail ?? null,
    emailCandidateSourceUrl: candidate.emailCandidateSourceUrl ?? null,
    failureReason: candidate.failureReason ?? null,
    copyGeneratedAt: candidate.copyGeneratedAt ?? null,
    qualityCheckedAt: candidate.qualityCheckedAt ?? null,
    humanReviewStatus: candidate.humanReviewStatus ?? null,
    gmailDraftStatus: candidate.gmailDraftStatus ?? null,
    sendStatus: candidate.sendStatus ?? null,
    excludedAt: candidate.excludedAt ?? null,
    excludedReason: candidate.excludedReason ?? null,
    excludedBy: candidate.excludedBy ?? null,
    collectionProfileId: candidate.collectionProfileId ?? null,
    collectionProfileName: candidate.collectionProfileName ?? null,
    collectionMode: candidate.collectionMode ?? null,
    industryCategory: candidate.industryCategory ?? null,
    areaStrategy: candidate.areaStrategy ?? null,
    areaQueuePosition: candidate.areaQueuePosition ?? null,
    discoverySource: candidate.discoverySource ?? null,
    discoverySourceSite: candidate.discoverySourceSite ?? null,
    discoverySourceLabel: candidate.discoverySourceLabel ?? null,
    discoverySourceUrl: candidate.discoverySourceUrl ?? null,
    sourceComplianceNote: candidate.sourceComplianceNote ?? null,
    collectionRunId: candidate.collectionRunId ?? null,
    sourceComplianceStatus:
      candidate.sourceComplianceStatus ?? inferSourceComplianceStatus(candidate),
  };
}

export function enrichExternalLeadCandidates(
  candidates: ExternalLeadCandidate[]
): ExternalLeadCandidate[] {
  return candidates.map(enrichExternalLeadCandidate);
}
