import type { ExternalLeadCandidate } from '../adapters/externalLeadCandidateTypes.js';
import type { Lead } from '../types/lead.js';
import type {
  Daily30AreaStrategy,
  Daily30CollectionMode,
  Daily30DiscoverySource,
  Daily30DiscoverySourceSite,
  Daily30SourceComplianceStatus,
} from './daily30CollectionProfile.js';
import {
  AREA_STRATEGY_LABELS,
  COLLECTION_MODE_LABELS,
  DISCOVERY_SOURCE_LABELS,
  formatDiscoverySourceSiteLabel,
} from './daily30CollectionScheduleLabels.js';
import { DAILY_30_AREA_EXPANSION } from './daily30AreaConfig.js';

const PRIORITY_PREFECTURES = new Set(DAILY_30_AREA_EXPANSION.map((a) => a.prefecture));

export const LEAD_DISCOVERY_SOURCE_FILTER_OPTIONS = [
  { value: 'all', label: 'すべて' },
  { value: 'google_places', label: 'Google Places / 公式サイト検索' },
  { value: 'job_site_reference', label: '求人サイト参考' },
  { value: 'rakuten_marketplace_reference', label: '楽天市場参考' },
  { value: 'portal_site_reference', label: '地域ポータル参考' },
  { value: 'industry_directory_reference', label: '業界団体サイト参考' },
  { value: 'manual_url', label: '手動URL' },
] as const;

export const LEAD_DISCOVERY_SOURCE_SITE_FILTER_OPTIONS = [
  { value: 'all', label: 'すべて' },
  { value: 'wantedly', label: 'Wantedly' },
  { value: 'indeed', label: 'Indeed' },
  { value: 'kyujinbox', label: '求人ボックス' },
  { value: 'engage', label: 'engage' },
  { value: 'green', label: 'Green' },
  { value: 'doda', label: 'doda' },
  { value: 'mynavi_tenshoku', label: 'マイナビ転職' },
  { value: 'rikunabi_next', label: 'リクナビNEXT' },
  { value: 'other', label: 'その他' },
] as const;

export const LEAD_PREFECTURE_FILTER_OPTIONS = [
  { value: 'all', label: 'すべて' },
  { value: '宮城県', label: '宮城県' },
  { value: '福島県', label: '福島県' },
  { value: '山形県', label: '山形県' },
  { value: '茨城県', label: '茨城県' },
  { value: '栃木県', label: '栃木県' },
  { value: '群馬県', label: '群馬県' },
  { value: 'nationwide_other', label: '全国その他' },
] as const;

export const LEAD_AREA_STRATEGY_FILTER_OPTIONS = [
  { value: 'all', label: 'すべて' },
  { value: 'priority_miyagi_fukushima_yamagata', label: '宮城・福島・山形優先' },
  { value: 'north_kanto', label: '北関東' },
  { value: 'nationwide_excluding_tokyo', label: '全国（東京除外）' },
] as const;

export const LEAD_COLLECTION_MODE_FILTER_OPTIONS = [
  { value: 'all', label: 'すべて' },
  { value: 'auto_continue', label: 'おまかせ継続' },
  { value: 'user_selected', label: 'ユーザー指定' },
  { value: 'one_day_override', label: '1日だけ指定' },
  { value: 'manual', label: '手動' },
] as const;

export const LEAD_EMAIL_COMPLIANCE_FILTER_OPTIONS = [
  { value: 'all', label: 'すべて' },
  { value: 'official_site_verified', label: '公式サイトメール確認済み' },
  { value: 'email_not_found', label: 'メール未確認' },
  { value: 'needs_human_review', label: '要確認' },
  { value: 'blocked_by_policy', label: 'ポリシーブロック' },
] as const;

export const SOURCE_COMPLIANCE_LABELS: Record<Daily30SourceComplianceStatus, string> = {
  official_site_verified: '公式サイトメール確認済み',
  official_site_not_found: '公式サイト未確認',
  email_not_found: 'メール未確認',
  blocked_by_policy: 'ポリシーブロック',
  needs_human_review: '要確認',
};

