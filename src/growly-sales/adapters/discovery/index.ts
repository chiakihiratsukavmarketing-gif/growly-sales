import type { Daily30DiscoverySource } from '../../candidates/daily30CollectionProfile.js';
import { createReferenceOnlyDiscoveryAdapter } from './stubReferenceAdapter.js';
import {
  REFERENCE_ONLY_DISCOVERY_SOURCES,
  type DiscoveryReferenceAdapter,
  type DiscoveryReferenceInput,
  type DiscoveryReferenceResult,
  type ReferenceOnlyDiscoverySource,
} from './types.js';
import { isReferenceOnlyDiscoverySource } from './discoverySourceUtils.js';
import { runDiscoveryReferenceWithPlan } from './runDiscoveryReferenceWithPlan.js';

export type {
  DiscoveryReferenceAdapter,
  DiscoveryReferenceInput,
  DiscoveryReferenceResult,
  ReferenceOnlyDiscoverySource,
  DiscoveryReferenceExecutionSummary,
  DiscoveryReferenceCandidateStub,
};
export {
  REFERENCE_ONLY_DISCOVERY_SOURCES,
  createReferenceOnlyDiscoveryAdapter,
};
export {
  KNOWN_EXTERNAL_REFERENCE_HOSTS,
  KNOWN_JOB_SITE_HOSTS,
  KNOWN_RAKUTEN_HOSTS,
  hostsForDiscoverySourceSite,
  hostsMatchUrl,
  isKnownExternalReferenceHost,
  isKnownJobSiteHost,
  isKnownRakutenHost,
  isUrlOnKnownExternalReferenceHost,
  normalizeHostFromUrl,
} from './externalReferenceHosts.js';
export {
  EXTERNAL_REFERENCE_ALLOWED_DISCOVERY_FIELDS,
  EXTERNAL_REFERENCE_APPROVAL_CONFIG,
  listExternalReferenceApprovalConfigs,
  lookupExternalReferenceApprovalConfig,
  type DiscoveryAdapterExecutionMode,
  type ExternalReferenceApprovalConfigEntry,
  type ExternalReferenceApprovalStatus,
} from './externalReferenceApprovalConfig.js';
export {
  resolveDiscoveryAdapterExecutionPlan,
  resolveAllDiscoveryAdapterExecutionPlans,
  type DiscoveryAdapterExecutionPlan,
  type DiscoveryAdapterExecutionPlanInput,
} from './resolveDiscoveryAdapterExecutionPlan.js';
export {
  runDiscoveryReferenceWithPlan,
  type RunDiscoveryReferenceOptions,
} from './runDiscoveryReferenceWithPlan.js';
export { isReferenceOnlyDiscoverySource } from './discoverySourceUtils.js';

const ADAPTER_REGISTRY: Record<ReferenceOnlyDiscoverySource, DiscoveryReferenceAdapter> = {
  job_site_reference: createReferenceOnlyDiscoveryAdapter('job_site_reference'),
  rakuten_marketplace_reference: createReferenceOnlyDiscoveryAdapter('rakuten_marketplace_reference'),
  portal_site_reference: createReferenceOnlyDiscoveryAdapter('portal_site_reference'),
  industry_directory_reference: createReferenceOnlyDiscoveryAdapter('industry_directory_reference'),
  manual_url: createReferenceOnlyDiscoveryAdapter('manual_url'),
};

/** 参考ルート adapter を取得（google_places 等は null） */
export function getDiscoveryReferenceAdapter(
  source: Daily30DiscoverySource | null | undefined
): DiscoveryReferenceAdapter | null {
  if (!isReferenceOnlyDiscoverySource(source)) return null;
  return ADAPTER_REGISTRY[source];
}

/** Phase 41.3: 実 crawl は常に false（low_frequency 承認後も未実装） */
export function isDiscoveryReferenceImplemented(
  _source: Daily30DiscoverySource | null | undefined
): boolean {
  return false;
}

/** 参考ルート stub を実行（ネットワークなし・空 candidates）— 後方互換 */
export async function runDiscoveryReferenceStub(
  input: DiscoveryReferenceInput
): Promise<DiscoveryReferenceResult> {
  return runDiscoveryReferenceWithPlan(input, { dryRun: true });
}
