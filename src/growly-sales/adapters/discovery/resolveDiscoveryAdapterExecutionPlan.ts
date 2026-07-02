import type {
  Daily30DiscoverySource,
  Daily30DiscoverySourceSite,
} from '../../candidates/daily30CollectionProfile.js';
import {
  lookupExternalReferenceApprovalConfig,
  listExternalReferenceApprovalConfigs,
  type DiscoveryAdapterExecutionMode,
  type ExternalReferenceAllowedDiscoveryField,
  type ExternalReferenceApprovalConfigEntry,
} from './externalReferenceApprovalConfig.js';
import { REFERENCE_ONLY_DISCOVERY_SOURCES } from './types.js';

function isReferenceOnlyDiscoverySource(
  source: Daily30DiscoverySource | null | undefined
): boolean {
  return Boolean(source && (REFERENCE_ONLY_DISCOVERY_SOURCES as readonly string[]).includes(source));
}

export interface DiscoveryAdapterExecutionPlanInput {
  discoverySource: Daily30DiscoverySource;
  discoverySourceSite?: Daily30DiscoverySourceSite | null;
  /** true のとき実ネットワークアクセスは行わず計画のみ返す */
  dryRun?: boolean;
}

export interface DiscoveryAdapterExecutionPlan {
  discoverySource: Daily30DiscoverySource;
  discoverySourceSite: Daily30DiscoverySourceSite | null;
  displayName: string;
  configId: string;
  canRun: boolean;
  mode: DiscoveryAdapterExecutionMode;
  reason: string;
  warnings: string[];
  maxRequestsPerRun: number;
  maxCandidatesPerRun: number;
  minIntervalMs: number;
  allowedFields: readonly ExternalReferenceAllowedDiscoveryField[];
  humanApprovalRequired: boolean;
  dryRun: boolean;
  networkAccessAllowed: boolean;
  approvalStatus: ExternalReferenceApprovalConfigEntry['approvalStatus'];
  robotsChecked: boolean;
  termsChecked: boolean;
}

function resolveConfig(
  input: DiscoveryAdapterExecutionPlanInput
): ExternalReferenceApprovalConfigEntry | null {
  const site = input.discoverySourceSite ?? null;
  let config = lookupExternalReferenceApprovalConfig({
    discoverySource: input.discoverySource,
    discoverySourceSite: site,
  });
  if (
    !config &&
    input.discoverySource === 'job_site_reference' &&
    !site
  ) {
    config = lookupExternalReferenceApprovalConfig({
      discoverySource: 'job_site_reference',
      discoverySourceSite: 'other',
    });
  }
  return config;
}

function blockedPlan(
  input: DiscoveryAdapterExecutionPlanInput,
  config: ExternalReferenceApprovalConfigEntry | null,
  reason: string,
  warnings: string[],
  mode: DiscoveryAdapterExecutionMode = 'blocked'
): DiscoveryAdapterExecutionPlan {
  return {
    discoverySource: input.discoverySource,
    discoverySourceSite: input.discoverySourceSite ?? null,
    displayName: config?.displayName ?? input.discoverySource,
    configId: config?.configId ?? 'unknown',
    canRun: false,
    mode,
    reason,
    warnings,
    maxRequestsPerRun: config?.maxRequestsPerRun ?? 0,
    maxCandidatesPerRun: config?.maxCandidatesPerRun ?? 0,
    minIntervalMs: config?.minIntervalMs ?? 0,
    allowedFields: config?.allowedFields ?? [],
    humanApprovalRequired: true,
    dryRun: input.dryRun === true,
    networkAccessAllowed: false,
    approvalStatus: config?.approvalStatus ?? 'blocked',
    robotsChecked: config?.robotsChecked ?? false,
    termsChecked: config?.termsChecked ?? false,
  };
}

/**
 * 外部参照 adapter が実行可能かを判定（Phase 41.3）。
 * 実ネットワークアクセスの可否は canRun + networkAccessAllowed + dryRun で決まる。
 * Daily 30 本体接続は Phase 41.4。
 */
