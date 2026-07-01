import type { ExternalLeadCandidate } from '../adapters/externalLeadCandidateTypes.js';
import type { Lead } from '../types/lead.js';

export type Daily30CollectionMode = 'auto_continue' | 'user_selected' | 'one_day_override' | 'manual';

export type Daily30IndustryCategory = 'housing' | 'reform' | 'real_estate' | 'ec' | 'other';

export type Daily30AreaStrategy =
  | 'priority_miyagi_fukushima_yamagata'
  | 'north_kanto'
  | 'nationwide_excluding_tokyo';

export type Daily30DiscoverySource =
  | 'google_places'
  | 'official_site_search'
  | 'job_site_reference'
  | 'rakuten_marketplace_reference'
  | 'portal_site_reference'
  | 'industry_directory_reference'
  | 'manual_url';

export type Daily30DiscoverySourceSite =
  | 'wantedly'
  | 'indeed'
  | 'kyujinbox'
  | 'engage'
  | 'green'
  | 'doda'
  | 'mynavi_tenshoku'
  | 'rikunabi_next'
  | 'other';

export type Daily30SourceComplianceStatus =
  | 'official_site_verified'
  | 'official_site_not_found'
  | 'email_not_found'
  | 'blocked_by_policy'
  | 'needs_human_review';

export interface Daily30CollectionProfileSnapshot {
  collectionProfileId: string;
  collectionProfileName: string;
  collectionMode: Daily30CollectionMode;
  industryCategory: Daily30IndustryCategory;
  areaStrategy: Daily30AreaStrategy;
  /** 探索キュー上の位置（都道府県レジストリの index を想定。未導入時は 0） */
  areaQueuePosition: number;
  /** 発見元の分類（求人サイト等は reference のみ。Phase 40.6 で有効化予定） */
  discoverySource: Daily30DiscoverySource;
  discoverySourceSite: Daily30DiscoverySourceSite | null;
  discoverySourceLabel: string | null;
  discoverySourceUrl: string | null;
  sourceComplianceStatus: Daily30SourceComplianceStatus | null;
  sourceComplianceNote: string | null;
  /** 収集実行単位（runDaily30CloudAutoFetch の runId と同等を想定） */
  collectionRunId: string | null;
}

export function defaultDaily30CollectionProfileSnapshot(): Daily30CollectionProfileSnapshot {
  return {
    collectionProfileId: 'daily30-housing-auto',
    collectionProfileName: '住宅系おまかせ継続',
    collectionMode: 'auto_continue',
    industryCategory: 'housing',
    areaStrategy: 'priority_miyagi_fukushima_yamagata',
    areaQueuePosition: 0,
    discoverySource: 'google_places',
    discoverySourceSite: null,
    discoverySourceLabel: 'Google Places / 公式サイト検索',
    discoverySourceUrl: null,
    sourceComplianceStatus: null,
    sourceComplianceNote: null,
    collectionRunId: null,
  };
}

export function applyDaily30CollectionProfileSnapshot(
  candidate: ExternalLeadCandidate,
  snapshot: Daily30CollectionProfileSnapshot
): ExternalLeadCandidate {
  return {
    ...candidate,
    collectionProfileId: candidate.collectionProfileId ?? snapshot.collectionProfileId,
    collectionProfileName: candidate.collectionProfileName ?? snapshot.collectionProfileName,
    collectionMode: candidate.collectionMode ?? snapshot.collectionMode,
    industryCategory: candidate.industryCategory ?? snapshot.industryCategory,
    areaStrategy: candidate.areaStrategy ?? snapshot.areaStrategy,
    areaQueuePosition: candidate.areaQueuePosition ?? snapshot.areaQueuePosition,
    discoverySource: candidate.discoverySource ?? snapshot.discoverySource,
    discoverySourceSite: candidate.discoverySourceSite ?? snapshot.discoverySourceSite,
    discoverySourceLabel: candidate.discoverySourceLabel ?? snapshot.discoverySourceLabel,
    discoverySourceUrl: candidate.discoverySourceUrl ?? snapshot.discoverySourceUrl,
    sourceComplianceStatus: candidate.sourceComplianceStatus ?? snapshot.sourceComplianceStatus,
    sourceComplianceNote: candidate.sourceComplianceNote ?? snapshot.sourceComplianceNote,
    collectionRunId: candidate.collectionRunId ?? snapshot.collectionRunId,
  };
}

