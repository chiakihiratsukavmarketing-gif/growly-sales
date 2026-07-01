import type {
  Daily30AreaStrategy,
  Daily30CollectionMode,
  Daily30DiscoverySource,
  Daily30DiscoverySourceSite,
  Daily30IndustryCategory,
} from './daily30CollectionProfile.js';

export const COLLECTION_MODE_LABELS: Record<Daily30CollectionMode, string> = {
  auto_continue: 'おまかせ継続',
  user_selected: 'ユーザー指定（継続）',
  one_day_override: '1日だけ指定',
  manual: '手動',
};

export const INDUSTRY_CATEGORY_LABELS: Record<Daily30IndustryCategory, string> = {
  housing: '住宅会社・工務店・リフォーム',
  reform: 'リフォーム',
  real_estate: '不動産',
  ec: 'EC店舗',
  other: 'その他',
};

export const AREA_STRATEGY_LABELS: Record<Daily30AreaStrategy, string> = {
  priority_miyagi_fukushima_yamagata: '宮城・福島・山形優先',
  north_kanto: '北関東',
  nationwide_excluding_tokyo: '全国（東京除外）',
};

export const AREA_STRATEGY_DESCRIPTIONS: Record<Daily30AreaStrategy, string> = {
  priority_miyagi_fukushima_yamagata:
    '宮城県 → 福島県 → 山形県を優先します。',
  north_kanto: '茨城県 → 栃木県 → 群馬県を優先します。',
  nationwide_excluding_tokyo:
    '東京都を除外し、全国46道府県を順番に探索します。',
};

export const DISCOVERY_SOURCE_LABELS: Record<Daily30DiscoverySource, string> = {
  google_places: 'Google Places / 公式サイト検索',
  official_site_search: '公式サイト検索',
  job_site_reference: '求人サイトを参考',
  rakuten_marketplace_reference: '楽天市場を参考',
  portal_site_reference: '地域ポータルを参考',
  industry_directory_reference: '業界団体サイトを参考',
  manual_url: '手動URL',
};

export const DISCOVERY_SOURCE_SITE_LABELS: Record<Daily30DiscoverySourceSite, string> = {
  wantedly: 'Wantedly',
  indeed: 'Indeed',
  kyujinbox: '求人ボックス',
  engage: 'engage',
  green: 'Green',
  doda: 'doda',
  mynavi_tenshoku: 'マイナビ転職',
  rikunabi_next: 'リクナビNEXT',
  other: 'その他',
};

export function formatDiscoverySourceSiteLabel(
  site: Daily30DiscoverySourceSite | null | undefined
): string {
  if (!site) return 'なし';
  return DISCOVERY_SOURCE_SITE_LABELS[site] ?? site;
}

export function formatAreaStrategyLongLabel(strategy: Daily30AreaStrategy): string {
  return `${AREA_STRATEGY_LABELS[strategy]}（${AREA_STRATEGY_DESCRIPTIONS[strategy]}）`;
}

export function formatActiveProfileSummary(input: {
  collectionProfileName: string;
  collectionMode: Daily30CollectionMode;
  industryCategory: Daily30IndustryCategory;
  areaStrategy: Daily30AreaStrategy;
  discoverySource: Daily30DiscoverySource;
  discoverySourceSite?: Daily30DiscoverySourceSite | null;
}): string {
  const mode = COLLECTION_MODE_LABELS[input.collectionMode] ?? input.collectionMode;
  const industry = INDUSTRY_CATEGORY_LABELS[input.industryCategory] ?? input.industryCategory;
  const area = AREA_STRATEGY_LABELS[input.areaStrategy] ?? input.areaStrategy;
  const source =
    input.discoverySource === 'job_site_reference' && input.discoverySourceSite
      ? `${DISCOVERY_SOURCE_LABELS.job_site_reference}（${formatDiscoverySourceSiteLabel(input.discoverySourceSite)}）`
      : DISCOVERY_SOURCE_LABELS[input.discoverySource] ?? input.discoverySource;
  return `${mode} / ${industry} / ${area} / ${source}`;
}
