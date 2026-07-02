import type { ExternalLeadCandidate } from '../adapters/externalLeadCandidateTypes.js';
import type { Lead } from '../types/lead.js';
import { isReferenceOnlyDiscoverySource } from '../adapters/discovery/index.js';
import { normalizeHostFromUrl } from '../adapters/discovery/externalReferenceHosts.js';
import {
  externalCandidateDedupeKey,
  findDuplicateReason,
} from '../adapters/dedupeExternalCandidates.js';
import { createExternalCandidateId } from '../adapters/externalLeadCandidateTypes.js';
import { normalizeWebsiteUrl } from '../adapters/normalizeExternalLeadCandidate.js';
import { todayBatchIdJst } from './daily30AreaConfig.js';
import type {
  Daily30DiscoverySource,
  Daily30DiscoverySourceSite,
  Daily30IndustryCategory,
} from './daily30CollectionProfile.js';
import {
  DISCOVERY_SOURCE_LABELS,
  formatDiscoverySourceSiteLabel,
} from './daily30CollectionScheduleLabels.js';
import { enrichCandidateEmailFromWebsite } from './enrichCandidateEmailFromWebsite.js';
import { enrichExternalLeadCandidate } from './enrichCandidateFields.js';
import {
  industryLabelFromCategory,
  inferRegionGroupFromPrefecture,
  MANUAL_EXTERNAL_REFERENCE_PROFILE_ID,
  MANUAL_EXTERNAL_REFERENCE_PROFILE_NAME,
  MANUAL_EXTERNAL_REFERENCE_WARNINGS,
} from './manualExternalReferenceConstants.js';
import { isDaily30PrefectureExcluded } from './daily30PrefectureRegistry.js';
import {
  applySourceComplianceFields,
  getDiscoverySourceUrl,
  isUrlOnDiscoverySourceDomain,
} from './sourceCompliance.js';
import { hostsMatchUrl } from '../adapters/discovery/externalReferenceHosts.js';

export interface ManualExternalReferenceInput {
  discoverySourceUrl: string;
  discoverySource: Daily30DiscoverySource;
  discoverySourceSite?: Daily30DiscoverySourceSite | null;
  companyName: string;
  officialSiteUrl?: string | null;
  prefecture?: string | null;
  industryCategory?: Daily30IndustryCategory;
  manualNote?: string | null;
  shouldEnrichOfficialSiteEmail?: boolean;
}

export interface ManualExternalReferenceCandidateSummary {
  id: string;
  companyName: string;
  discoverySource: Daily30DiscoverySource;
  discoverySourceSite: Daily30DiscoverySourceSite | null;
  discoverySourceUrl: string;
  officialSiteUrl: string | null;
  sourceComplianceStatus: ExternalLeadCandidate['sourceComplianceStatus'];
  emailSourceUrl: string | null;
  collectionProfileId: string;
  pipelineStatus: ExternalLeadCandidate['pipelineStatus'];
  importStatus: ExternalLeadCandidate['importStatus'];
}

export interface ManualExternalReferenceResult {
  ok: boolean;
  candidate: ManualExternalReferenceCandidateSummary;
  warnings: string[];
  duplicateReason?: string | null;
}

function buildDiscoverySourceLabel(
  discoverySource: Daily30DiscoverySource,
  discoverySourceSite: Daily30DiscoverySourceSite | null
): string {
  const base = DISCOVERY_SOURCE_LABELS[discoverySource] ?? discoverySource;
  if (discoverySource === 'job_site_reference' && discoverySourceSite) {
    return `${base} / ${formatDiscoverySourceSiteLabel(discoverySourceSite)}`;
  }
  return base;
}

function findDuplicateDiscoverySourceUrl(
  discoverySourceUrl: string,
  existingCandidates: ExternalLeadCandidate[]
): ExternalLeadCandidate | null {
  const normalized = discoverySourceUrl.trim();
  if (!normalized) return null;
  for (const other of existingCandidates) {
    if (other.discoverySourceUrl?.trim() === normalized) return other;
  }
  return null;
}

