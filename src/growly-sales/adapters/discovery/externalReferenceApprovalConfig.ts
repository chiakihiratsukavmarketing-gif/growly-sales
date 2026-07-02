import type {
  Daily30DiscoverySource,
  Daily30DiscoverySourceSite,
} from '../../candidates/daily30CollectionProfile.js';

/** 外部参照元の人間承認ステータス（Phase 41.3） */
export type ExternalReferenceApprovalStatus =
  | 'not_requested'
  | 'approved_for_manual_url'
  | 'approved_for_dry_run'
  | 'approved_for_low_frequency'
  | 'blocked';

/** adapter 実行計画のモード */
export type DiscoveryAdapterExecutionMode =
  | 'manual_only'
  | 'dry_run_only'
  | 'low_frequency_allowed'
  | 'blocked';

/** discovery 段階で取得してよいフィールド（メールは含まない） */
export const EXTERNAL_REFERENCE_ALLOWED_DISCOVERY_FIELDS = [
  'companyName',
  'officialSiteUrl',
  'discoverySourceUrl',
  'area',
  'prefecture',
  'industryCategory',
  'notes',
] as const;

export type ExternalReferenceAllowedDiscoveryField =
  (typeof EXTERNAL_REFERENCE_ALLOWED_DISCOVERY_FIELDS)[number];

export interface ExternalReferenceApprovalConfigEntry {
  /** 設定キー（監査用） */
  configId: string;
  discoverySource: Daily30DiscoverySource;
  discoverySourceSite: Daily30DiscoverySourceSite | null;
  displayName: string;
  enabled: boolean;
  /** 人間がサイト別承認を完了したか（low_frequency 実行に必要） */
  humanApproved: boolean;
  approvalStatus: ExternalReferenceApprovalStatus;
  robotsChecked: boolean;
  termsChecked: boolean;
  maxRequestsPerRun: number;
  maxCandidatesPerRun: number;
  minIntervalMs: number;
  requiresLogin: boolean;
  hasCaptchaRisk: boolean;
  notes: string;
  allowedFields: readonly ExternalReferenceAllowedDiscoveryField[];
}

export interface ExternalReferenceApprovalLookupKey {
  discoverySource: Daily30DiscoverySource;
  discoverySourceSite?: Daily30DiscoverySourceSite | null;
}

const DEFAULT_ALLOWED_FIELDS = EXTERNAL_REFERENCE_ALLOWED_DISCOVERY_FIELDS;

const LOW_FREQUENCY_LIMITS = {
  maxRequestsPerRun: 3,
  maxCandidatesPerRun: 5,
  minIntervalMs: 5_000,
} as const;

const DRY_RUN_LIMITS = {
  maxRequestsPerRun: 0,
  maxCandidatesPerRun: 0,
  minIntervalMs: 0,
} as const;

function entry(
  partial: Omit<
    ExternalReferenceApprovalConfigEntry,
    'allowedFields' | 'maxRequestsPerRun' | 'maxCandidatesPerRun' | 'minIntervalMs'
  > &
    Partial<
      Pick<
        ExternalReferenceApprovalConfigEntry,
        'maxRequestsPerRun' | 'maxCandidatesPerRun' | 'minIntervalMs' | 'allowedFields'
      >
    >
): ExternalReferenceApprovalConfigEntry {
  const limits =
    partial.approvalStatus === 'approved_for_low_frequency'
      ? LOW_FREQUENCY_LIMITS
      : partial.approvalStatus === 'approved_for_dry_run'
        ? DRY_RUN_LIMITS
        : DRY_RUN_LIMITS;
  return {
    allowedFields: DEFAULT_ALLOWED_FIELDS,
    maxRequestsPerRun: limits.maxRequestsPerRun,
    maxCandidatesPerRun: limits.maxCandidatesPerRun,
    minIntervalMs: limits.minIntervalMs,
    ...partial,
  };
}