export interface CollectionProfileDisplayInfo {
  collectionProfileName: string;
  collectionMode: Daily30CollectionMode | null;
  collectionModeLabel: string;
  areaStrategy: Daily30AreaStrategy | null;
  areaStrategyLabel: string;
  prefecture: string;
  discoverySource: Daily30DiscoverySource | null;
  discoverySourceLabel: string;
  discoverySourceSite: Daily30DiscoverySourceSite | null;
  discoverySourceSiteLabel: string;
  discoverySourceUrl: string | null;
  sourceComplianceStatus: Daily30SourceComplianceStatus | 'unset';
  complianceLabel: string;
  hasProfileFields: boolean;
}

function extractPrefectureFromText(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const m = trimmed.match(/^(.+?[都道府県])/);
  return m?.[1] ?? null;
}

export function resolveLeadPrefecture(lead: Lead): string {
  return (
    lead.prefecture?.trim() ||
    extractPrefectureFromText(lead.collectionAreaSource ?? '') ||
    extractPrefectureFromText(lead.area) ||
    lead.area?.trim() ||
    '未設定'
  );
}

export function resolveCandidatePrefecture(candidate: ExternalLeadCandidate): string {
  return (
    candidate.prefecture?.trim() ||
    extractPrefectureFromText(candidate.collectionAreaSource ?? '') ||
    candidate.area?.trim() ||
    '未設定'
  );
}

function mapLegacySourceTypeToDiscovery(
  sourceType: ExternalLeadCandidate['sourceType'] | null | undefined
): Daily30DiscoverySource | null {
  switch (sourceType) {
    case 'google_places':
      return 'google_places';
    case 'web_search':
      return 'official_site_search';
    case 'manual':
      return 'manual_url';
    default:
      return null;
  }
}

export function resolveLeadDiscoverySource(lead: Lead): Daily30DiscoverySource | null {
  if (lead.discoverySource) return lead.discoverySource;
  if (lead.source === 'daily30') return 'google_places';
  return null;
}

export function resolveCandidateDiscoverySource(
  candidate: ExternalLeadCandidate
): Daily30DiscoverySource | null {
  if (candidate.discoverySource) return candidate.discoverySource;
  return mapLegacySourceTypeToDiscovery(candidate.sourceType);
}

export function resolveLeadSourceComplianceStatus(
  lead: Lead
): Daily30SourceComplianceStatus | 'unset' {
  if (lead.sourceComplianceStatus) return lead.sourceComplianceStatus;
  const hasEmail = lead.emailCandidates.some((e) => e.trim());
  const emailSource =
    lead.emailSourceUrl?.trim() || lead.emailCandidateSourceUrls.find((u) => u.trim());
  if (hasEmail && emailSource) return 'official_site_verified';
  if (hasEmail && !emailSource) return 'needs_human_review';
  if (!hasEmail && lead.websiteUrl?.trim()) return 'email_not_found';
  return 'unset';
}

export function resolveCandidateSourceComplianceStatus(
  candidate: ExternalLeadCandidate
): Daily30SourceComplianceStatus | 'unset' {
  if (candidate.sourceComplianceStatus) return candidate.sourceComplianceStatus;
  const hasEmail = Boolean(candidate.targetEmail?.trim() || candidate.emailCandidates?.length);
  const emailSource = candidate.emailCandidateSourceUrl?.trim();
  if (hasEmail && emailSource) return 'official_site_verified';
  if (hasEmail && !emailSource) return 'needs_human_review';
  if (!hasEmail && (candidate.websiteUrl || candidate.officialSiteUrl)) return 'email_not_found';
  return 'unset';
}

function discoveryLabel(
  source: Daily30DiscoverySource | null,
  customLabel: string | null | undefined,
  site: Daily30DiscoverySourceSite | null
): string {
  if (customLabel?.trim()) return customLabel.trim();
  if (!source) return '未設定';
  if (source === 'job_site_reference' && site) {
    return `${DISCOVERY_SOURCE_LABELS.job_site_reference} / ${formatDiscoverySourceSiteLabel(site)}`;
  }
  if (source === 'google_places' || source === 'official_site_search') {
    return DISCOVERY_SOURCE_LABELS.google_places;
  }
  return DISCOVERY_SOURCE_LABELS[source] ?? source;
}