/** emailSource 系と混同しないための最小コンプライアンス推定（Phase 40.2） */
export function inferSourceComplianceStatus(
  candidate: Pick<ExternalLeadCandidate, 'officialSiteUrl' | 'websiteUrl' | 'targetEmail' | 'emailCandidateSourceUrl'>
): Daily30SourceComplianceStatus {
  const hasOfficial = Boolean(candidate.officialSiteUrl?.trim() || candidate.websiteUrl?.trim());
  if (!hasOfficial) return 'official_site_not_found';
  if (candidate.targetEmail?.trim() && candidate.emailCandidateSourceUrl?.trim()) {
    return 'official_site_verified';
  }
  return 'email_not_found';
}

export function mapLegacySourceTypeToDiscoverySource(
  sourceType: ExternalLeadCandidate['sourceType']
): Daily30DiscoverySource {
  switch (sourceType) {
    case 'google_places':
      return 'google_places';
    case 'web_search':
      return 'official_site_search';
    case 'manual':
      return 'manual_url';
    default:
      return 'google_places';
  }
}

export interface ApplyDaily30CollectionProfileInput {
  batchId: string;
  areaQueuePosition?: number;
  collectionRunId?: string | null;
  profile?: Daily30CollectionProfileSnapshot;
}

/** 新規候補にデフォルト収集プロファイルを付与（既存値は上書きしない） */
export function applyDaily30DefaultCollectionProfile(
  candidate: ExternalLeadCandidate,
  input: ApplyDaily30CollectionProfileInput
): ExternalLeadCandidate {
  const base = input.profile ?? defaultDaily30CollectionProfileSnapshot();
  const discoverySource =
    candidate.discoverySource ?? mapLegacySourceTypeToDiscoverySource(candidate.sourceType);
  const discoverySourceUrl =
    candidate.discoverySourceUrl ??
    (discoverySource === 'job_site_reference' ||
    discoverySource === 'rakuten_marketplace_reference' ||
    discoverySource === 'portal_site_reference'
      ? candidate.sourceUrl
      : candidate.sourceUrl);
  const withProfile = applyDaily30CollectionProfileSnapshot(candidate, {
    ...base,
    areaQueuePosition: input.areaQueuePosition ?? base.areaQueuePosition,
    collectionRunId: input.collectionRunId ?? base.collectionRunId,
    discoverySource,
    discoverySourceUrl,
    discoverySourceLabel:
      candidate.discoverySourceLabel ??
      base.discoverySourceLabel ??
      (discoverySource === 'google_places' ? 'Google Places' : '公式サイト検索'),
  });
  return {
    ...withProfile,
    collectionBatchId: candidate.collectionBatchId?.trim() || input.batchId,
    sourceComplianceStatus:
      candidate.sourceComplianceStatus ?? inferSourceComplianceStatus(withProfile),
  };
}

/** 候補の収集プロファイルを Lead に引き継ぐ（optional フィールドのみ） */
export function copyCollectionProfileToLead(
  candidate: ExternalLeadCandidate,
  lead: Lead
): Lead {
  return {
    ...lead,
    collectionProfileId: lead.collectionProfileId ?? candidate.collectionProfileId ?? null,
    collectionProfileName: lead.collectionProfileName ?? candidate.collectionProfileName ?? null,
    collectionMode: lead.collectionMode ?? candidate.collectionMode ?? null,
    industryCategory: lead.industryCategory ?? candidate.industryCategory ?? null,
    areaStrategy: lead.areaStrategy ?? candidate.areaStrategy ?? null,
    areaQueuePosition: lead.areaQueuePosition ?? candidate.areaQueuePosition ?? null,
    discoverySource: lead.discoverySource ?? candidate.discoverySource ?? null,
    discoverySourceSite: lead.discoverySourceSite ?? candidate.discoverySourceSite ?? null,
    discoverySourceLabel: lead.discoverySourceLabel ?? candidate.discoverySourceLabel ?? null,
    discoverySourceUrl: lead.discoverySourceUrl ?? candidate.discoverySourceUrl ?? null,
    sourceComplianceStatus:
      lead.sourceComplianceStatus ?? candidate.sourceComplianceStatus ?? null,
    sourceComplianceNote: lead.sourceComplianceNote ?? candidate.sourceComplianceNote ?? null,
    collectionRunId: lead.collectionRunId ?? candidate.collectionRunId ?? null,
    collectionBatchId: lead.collectionBatchId ?? candidate.collectionBatchId ?? null,
    prefecture: lead.prefecture ?? candidate.prefecture ?? null,
    regionGroup: lead.regionGroup ?? candidate.regionGroup ?? null,
    collectionPriority: lead.collectionPriority ?? candidate.collectionPriority ?? null,
    collectionAreaSource: lead.collectionAreaSource ?? candidate.collectionAreaSource ?? null,
  };
}