/** Phase 41.3 デフォルト承認 config（人間承認なしに low_frequency へ上げない） */
export const EXTERNAL_REFERENCE_APPROVAL_CONFIG: readonly ExternalReferenceApprovalConfigEntry[] = [
  entry({
    configId: 'manual_url',
    discoverySource: 'manual_url',
    discoverySourceSite: null,
    displayName: '手動 URL',
    enabled: true,
    humanApproved: true,
    approvalStatus: 'approved_for_manual_url',
    robotsChecked: true,
    termsChecked: true,
    requiresLogin: false,
    hasCaptchaRisk: false,
    notes: 'UI 手入力のみ。掲載元 URL への自動アクセスなし。',
  }),
  entry({
    configId: 'industry_directory',
    discoverySource: 'industry_directory_reference',
    discoverySourceSite: null,
    displayName: '業界団体・ディレクトリ',
    enabled: true,
    humanApproved: false,
    approvalStatus: 'approved_for_dry_run',
    robotsChecked: false,
    termsChecked: false,
    requiresLogin: false,
    hasCaptchaRisk: false,
    notes: 'dry-run のみ。実巡回はサイト別人間承認後。',
  }),
  entry({
    configId: 'portal_site',
    discoverySource: 'portal_site_reference',
    discoverySourceSite: null,
    displayName: '地域ポータル / 住宅紹介 / 施工事例',
    enabled: true,
    humanApproved: false,
    approvalStatus: 'approved_for_dry_run',
    robotsChecked: false,
    termsChecked: false,
    requiresLogin: false,
    hasCaptchaRisk: false,
    notes: 'dry-run のみ。portal_site_reference + ラベルで区別。',
  }),
  entry({
    configId: 'rakuten',
    discoverySource: 'rakuten_marketplace_reference',
    discoverySourceSite: null,
    displayName: '楽天市場',
    enabled: false,
    humanApproved: false,
    approvalStatus: 'not_requested',
    robotsChecked: false,
    termsChecked: false,
    requiresLogin: false,
    hasCaptchaRisk: true,
    notes: '低優先。大量巡回禁止。承認前は実行不可。',
  }),
  entry({
    configId: 'job_wantedly',
    discoverySource: 'job_site_reference',
    discoverySourceSite: 'wantedly',
    displayName: 'Wantedly',
    enabled: false,
    humanApproved: false,
    approvalStatus: 'not_requested',
    robotsChecked: false,
    termsChecked: false,
    requiresLogin: false,
    hasCaptchaRisk: true,
    notes: '手動 URL 可。自動巡回は人間承認後。',
  }),
  entry({
    configId: 'job_indeed',
    discoverySource: 'job_site_reference',
    discoverySourceSite: 'indeed',
    displayName: 'Indeed',
    enabled: false,
    humanApproved: false,
    approvalStatus: 'blocked',
    robotsChecked: false,
    termsChecked: false,
    requiresLogin: false,
    hasCaptchaRisk: true,
    notes: '自動巡回非推奨。blocked。',
  }),
  entry({
    configId: 'job_kyujinbox',
    discoverySource: 'job_site_reference',
    discoverySourceSite: 'kyujinbox',
    displayName: '求人ボックス',
    enabled: false,
    humanApproved: false,
    approvalStatus: 'not_requested',
    robotsChecked: false,
    termsChecked: false,
    requiresLogin: false,
    hasCaptchaRisk: true,
    notes: '承認前は実行不可。',
  }),
  entry({
    configId: 'job_engage',
    discoverySource: 'job_site_reference',
    discoverySourceSite: 'engage',
    displayName: 'engage',
    enabled: false,
    humanApproved: false,
    approvalStatus: 'not_requested',
    robotsChecked: false,
    termsChecked: false,
    requiresLogin: true,
    hasCaptchaRisk: true,
    notes: '承認前は実行不可。',
  }),
  entry({
    configId: 'job_green',
    discoverySource: 'job_site_reference',
    discoverySourceSite: 'green',
    displayName: 'Green',
    enabled: false,
    humanApproved: false,
    approvalStatus: 'not_requested',
    robotsChecked: false,
    termsChecked: false,
    requiresLogin: false,
    hasCaptchaRisk: true,
    notes: '承認前は実行不可。',
  }),
  entry({
    configId: 'job_doda',
    discoverySource: 'job_site_reference',
    discoverySourceSite: 'doda',
    displayName: 'doda',
    enabled: false,
    humanApproved: false,
    approvalStatus: 'blocked',
    robotsChecked: false,
    termsChecked: false,
    requiresLogin: false,
    hasCaptchaRisk: true,
    notes: '自動巡回非推奨。blocked。',
  }),
  entry({
    configId: 'job_mynavi',
    discoverySource: 'job_site_reference',
    discoverySourceSite: 'mynavi_tenshoku',
    displayName: 'マイナビ転職',
    enabled: false,
    humanApproved: false,
    approvalStatus: 'blocked',
    robotsChecked: false,
    termsChecked: false,
    requiresLogin: false,
    hasCaptchaRisk: true,
    notes: '自動巡回非推奨。blocked。',
  }),
  entry({
    configId: 'job_rikunabi',
    discoverySource: 'job_site_reference',
    discoverySourceSite: 'rikunabi_next',
    displayName: 'リクナビNEXT',
    enabled: false,
    humanApproved: false,
    approvalStatus: 'blocked',
    robotsChecked: false,
    termsChecked: false,
    requiresLogin: false,
    hasCaptchaRisk: true,
    notes: '自動巡回非推奨。blocked。',
  }),
  entry({
    configId: 'job_other',
    discoverySource: 'job_site_reference',
    discoverySourceSite: 'other',
    displayName: '求人サイト（その他）',
    enabled: false,
    humanApproved: false,
    approvalStatus: 'not_requested',
    robotsChecked: false,
    termsChecked: false,
    requiresLogin: false,
    hasCaptchaRisk: true,
    notes: 'サイト指定なし求人参照。承認前は実行不可。',
  }),
];

function siteKey(site: Daily30DiscoverySourceSite | null | undefined): string {
  return site ?? '*';
}

function buildConfigIndex(): Map<string, ExternalReferenceApprovalConfigEntry> {
  const index = new Map<string, ExternalReferenceApprovalConfigEntry>();
  for (const config of EXTERNAL_REFERENCE_APPROVAL_CONFIG) {
    index.set(`${config.discoverySource}:${siteKey(config.discoverySourceSite)}`, config);
  }
  return index;
}

const CONFIG_INDEX = buildConfigIndex();

export function listExternalReferenceApprovalConfigs(): readonly ExternalReferenceApprovalConfigEntry[] {
  return EXTERNAL_REFERENCE_APPROVAL_CONFIG;
}

export function lookupExternalReferenceApprovalConfig(
  key: ExternalReferenceApprovalLookupKey
): ExternalReferenceApprovalConfigEntry | null {
  if (!key.discoverySource) return null;
  const specific = CONFIG_INDEX.get(
    `${key.discoverySource}:${siteKey(key.discoverySourceSite ?? null)}`
  );
  if (specific) return specific;
  if (key.discoverySourceSite && key.discoverySourceSite !== 'other') {
    const fallback = CONFIG_INDEX.get(`${key.discoverySource}:*`);
    if (fallback) return fallback;
  }
  const generic = CONFIG_INDEX.get(`${key.discoverySource}:null`);
  if (generic) return generic;
  return CONFIG_INDEX.get(`${key.discoverySource}:*`) ?? null;
}
