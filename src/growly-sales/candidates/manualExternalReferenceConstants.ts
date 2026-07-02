import type {
  Daily30DiscoverySource,
  Daily30IndustryCategory,
} from './daily30CollectionProfile.js';
import { REFERENCE_ONLY_DISCOVERY_SOURCES } from '../adapters/discovery/index.js';

export const MANUAL_EXTERNAL_REFERENCE_PROFILE_ID = 'manual-external-reference';
export const MANUAL_EXTERNAL_REFERENCE_PROFILE_NAME = '手動外部参照';

export const MANUAL_EXTERNAL_REFERENCE_ALLOWED_DISCOVERY_SOURCES =
  REFERENCE_ONLY_DISCOVERY_SOURCES satisfies readonly Daily30DiscoverySource[];

export const MANUAL_EXTERNAL_REFERENCE_WARNINGS = {
  external_reference_url_is_discovery_only:
    'external_reference_url_is_discovery_only',
  email_source_must_be_official_site: 'email_source_must_be_official_site',
  duplicate_candidate: 'duplicate_candidate',
  duplicate_lead: 'duplicate_lead',
  tokyo_excluded: 'tokyo_excluded',
  discovery_url_same_as_official_skipped: 'discovery_url_same_as_official_skipped',
  official_site_enrich_failed: 'official_site_enrich_failed',
} as const;

export function industryLabelFromCategory(category: Daily30IndustryCategory): string {
  switch (category) {
    case 'housing':
      return '工務店';
    case 'reform':
      return 'リフォーム';
    case 'real_estate':
      return '不動産';
    case 'ec':
      return 'EC';
    default:
      return 'その他';
  }
}

export function inferRegionGroupFromPrefecture(prefecture: string): '' | '宮城' | '福島' | '山形' | '北関東' {
  if (prefecture.includes('宮城')) return '宮城';
  if (prefecture.includes('福島')) return '福島';
  if (prefecture.includes('山形')) return '山形';
  if (prefecture.includes('茨城') || prefecture.includes('栃木') || prefecture.includes('群馬')) {
    return '北関東';
  }
  return '';
}
