import type { ExternalLeadCandidate } from '../adapters/externalLeadCandidateTypes.js';
import { createEmptyLead, type Lead } from '../types/lead.js';

/** 営業文生成用の in-memory Lead（leads.json には書き込まない） */
export function buildLeadStubFromExternalCandidate(candidate: ExternalLeadCandidate): Lead {
  const websiteUrl = candidate.websiteUrl?.trim() || candidate.officialSiteUrl?.trim() || '';
  const sourceUrls = [
    candidate.sourceUrl,
    ...(candidate.emailCandidateSourceUrls ?? []),
  ].filter((u): u is string => Boolean(u?.trim()));

  return createEmptyLead({
    companyName: candidate.companyName,
    area: candidate.area,
    industry: candidate.industry,
    websiteUrl,
    emailCandidates: candidate.emailCandidates ?? [],
    emailCandidateSourceUrls: candidate.emailCandidateSourceUrls ?? [],
    emailCandidateConfidence: (candidate.emailCandidates?.length ?? 0) > 0 ? 'medium' : 'low',
    emailContactType: 'corporate',
    contactPathType: candidate.contactFormUrl ? 'both' : 'email',
    contactPathConfidence: 'medium',
    contactFormUrl: candidate.contactFormUrl,
    collectionStatus: 'collected',
    riskLevel: candidate.riskLevel,
    sourceUrls: [...new Set(sourceUrls)],
    prefecture: candidate.prefecture,
    regionGroup: candidate.regionGroup,
    collectionPriority: candidate.collectionPriority,
    collectionAreaSource: candidate.collectionAreaSource,
    collectionBatchId: candidate.collectionBatchId,
    daily30PipelineStatus: candidate.pipelineStatus,
    source: 'daily30',
  });
}
