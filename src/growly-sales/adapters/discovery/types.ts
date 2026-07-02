import type {
  Daily30DiscoverySource,
  Daily30DiscoverySourceSite,
  Daily30IndustryCategory,
} from '../../candidates/daily30CollectionProfile.js';
import type { DiscoveryAdapterExecutionMode } from './externalReferenceApprovalConfig.js';

/** 外部掲載サイト参考ルートの入力（Phase 40.6 — 実巡回なし） */
export interface DiscoveryReferenceInput {
  discoverySource: Daily30DiscoverySource;
  discoverySourceSite?: Daily30DiscoverySourceSite | null;
  discoverySourceUrl?: string | null;
  discoverySourceLabel?: string | null;
  area?: string;
  prefecture?: string;
  industryCategory?: Daily30IndustryCategory;
  /** 収集 batchId（監査用） */
  batchId?: string;
}

/** 発見候補1件（将来の実装用。Phase 40.6 スタブは空配列） */
export interface DiscoveryReferenceCandidateStub {
  companyName: string;
  /** 公式サイト候補 URL（メール取得は別途公式サイトのみ） */
  officialSiteUrl: string | null;
  discoverySourceUrl: string;
  discoverySourceLabel: string | null;
  area: string;
  notes?: string;
}

/** 参考ルート adapter の戻り値 — 常に referenceOnly */
export interface DiscoveryReferenceResult {
  referenceOnly: true;
  discoverySource: Daily30DiscoverySource;
  candidates: DiscoveryReferenceCandidateStub[];
  /** 人間向けメモ（ログ/UI 用・secret 不可） */
  note: string;
  /** 実装未完了の場合 true（Phase 41.3 でも low_frequency 承認後は true のまま） */
  implementationPending: boolean;
  /** Phase 41.3: 実行計画メタデータ */
  executionPlan?: DiscoveryReferenceExecutionSummary;
}

/** 実行結果に付与する計画サマリー（ネットワーク有無を明示） */
export interface DiscoveryReferenceExecutionSummary {
  mode: DiscoveryAdapterExecutionMode;
  canRun: boolean;
  reason: string;
  warnings: string[];
  dryRun: boolean;
  networkAccessPerformed: false;
  maxRequestsPerRun: number;
  maxCandidatesPerRun: number;
  humanApprovalRequired: boolean;
}

/**
 * 外部掲載サイト参考 discovery adapter。
 * Phase 40.6: interface + スタブのみ。ネットワークアクセスなし。
 */
export interface DiscoveryReferenceAdapter {
  discoverySource: Daily30DiscoverySource;
  referenceOnly: true;
  discover(
    input: DiscoveryReferenceInput,
    plan?: import('./resolveDiscoveryAdapterExecutionPlan.js').DiscoveryAdapterExecutionPlan
  ): Promise<DiscoveryReferenceResult>;
}

export const REFERENCE_ONLY_DISCOVERY_SOURCES = [
  'job_site_reference',
  'rakuten_marketplace_reference',
  'portal_site_reference',
  'industry_directory_reference',
  'manual_url',
] as const satisfies readonly Daily30DiscoverySource[];

export type ReferenceOnlyDiscoverySource = (typeof REFERENCE_ONLY_DISCOVERY_SOURCES)[number];