export function resolveDiscoveryAdapterExecutionPlan(
  input: DiscoveryAdapterExecutionPlanInput
): DiscoveryAdapterExecutionPlan {
  const dryRun = input.dryRun === true;
  const warnings: string[] = [];

  if (!isReferenceOnlyDiscoverySource(input.discoverySource)) {
    return blockedPlan(input, null, 'not_reference_only_discovery_source', [
      'external_reference_plan_not_applicable',
    ]);
  }

  const config = resolveConfig(input);
  if (!config) {
    return blockedPlan(input, null, 'approval_config_not_found', ['approval_config_missing']);
  }

  if (!config.enabled) {
    return blockedPlan(input, config, 'source_disabled', ['external_reference_source_disabled']);
  }

  warnings.push('email_from_external_listing_forbidden');
  warnings.push('official_site_email_only');

  switch (config.approvalStatus) {
    case 'blocked':
      return blockedPlan(input, config, 'blocked_by_policy', [
        ...warnings,
        'external_reference_blocked_by_policy',
      ]);

    case 'not_requested':
      return blockedPlan(
        input,
        config,
        'human_approval_required',
        [...warnings, 'external_site_access_not_approved'],
        'blocked'
      );

    case 'approved_for_manual_url':
      return {
        discoverySource: input.discoverySource,
        discoverySourceSite: input.discoverySourceSite ?? null,
        displayName: config.displayName,
        configId: config.configId,
        canRun: false,
        mode: 'manual_only',
        reason: 'manual_url_only',
        warnings: [...warnings, 'external_reference_manual_url_only'],
        maxRequestsPerRun: 0,
        maxCandidatesPerRun: 0,
        minIntervalMs: 0,
        allowedFields: config.allowedFields,
        humanApprovalRequired: false,
        dryRun,
        networkAccessAllowed: false,
        approvalStatus: config.approvalStatus,
        robotsChecked: config.robotsChecked,
        termsChecked: config.termsChecked,
      };

    case 'approved_for_dry_run':
      if (dryRun) {
        return {
          discoverySource: input.discoverySource,
          discoverySourceSite: input.discoverySourceSite ?? null,
          displayName: config.displayName,
          configId: config.configId,
          canRun: true,
          mode: 'dry_run_only',
          reason: 'dry_run_plan_only',
          warnings: [...warnings, 'external_reference_dry_run_no_network'],
          maxRequestsPerRun: config.maxRequestsPerRun,
          maxCandidatesPerRun: config.maxCandidatesPerRun,
          minIntervalMs: config.minIntervalMs,
          allowedFields: config.allowedFields,
          humanApprovalRequired: !config.humanApproved,
          dryRun: true,
          networkAccessAllowed: false,
          approvalStatus: config.approvalStatus,
          robotsChecked: config.robotsChecked,
          termsChecked: config.termsChecked,
        };
      }
      return blockedPlan(
        input,
        config,
        'live_access_not_approved',
        [...warnings, 'external_reference_live_access_requires_low_frequency_approval'],
        'dry_run_only'
      );

    case 'approved_for_low_frequency':
      if (!config.humanApproved) {
        return blockedPlan(
          input,
          config,
          'human_approval_required',
          [...warnings, 'external_site_low_frequency_not_human_approved'],
          'blocked'
        );
      }
      if (config.requiresLogin || config.hasCaptchaRisk) {
        warnings.push('external_reference_login_or_captcha_risk');
      }
      if (!config.robotsChecked || !config.termsChecked) {
        return blockedPlan(
          input,
          config,
          'robots_or_terms_not_checked',
          [...warnings, 'external_reference_compliance_check_incomplete'],
          'blocked'
        );
      }
      if (dryRun) {
        return {
          discoverySource: input.discoverySource,
          discoverySourceSite: input.discoverySourceSite ?? null,
          displayName: config.displayName,
          configId: config.configId,
          canRun: true,
          mode: 'dry_run_only',
          reason: 'dry_run_plan_only',
          warnings: [...warnings, 'external_reference_dry_run_no_network'],
          maxRequestsPerRun: config.maxRequestsPerRun,
          maxCandidatesPerRun: config.maxCandidatesPerRun,
          minIntervalMs: config.minIntervalMs,
          allowedFields: config.allowedFields,
          humanApprovalRequired: false,
          dryRun: true,
          networkAccessAllowed: false,
          approvalStatus: config.approvalStatus,
          robotsChecked: config.robotsChecked,
          termsChecked: config.termsChecked,
        };
      }
      return {
        discoverySource: input.discoverySource,
        discoverySourceSite: input.discoverySourceSite ?? null,
        displayName: config.displayName,
        configId: config.configId,
        canRun: true,
        mode: 'low_frequency_allowed',
        reason: 'low_frequency_approved_implementation_pending',
        warnings: [
          ...warnings,
          'external_reference_low_frequency_stub_only',
          'external_reference_implementation_pending',
        ],
        maxRequestsPerRun: config.maxRequestsPerRun,
        maxCandidatesPerRun: config.maxCandidatesPerRun,
        minIntervalMs: config.minIntervalMs,
        allowedFields: config.allowedFields,
        humanApprovalRequired: false,
        dryRun: false,
        networkAccessAllowed: false,
        approvalStatus: config.approvalStatus,
        robotsChecked: config.robotsChecked,
        termsChecked: config.termsChecked,
      };

    default:
      return blockedPlan(input, config, 'unknown_approval_status', warnings);
  }
}

export function resolveAllDiscoveryAdapterExecutionPlans(options?: {
  dryRun?: boolean;
}): DiscoveryAdapterExecutionPlan[] {
  return listExternalReferenceApprovalConfigs().map((config) =>
    resolveDiscoveryAdapterExecutionPlan({
      discoverySource: config.discoverySource,
      discoverySourceSite: config.discoverySourceSite,
      dryRun: options?.dryRun,
    })
  );
}