function buildBaseCandidate(
  input: ManualExternalReferenceInput,
  batchId: string,
  runId: string,
  now: string
): ExternalLeadCandidate {
  const companyName = input.companyName.trim();
  const discoverySourceUrl = normalizeWebsiteUrl(input.discoverySourceUrl) ?? input.discoverySourceUrl.trim();
  const officialSiteUrl = normalizeWebsiteUrl(input.officialSiteUrl);
  const prefecture = input.prefecture?.trim() || '';
  const industryCategory = input.industryCategory ?? 'housing';
  const industry = industryLabelFromCategory(industryCategory);
  const discoverySourceSite =
    input.discoverySource === 'job_site_reference'
      ? input.discoverySourceSite ?? 'other'
      : input.discoverySourceSite ?? null;

  const notes = [input.manualNote?.trim(), '手動外部参照で登録（掲載元URLへ自動アクセスなし）']
    .filter(Boolean)
    .join(' / ');

  const candidate: ExternalLeadCandidate = {
    externalCandidateId: createExternalCandidateId(),
    sourceType: 'manual',
    companyName,
    area: prefecture || '未設定',
    industry,
    websiteUrl: officialSiteUrl,
    officialSiteUrl,
    phoneNumber: null,
    address: null,
    googlePlaceId: null,
    sourceUrl: discoverySourceUrl,
    sourceQuery: `manual-external-reference:${input.discoverySource}`,
    category: industry,
    contactFormUrl: null,
    emailCandidates: [],
    confidenceScore: officialSiteUrl ? 0.65 : 0.45,
    importStatus: 'preview',
    riskLevel: officialSiteUrl ? 'low' : 'medium',
    duplicateReason: '',
    duplicateKey: '',
    pipelineStatus: officialSiteUrl ? 'collected' : 'email_not_found',
    prefecture,
    regionGroup: inferRegionGroupFromPrefecture(prefecture),
    collectionPriority: 0,
    collectionAreaSource: prefecture || '手動',
    collectionBatchId: batchId,
    emailCandidateSourceUrls: [],
    emailVerifiedAt: null,
    generatedEmailSubject: null,
    generatedEmailBody: null,
    generatedCustomHook: null,
    generatedCustomHookReason: null,
    targetEmail: null,
    emailCandidateSourceUrl: null,
    failureReason: null,
    copyGeneratedAt: null,
    qualityCheckedAt: null,
    humanReviewStatus: 'pending',
    gmailDraftStatus: null,
    sendStatus: null,
    notes,
    collectedAt: now,
    createdAt: now,
    updatedAt: now,
    collectionProfileId: MANUAL_EXTERNAL_REFERENCE_PROFILE_ID,
    collectionProfileName: MANUAL_EXTERNAL_REFERENCE_PROFILE_NAME,
    collectionMode: 'manual',
    industryCategory,
    areaStrategy: 'priority_miyagi_fukushima_yamagata',
    areaQueuePosition: 0,
    discoverySource: input.discoverySource,
    discoverySourceSite,
    discoverySourceLabel: buildDiscoverySourceLabel(input.discoverySource, discoverySourceSite),
    discoverySourceUrl,
    sourceComplianceNote: input.manualNote?.trim() || null,
    collectionRunId: runId,
  };

  return enrichExternalLeadCandidate(candidate);
}

function toSummary(candidate: ExternalLeadCandidate): ManualExternalReferenceCandidateSummary {
  return {
    id: candidate.externalCandidateId,
    companyName: candidate.companyName,
    discoverySource: candidate.discoverySource ?? 'manual_url',
    discoverySourceSite: candidate.discoverySourceSite ?? null,
    discoverySourceUrl: candidate.discoverySourceUrl ?? '',
    officialSiteUrl: candidate.officialSiteUrl ?? candidate.websiteUrl,
    sourceComplianceStatus: candidate.sourceComplianceStatus ?? null,
    emailSourceUrl: candidate.emailCandidateSourceUrl ?? null,
    collectionProfileId: candidate.collectionProfileId ?? MANUAL_EXTERNAL_REFERENCE_PROFILE_ID,
    pipelineStatus: candidate.pipelineStatus,
    importStatus: candidate.importStatus,
  };
}

export function validateManualExternalReferenceInput(input: ManualExternalReferenceInput): string | null {
  if (!input.discoverySourceUrl?.trim()) return '掲載元URLが必要です';
  if (!input.companyName?.trim()) return '会社名が必要です';
  if (!isReferenceOnlyDiscoverySource(input.discoverySource)) {
    return '手動外部参照で許可されていない収集元です';
  }
  try {
    new URL(input.discoverySourceUrl.trim());
  } catch {
    return '掲載元URLの形式が不正です';
  }
  if (input.officialSiteUrl?.trim()) {
    const normalized = normalizeWebsiteUrl(input.officialSiteUrl);
    if (!normalized) return '公式サイト候補URLの形式が不正です';
  }
  if (input.prefecture?.trim() && isDaily30PrefectureExcluded(input.prefecture.trim())) {
    return '東京都は対象外です';
  }
  return null;
}

