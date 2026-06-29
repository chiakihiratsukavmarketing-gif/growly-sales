import type { TargetProfile } from '../config/targetProfile.js';
import type { ExternalLeadCandidate, ExternalCandidateSourceType } from './externalLeadCandidateTypes.js';
import type { Daily30RegionGroup } from '../candidates/daily30CandidateStatus.js';
import { createExternalCandidateId } from './externalLeadCandidateTypes.js';
import { isTargetIndustry } from '../config/targetProfile.js';
import { enrichExternalLeadCandidate } from '../candidates/enrichCandidateFields.js';

function normalizeCompanyName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

export function normalizeWebsiteUrl(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  try {
    const parsed = new URL(url.trim());
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function inferIndustryFromQuery(query: string, profile: TargetProfile): string {
  for (const industry of profile.industries) {
    if (query.includes(industry)) return industry;
  }
  return profile.industries[0] ?? '工務店';
}

function inferAreaFromQuery(query: string, profile: TargetProfile): string {
  for (const area of profile.defaultAreas) {
    if (query.includes(area)) return area;
  }
  return profile.defaultAreas[0] ?? '宮城県';
}

function computeConfidenceScore(input: {
  sourceType: ExternalCandidateSourceType;
  websiteUrl: string | null;
  companyName: string;
  industry: string;
  profile: TargetProfile;
}): number {
  let score = input.sourceType === 'google_places' ? 0.7 : 0.55;
  if (input.websiteUrl) score += 0.2;
  if (isTargetIndustry(input.industry, input.profile)) score += 0.05;
  if (input.companyName.length >= 2) score += 0.05;
  return Math.min(1, Number(score.toFixed(2)));
}

export interface RawExternalCandidateInput {
  sourceType: ExternalCandidateSourceType;
  companyName: string;
  area?: string;
  industry?: string;
  websiteUrl?: string | null;
  phoneNumber?: string | null;
  address?: string | null;
  googlePlaceId?: string | null;
  sourceUrl?: string | null;
  sourceQuery: string;
  prefecture?: string;
  regionGroup?: Daily30RegionGroup | '';
  collectionPriority?: number;
  collectionAreaSource?: string;
  collectionBatchId?: string;
}

export function buildExternalLeadCandidate(
  input: RawExternalCandidateInput,
  profile: TargetProfile,
  now = new Date().toISOString()
): ExternalLeadCandidate {
  const companyName = normalizeCompanyName(input.companyName);
  const websiteUrl = normalizeWebsiteUrl(input.websiteUrl);
  const industry = input.industry?.trim() || inferIndustryFromQuery(input.sourceQuery, profile);
  const area = input.area?.trim() || inferAreaFromQuery(input.sourceQuery, profile);

  const importStatus = websiteUrl ? 'preview' : 'needs_review';

  const base: ExternalLeadCandidate = {
    externalCandidateId: createExternalCandidateId(),
    sourceType: input.sourceType,
    companyName,
    area,
    industry,
    websiteUrl,
    officialSiteUrl: websiteUrl,
    phoneNumber: input.phoneNumber?.trim() || null,
    address: input.address?.trim() || null,
    googlePlaceId: input.googlePlaceId?.trim() || null,
    sourceUrl: input.sourceUrl?.trim() || null,
    sourceQuery: input.sourceQuery,
    category: industry,
    contactFormUrl: null,
    emailCandidates: [],
    confidenceScore: computeConfidenceScore({
      sourceType: input.sourceType,
      websiteUrl,
      companyName,
      industry,
      profile,
    }),
    importStatus,
    riskLevel: websiteUrl ? 'low' : 'medium',
    duplicateReason: '',
    duplicateKey: '',
    pipelineStatus: 'collected',
    prefecture: input.prefecture?.trim() || area.replace(/市.*$/, '') || area,
    regionGroup: input.regionGroup ?? '',
    collectionPriority: input.collectionPriority ?? 0,
    collectionAreaSource: input.collectionAreaSource?.trim() || area,
    collectionBatchId: input.collectionBatchId?.trim() || now.slice(0, 10),
    emailCandidateSourceUrls: [],
    emailVerifiedAt: null,
    notes: '',
    collectedAt: now,
    createdAt: now,
    updatedAt: now,
  };

  return enrichExternalLeadCandidate(base);
}
