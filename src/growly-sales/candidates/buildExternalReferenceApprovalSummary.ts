import {
  listExternalReferenceApprovalConfigs,
  resolveAllDiscoveryAdapterExecutionPlans,
  runDiscoveryReferenceWithPlan,
  type DiscoveryAdapterExecutionPlan,
} from '../adapters/discovery/index.js';

export interface ExternalReferenceApprovalSummaryItem {
  configId: string;
  displayName: string;
  discoverySource: string;
  discoverySourceSite: string | null;
  enabled: boolean;
  humanApproved: boolean;
  approvalStatus: string;
  mode: string;
  canRun: boolean;
  canRunDryRun: boolean;
  reason: string;
  maxRequestsPerRun: number;
  maxCandidatesPerRun: number;
  minIntervalMs: number;
  robotsChecked: boolean;
  termsChecked: boolean;
  requiresLogin: boolean;
  hasCaptchaRisk: boolean;
  notes: string;
}

export interface ExternalReferenceApprovalSummaryPayload {
  ok: true;
  items: ExternalReferenceApprovalSummaryItem[];
  dryRunPlans: DiscoveryAdapterExecutionPlan[];
  generatedAt: string;
  note: string;
}

function toSummaryItem(
  config: ReturnType<typeof listExternalReferenceApprovalConfigs>[number],
  dryRunPlan: DiscoveryAdapterExecutionPlan,
  livePlan: DiscoveryAdapterExecutionPlan
): ExternalReferenceApprovalSummaryItem {
  return {
    configId: config.configId,
    displayName: config.displayName,
    discoverySource: config.discoverySource,
    discoverySourceSite: config.discoverySourceSite,
    enabled: config.enabled,
    humanApproved: config.humanApproved,
    approvalStatus: config.approvalStatus,
    mode: livePlan.mode,
    canRun: livePlan.canRun,
    canRunDryRun: dryRunPlan.canRun,
    reason: livePlan.reason,
    maxRequestsPerRun: config.maxRequestsPerRun,
    maxCandidatesPerRun: config.maxCandidatesPerRun,
    minIntervalMs: config.minIntervalMs,
    robotsChecked: config.robotsChecked,
    termsChecked: config.termsChecked,
    requiresLogin: config.requiresLogin,
    hasCaptchaRisk: config.hasCaptchaRisk,
    notes: config.notes,
  };
}

export async function buildExternalReferenceApprovalSummary(): Promise<ExternalReferenceApprovalSummaryPayload> {
  const configs = listExternalReferenceApprovalConfigs();
  const dryRunPlans = resolveAllDiscoveryAdapterExecutionPlans({ dryRun: true });
  const livePlans = resolveAllDiscoveryAdapterExecutionPlans({ dryRun: false });

  const items = configs.map((config, index) =>
    toSummaryItem(config, dryRunPlans[index], livePlans[index])
  );

  return {
    ok: true,
    items,
    dryRunPlans,
    generatedAt: new Date().toISOString(),
    note: 'Phase 41.3 承認 config の参照のみ。外部サイトへの実アクセスは行いません。Daily 30 接続は Phase 41.4。',
  };
}

/** dry-run 実行サンプル（ネットワークなし）— industry / portal のみ */
export async function previewDryRunDiscoveryPlans(): Promise<
  Awaited<ReturnType<typeof runDiscoveryReferenceWithPlan>>[]
> {
  const targets = [
    { discoverySource: 'industry_directory_reference' as const, discoverySourceSite: null },
    { discoverySource: 'portal_site_reference' as const, discoverySourceSite: null },
  ];
  return Promise.all(
    targets.map((t) =>
      runDiscoveryReferenceWithPlan(
        {
          discoverySource: t.discoverySource,
          discoverySourceSite: t.discoverySourceSite,
          area: '宮城県',
          prefecture: '宮城県',
          industryCategory: 'housing',
          batchId: 'phase413-preview',
        },
        { dryRun: true }
      )
    )
  );
}