export async function createManualExternalReferenceCandidate(
  input: ManualExternalReferenceInput,
  existingCandidates: ExternalLeadCandidate[],
  existingLeads: Lead[] = []
): Promise<{ candidate: ExternalLeadCandidate; warnings: string[]; duplicateReason: string | null }> {
  const validationError = validateManualExternalReferenceInput(input);
  if (validationError) {
    throw new Error(validationError);
  }

  const warnings: string[] = [
    MANUAL_EXTERNAL_REFERENCE_WARNINGS.external_reference_url_is_discovery_only,
    MANUAL_EXTERNAL_REFERENCE_WARNINGS.email_source_must_be_official_site,
  ];

  const batchId = todayBatchIdJst();
  const now = new Date().toISOString();
  const runId = `manual-external-reference-${batchId}-${Date.now()}`;

  let candidate = buildBaseCandidate(input, batchId, runId, now);

  if (input.prefecture?.trim() && isDaily30PrefectureExcluded(input.prefecture.trim())) {
    warnings.push(MANUAL_EXTERNAL_REFERENCE_WARNINGS.tokyo_excluded);
    candidate = applySourceComplianceFields({
      ...candidate,
      sourceComplianceStatus: 'blocked_by_policy',
      sourceComplianceNote: '東京都は対象外',
    });
  }

  const dupByDiscovery = findDuplicateDiscoverySourceUrl(
    candidate.discoverySourceUrl ?? '',
    existingCandidates
  );
  if (dupByDiscovery) {
    warnings.push(MANUAL_EXTERNAL_REFERENCE_WARNINGS.duplicate_candidate);
  }

  const dupReason = findDuplicateReason(candidate, existingLeads, existingCandidates);
  if (dupReason) {
    warnings.push(
      dupReason.startsWith('既存Lead') ? MANUAL_EXTERNAL_REFERENCE_WARNINGS.duplicate_lead : MANUAL_EXTERNAL_REFERENCE_WARNINGS.duplicate_candidate
    );
  }

  if (input.shouldEnrichOfficialSiteEmail === true && candidate.officialSiteUrl) {
    const notesBeforeEnrich = candidate.notes ?? '';
    candidate = await enrichCandidateEmailFromWebsite(candidate);
    const notesAfterEnrich = candidate.notes ?? '';
    if (notesAfterEnrich.includes('発見元 URL を公式サイトとしてメール確認しません')) {
      warnings.push(MANUAL_EXTERNAL_REFERENCE_WARNINGS.discovery_url_same_as_official_skipped);
    } else if (
      notesAfterEnrich.includes('メール確認エラー') ||
      notesAfterEnrich.includes('メール確認失敗')
    ) {
      warnings.push(MANUAL_EXTERNAL_REFERENCE_WARNINGS.official_site_enrich_failed);
    } else if (notesAfterEnrich !== notesBeforeEnrich && candidate.pipelineStatus === 'email_not_found') {
      warnings.push(MANUAL_EXTERNAL_REFERENCE_WARNINGS.official_site_enrich_failed);
    }
    if (
      candidate.emailCandidateSourceUrl &&
      isUrlOnDiscoverySourceDomain(candidate.emailCandidateSourceUrl, candidate)
    ) {
      candidate = applySourceComplianceFields({
        ...candidate,
        emailCandidates: [],
        targetEmail: null,
        emailCandidateSourceUrl: null,
        emailCandidateSourceUrls: [],
        pipelineStatus: 'email_not_found',
        sourceComplianceStatus: 'blocked_by_policy',
        sourceComplianceNote: '発見元URLをメール取得元として使用できません',
      });
    }
  }

  candidate = applySourceComplianceFields(candidate);

  if (dupByDiscovery || dupReason) {
    candidate = {
      ...candidate,
      importStatus: 'duplicate',
      duplicateReason: dupReason ?? `外部候補と重複（掲載元URL）: ${dupByDiscovery?.companyName ?? ''}`,
      pipelineStatus: candidate.pipelineStatus === 'duplicate' ? 'duplicate' : candidate.pipelineStatus,
      duplicateKey: candidate.duplicateKey || externalCandidateDedupeKey(candidate),
      updatedAt: new Date().toISOString(),
    };
  } else if ((candidate.emailCandidates.length > 0 || candidate.targetEmail) && candidate.pipelineStatus !== 'duplicate') {
    candidate = { ...candidate, pipelineStatus: 'email_found', updatedAt: new Date().toISOString() };
  } else if (candidate.pipelineStatus === 'collected') {
    candidate = { ...candidate, pipelineStatus: 'email_not_found', updatedAt: new Date().toISOString() };
  }

  const discoveryUrl = getDiscoverySourceUrl(candidate);
  const emailSource = candidate.emailCandidateSourceUrl;
  if (discoveryUrl && emailSource && hostsMatchUrl(discoveryUrl, emailSource)) {
    candidate = applySourceComplianceFields({
      ...candidate,
      sourceComplianceStatus: 'blocked_by_policy',
      sourceComplianceNote: '発見元URLをメール取得元として使用できません',
    });
  }

  return {
    candidate,
    warnings: [...new Set(warnings)],
    duplicateReason: dupReason ?? (dupByDiscovery ? candidate.duplicateReason : null),
  };
}

export function buildManualExternalReferenceResult(
  candidate: ExternalLeadCandidate,
  warnings: string[],
  duplicateReason: string | null
): ManualExternalReferenceResult {
  return {
    ok: true,
    candidate: toSummary(candidate),
    warnings,
    duplicateReason,
  };
}

export function isManualExternalReferenceHostFetch(url: string): boolean {
  const host = normalizeHostFromUrl(url);
  if (!host) return false;
  return host.includes('wantedly') || host.includes('rakuten') || host.includes('indeed');
}