export function buildCollectionProfileDisplayFromLead(lead: Lead): CollectionProfileDisplayInfo {
  const discoverySource = resolveLeadDiscoverySource(lead);
  const compliance = resolveLeadSourceComplianceStatus(lead);
  const hasProfileFields = Boolean(
    lead.collectionProfileId ||
      lead.collectionMode ||
      lead.discoverySource ||
      lead.areaStrategy
  );
  return {
    collectionProfileName: lead.collectionProfileName?.trim() || '未設定',
    collectionMode: lead.collectionMode ?? null,
    collectionModeLabel: lead.collectionMode
      ? COLLECTION_MODE_LABELS[lead.collectionMode]
      : '未設定',
    areaStrategy: lead.areaStrategy ?? null,
    areaStrategyLabel: lead.areaStrategy
      ? AREA_STRATEGY_LABELS[lead.areaStrategy]
      : '未設定',
    prefecture: resolveLeadPrefecture(lead),
    discoverySource,
    discoverySourceLabel: discoveryLabel(
      discoverySource,
      lead.discoverySourceLabel,
      lead.discoverySourceSite ?? null
    ),
    discoverySourceSite: lead.discoverySourceSite ?? null,
    discoverySourceSiteLabel: formatDiscoverySourceSiteLabel(lead.discoverySourceSite),
    discoverySourceUrl: lead.discoverySourceUrl?.trim() || null,
    sourceComplianceStatus: compliance,
    complianceLabel:
      compliance === 'unset' ? '未設定' : SOURCE_COMPLIANCE_LABELS[compliance],
    hasProfileFields,
  };
}

/** 候補企業の情報・メールを実際に確認したページURL（発見元URLではない） */
export function resolveCandidateCollectionDestinationUrl(
  candidate: ExternalLeadCandidate
): string | null {
  const pageUrl =
    candidate.emailCandidateSourceUrl?.trim() ||
    candidate.emailCandidateSourceUrls?.find((u) => u.trim())?.trim() ||
    null;
  if (pageUrl) return pageUrl;

  const siteUrl =
    candidate.officialSiteUrl?.trim() || candidate.websiteUrl?.trim() || null;
  if (siteUrl) return siteUrl;

  return candidate.contactFormUrl?.trim() || null;
}

export function buildCollectionProfileDisplayFromCandidate(
  candidate: ExternalLeadCandidate
): CollectionProfileDisplayInfo {
  const discoverySource = resolveCandidateDiscoverySource(candidate);
  const compliance = resolveCandidateSourceComplianceStatus(candidate);
  const hasProfileFields = Boolean(
    candidate.collectionProfileId ||
      candidate.collectionMode ||
      candidate.discoverySource ||
      candidate.areaStrategy
  );
  return {
    collectionProfileName: candidate.collectionProfileName?.trim() || '未設定',
    collectionMode: candidate.collectionMode ?? null,
    collectionModeLabel: candidate.collectionMode
      ? COLLECTION_MODE_LABELS[candidate.collectionMode]
      : '未設定',
    areaStrategy: candidate.areaStrategy ?? null,
    areaStrategyLabel: candidate.areaStrategy
      ? AREA_STRATEGY_LABELS[candidate.areaStrategy]
      : '未設定',
    prefecture: resolveCandidatePrefecture(candidate),
    discoverySource,
    discoverySourceLabel: discoveryLabel(
      discoverySource,
      candidate.discoverySourceLabel,
      candidate.discoverySourceSite ?? null
    ),
    discoverySourceSite: candidate.discoverySourceSite ?? null,
    discoverySourceSiteLabel: formatDiscoverySourceSiteLabel(candidate.discoverySourceSite),
    discoverySourceUrl:
      candidate.discoverySourceUrl?.trim() || candidate.sourceUrl?.trim() || null,
    sourceComplianceStatus: compliance,
    complianceLabel:
      compliance === 'unset' ? '未設定' : SOURCE_COMPLIANCE_LABELS[compliance],
    hasProfileFields,
  };
}

