import type { DiscoveryReferenceInput, DiscoveryReferenceResult } from './types.js';
import { createReferenceOnlyDiscoveryAdapter } from './stubReferenceAdapter.js';
import { isReferenceOnlyDiscoverySource } from './discoverySourceUtils.js';
import {
  resolveDiscoveryAdapterExecutionPlan,
  type DiscoveryAdapterExecutionPlan,
  type DiscoveryAdapterExecutionPlanInput,
} from './resolveDiscoveryAdapterExecutionPlan.js';

export interface RunDiscoveryReferenceOptions {
  dryRun?: boolean;
}

function planToExecutionSummary(
  plan: DiscoveryAdapterExecutionPlan
): NonNullable<DiscoveryReferenceResult['executionPlan']> {
  return {
    mode: plan.mode,
    canRun: plan.canRun,
    reason: plan.reason,
    warnings: plan.warnings,
    dryRun: plan.dryRun,
    networkAccessPerformed: false,
    maxRequestsPerRun: plan.maxRequestsPerRun,
    maxCandidatesPerRun: plan.maxCandidatesPerRun,
    humanApprovalRequired: plan.humanApprovalRequired,
  };
}

function buildBlockedResult(
  input: DiscoveryReferenceInput,
  plan: DiscoveryAdapterExecutionPlan
): DiscoveryReferenceResult {
  return {
    referenceOnly: true,
    discoverySource: input.discoverySource,
    candidates: [],
    note: `外部参照 adapter は実行不可（${plan.reason}）。${plan.displayName} — ネットワークアクセスなし。`,
    implementationPending: true,
    executionPlan: planToExecutionSummary(plan),
  };
}

function buildDryRunResult(
  input: DiscoveryReferenceInput,
  plan: DiscoveryAdapterExecutionPlan
): DiscoveryReferenceResult {
  const area = input.prefecture?.trim() || input.area?.trim() || '未指定';
  const industry = input.industryCategory ?? 'housing';
  return {
    referenceOnly: true,
    discoverySource: input.discoverySource,
    candidates: [],
    note: [
      `dry-run 計画のみ（${plan.displayName}）。`,
      `エリア: ${area} / 業種: ${industry}。`,
      `上限: リクエスト ${plan.maxRequestsPerRun} / 候補 ${plan.maxCandidatesPerRun} / 間隔 ${plan.minIntervalMs}ms。`,
      '実ネットワークアクセスは行いません。',
      '取得フィールド: 会社名・公式サイト候補・掲載元URLのみ（メールは外部掲載サイトから取得しない）。',
    ].join(' '),
    implementationPending: true,
    executionPlan: planToExecutionSummary(plan),
  };
}

/**
 * 承認 config + 実行計画に従って reference adapter を実行（Phase 41.3）。
 * 実ネットワークアクセスは行わない。Daily 30 接続は Phase 41.4。
 */
export async function runDiscoveryReferenceWithPlan(
  input: DiscoveryReferenceInput,
  options: RunDiscoveryReferenceOptions = {}
): Promise<DiscoveryReferenceResult> {
  const planInput: DiscoveryAdapterExecutionPlanInput = {
    discoverySource: input.discoverySource,
    discoverySourceSite: input.discoverySourceSite,
    dryRun: options.dryRun,
  };
  const plan = resolveDiscoveryAdapterExecutionPlan(planInput);

  if (plan.mode === 'blocked' || plan.mode === 'manual_only' || !plan.canRun) {
    return buildBlockedResult(input, plan);
  }

  if (plan.dryRun || plan.mode === 'dry_run_only') {
    return buildDryRunResult(input, plan);
  }

  if (plan.mode === 'low_frequency_allowed') {
    if (isReferenceOnlyDiscoverySource(input.discoverySource)) {
      const adapter = createReferenceOnlyDiscoveryAdapter(input.discoverySource);
      const stub = await adapter.discover(input, plan);
      return {
        ...stub,
        note: `${stub.note} low_frequency 承認済みだが Phase 41.3 では実装 pending（ネットワークなし）。`,
        implementationPending: true,
        executionPlan: planToExecutionSummary(plan),
      };
    }
    return buildDryRunResult(input, plan);
  }

  return buildBlockedResult(input, plan);
}

export type {
  DiscoveryAdapterExecutionPlan,
  DiscoveryAdapterExecutionPlanInput,
} from './resolveDiscoveryAdapterExecutionPlan.js';