export function matchesLeadDiscoverySourceFilter(lead: Lead, filter: string): boolean {
  if (!filter || filter === 'all') return true;
  const resolved = resolveLeadDiscoverySource(lead);
  if (!resolved) return false;
  if (filter === 'google_places') {
    return resolved === 'google_places' || resolved === 'official_site_search';
  }
  return resolved === filter;
}

export function matchesLeadDiscoverySourceSiteFilter(lead: Lead, filter: string): boolean {
  if (!filter || filter === 'all') return true;
  const source = resolveLeadDiscoverySource(lead);
  if (source !== 'job_site_reference') return false;
  return (lead.discoverySourceSite ?? '') === filter;
}

export function matchesLeadPrefectureFilter(lead: Lead, filter: string): boolean {
  if (!filter || filter === 'all') return true;
  const prefecture = resolveLeadPrefecture(lead);
  if (filter === 'nationwide_other') {
    return prefecture !== '未設定' && !PRIORITY_PREFECTURES.has(prefecture);
  }
  return prefecture === filter || lead.area.includes(filter.replace('県', ''));
}

export function matchesLeadAreaStrategyFilter(lead: Lead, filter: string): boolean {
  if (!filter || filter === 'all') return true;
  return lead.areaStrategy === filter;
}

export function matchesLeadCollectionModeFilter(lead: Lead, filter: string): boolean {
  if (!filter || filter === 'all') return true;
  return lead.collectionMode === filter;
}

export function matchesLeadEmailComplianceFilter(lead: Lead, filter: string): boolean {
  if (!filter || filter === 'all') return true;
  const status = resolveLeadSourceComplianceStatus(lead);
  if (filter === 'official_site_verified') {
    return status === 'official_site_verified';
  }
  if (status === 'unset') return filter === 'email_not_found';
  return status === filter;
}

export function matchesCandidateDiscoverySourceFilter(
  candidate: ExternalLeadCandidate,
  filter: string
): boolean {
  if (!filter || filter === 'all') return true;
  const resolved = resolveCandidateDiscoverySource(candidate);
  if (!resolved) return false;
  if (filter === 'google_places') {
    return resolved === 'google_places' || resolved === 'official_site_search';
  }
  return resolved === filter;
}

export function matchesCandidateDiscoverySourceSiteFilter(
  candidate: ExternalLeadCandidate,
  filter: string
): boolean {
  if (!filter || filter === 'all') return true;
  if (resolveCandidateDiscoverySource(candidate) !== 'job_site_reference') return false;
  return (candidate.discoverySourceSite ?? '') === filter;
}

export function matchesCandidatePrefectureFilter(
  candidate: ExternalLeadCandidate,
  filter: string
): boolean {
  if (!filter || filter === 'all') return true;
  const prefecture = resolveCandidatePrefecture(candidate);
  if (filter === 'nationwide_other') {
    return prefecture !== '未設定' && !PRIORITY_PREFECTURES.has(prefecture);
  }
  return prefecture === filter;
}

export function matchesCandidateAreaStrategyFilter(
  candidate: ExternalLeadCandidate,
  filter: string
): boolean {
  if (!filter || filter === 'all') return true;
  return candidate.areaStrategy === filter;
}

export function matchesCandidateCollectionModeFilter(
  candidate: ExternalLeadCandidate,
  filter: string
): boolean {
  if (!filter || filter === 'all') return true;
  return candidate.collectionMode === filter;
}

export function shortenDisplayUrl(url: string, maxLen = 36): string {
  const trimmed = url.trim();
  if (!trimmed) return '—';
  try {
    const u = new URL(trimmed);
    const host = u.hostname.replace(/^www\./, '');
    const path = u.pathname === '/' ? '' : u.pathname;
    const short = `${host}${path}`;
    if (short.length <= maxLen) return short;
    return `${short.slice(0, maxLen - 1)}…`;
  } catch {
    if (trimmed.length <= maxLen) return trimmed;
    return `${trimmed.slice(0, maxLen - 1)}…`;
  }
}
