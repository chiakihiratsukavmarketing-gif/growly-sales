import type { ExternalLeadCandidate } from '../adapters/externalLeadCandidateTypes.js';
import type {
  Daily30CollectionProfileSnapshot,
  Daily30DiscoverySource,
  Daily30DiscoverySourceSite,
} from './daily30CollectionProfile.js';
import {
  EXTERNAL_REFERENCE_SUPPLEMENT_WARNING_LABELS,
  type ExternalReferenceSupplementMode,
} from './externalReferenceSupplementConstants.js';
export {
  EXTERNAL_REFERENCE_SUPPLEMENT_WARNING_LABELS,
  type ExternalReferenceSupplementMode,
} from './externalReferenceSupplementConstants.js';
import { isReferenceOnlyDiscoverySource } from '../adapters/discovery/discoverySourceUtils.js';
import {
  resolveDiscoveryAdapterExecutionPlan,
  runDiscoveryReferenceWithPlan,
  type DiscoveryAdapterExecutionPlan,
} from '../adapters/discovery/index.js';
import { applySourceComplianceFields } from './sourceCompliance.js';
import { enrichExternalLeadCandidate } from './enrichCandidateFields.js';
import { MANUAL_EXTERNAL_REFERENCE_PROFILE_ID } from './manualExternalReferenceConstants.js';
import { DAILY_30_TARGET_EMAIL_FOUND } from './daily30CandidateStatus.js';
import { createExternalCandidateId } from '../adapters/externalLeadCandidateTypes.js';

export interface Daily30ExternalReferenceSupplementResult {
  externalReferenceSupplementAttempted: boolean;
  externalReferenceSupplementMode: ExternalReferenceSupplementMode;
  externalReferenceDiscoverySource?: Daily30DiscoverySource;
  externalReferenceDiscoverySourceSite?: Daily30DiscoverySourceSite | null;
  externalReferencePlanReason: string;
  externalReferenceWarnings: string[];
  externalReferenceNetworkAccessPerformed: false;
  externalReferenceCandidatesFound: number;
  externalReferenceCandidatesAccepted: number;
  externalReferenceHumanApprovalRequired: boolean;
  externalReferenceManualCandidatesAvailable: number;
  externalReferenceManualCandidatesEligible: number;
  plannedExternalReferenceNote?: string | null;
  displayMessage: string;
  acceptedCandidates: ExternalLeadCandidate[];
}

export interface Daily30ExternalReferenceSupplementInput {
  profile: Daily30CollectionProfileSnapshot;
  batchId: string;
  emailFound: number;
  targetEmailFound?: number;
  reachedTarget: boolean;
  existingCandidates: ExternalLeadCandidate[];
  dryRun?: boolean;
  /** true のとき low_frequency 実行もスキップ（プレビューのみ） */
  previewOnly?: boolean;
  prefecture?: string | null;
}

function mapPlanToSupplementMode(
  plan: DiscoveryAdapterExecutionPlan,
  discoverySource: Daily30DiscoverySource
): ExternalReferenceSupplementMode {
  if (plan.mode === 'manual_only') return 'manual_only';
  if (plan.mode === 'blocked') {
    if (plan.reason === 'human_approval_required') return 'skipped_not_approved';
    return 'blocked';
  }
  if (plan.mode === 'dry_run_only') return 'dry_run_only';
  if (plan.mode === 'low_frequency_allowed') return 'low_frequency_allowed';
  return 'not_applicable';
}

export function listEligibleManualExternalReferenceCandidates(
  candidates: ExternalLeadCandidate[],
  options?: { includeImported?: boolean }
): {
  eligible: ExternalLeadCandidate[];
  available: number;
  blocked: number;
} {
  const manual = candidates.filter(
    (c) => c.collectionProfileId === MANUAL_EXTERNAL_REFERENCE_PROFILE_ID
  );
  let blocked = 0;
  const eligible = manual.filter((c) => {
    if (c.sourceComplianceStatus === 'blocked_by_policy') {
      blocked++;
      return false;
    }
    if (c.pipelineStatus === 'excluded' || c.pipelineStatus === 'duplicate') {
      return false;
    }
    if (!options?.includeImported) {
      if (c.importStatus === 'imported' || c.importStatus === 'excluded') {
        return false;
      }
    }
    return true;
  });
  return { eligible, available: manual.length, blocked };
}

function buildDisplayMessage(input: {
  mode: ExternalReferenceSupplementMode;
  displayName: string;
  planReason: string;
  manualEligible: number;
  discoverySource: Daily30DiscoverySource;
}): string {
  switch (input.mode) {
    case 'not_applicable':
      return '未実行 — 現在の収集元は Google Places / 公式サイト検索です';
    case 'manual_only':
      if (input.manualEligible > 0) {
        return `手動URL候補あり — ${input.manualEligible}件。Lead化には公式サイトメール確認が必要です`;
      }
      return '手動URLのみ — 自動巡回は行いません';
    case 'dry_run_only':
      return `dry-runのみ — ${input.displayName}は人間承認前のため実アクセスしません`;
    case 'skipped_not_approved':
      return `スキップ — ${input.displayName}は人間承認待ちです`;
    case 'blocked':
      return `ブロック — ${input.displayName}は実行不可です`;
    case 'low_frequency_allowed':
      return `低頻度承認済み — ${input.displayName}（Phase 41.4: 実装 pending・ネットワークなし）`;
    default:
      return input.planReason;
  }
}

function stubToExternalCandidate(
  stub: {
    companyName: string;
    officialSiteUrl: string | null;
    discoverySourceUrl: string;
    discoverySourceLabel: string | null;
    area: string;
    notes?: string;
  },
  profile: Daily30CollectionProfileSnapshot,
  batchId: string,
  runId: string
): ExternalLeadCandidate {
  const now = new Date().toISOString();
  const candidate: ExternalLeadCandidate = {
    externalCandidateId: createExternalCandidateId(),
    sourceType: 'manual',
    companyName: stub.companyName,
    area: stub.area || '未設定',
    industry: profile.industryCategory === 'housing' ? '工務店' : 'その他',
    websiteUrl: stub.officialSiteUrl,
    officialSiteUrl: stub.officialSiteUrl,
    phoneNumber: null,
    address: null,
    googlePlaceId: null,
    sourceUrl: stub.discoverySourceUrl,
    sourceQuery: `external-reference-supplement:${profile.discoverySource}`,
    category: '工務店',
    contactFormUrl: null,
    emailCandidates: [],
    confidenceScore: stub.officialSiteUrl ? 0.55 : 0.4,
    importStatus: 'preview',
    riskLevel: stub.officialSiteUrl ? 'medium' : 'high',
    duplicateReason: '',
    duplicateKey: '',
    pipelineStatus: stub.officialSiteUrl ? 'collected' : 'email_not_found',
    prefecture: stub.area,
    regionGroup: '',
    collectionPriority: 0,
    collectionAreaSource: stub.area,
    collectionBatchId: batchId,
    emailCandidateSourceUrls: [],
    emailVerifiedAt: null,
    generatedEmailSubject: null,
    generatedEmailBody: null,
    generatedCustomHook: null,
    generatedCustomHookReason: null,
    targetEmail: null,
    emailCandidateSourceUrl: null,
    failureReason: null,
    copyGeneratedAt: null,
    qualityCheckedAt: null,
    humanReviewStatus: 'pending',
    gmailDraftStatus: null,
    sendStatus: null,
    notes: stub.notes ?? '外部参照補完（discovery のみ・メールは公式サイト確認後）',
    collectedAt: now,
    createdAt: now,
    updatedAt: now,
    collectionProfileId: profile.collectionProfileId,
    collectionProfileName: profile.collectionProfileName,
    collectionMode: profile.collectionMode,
    industryCategory: profile.industryCategory,
    areaStrategy: profile.areaStrategy,
    areaQueuePosition: profile.areaQueuePosition,
    discoverySource: profile.discoverySource,
    discoverySourceSite: profile.discoverySourceSite,
    discoverySourceLabel: stub.discoverySourceLabel ?? profile.discoverySourceLabel,
    discoverySourceUrl: stub.discoverySourceUrl,
    sourceComplianceNote: null,
    collectionRunId: runId,
  };
  return applySourceComplianceFields(enrichExternalLeadCandidate(candidate));
}

export async function runDaily30ExternalReferenceSupplement(
  input: Daily30ExternalReferenceSupplementInput
): Promise<Daily30ExternalReferenceSupplementResult> {
  const target = input.targetEmailFound ?? DAILY_30_TARGET_EMAIL_FOUND;
  const warnings: string[] = [];
  const manualStats = listEligibleManualExternalReferenceCandidates(input.existingCandidates);
  const discoverySource = input.profile.discoverySource;
  const discoverySourceSite = input.profile.discoverySourceSite ?? null;

  warnings.push('external_reference_email_from_official_site_only');

  if (!isReferenceOnlyDiscoverySource(discoverySource)) {
    warnings.push('external_reference_not_applicable');
    if (manualStats.eligible.length > 0) {
      warnings.push('external_reference_manual_candidates_available');
    }
    return {
      externalReferenceSupplementAttempted: false,
      externalReferenceSupplementMode: 'not_applicable',
      externalReferenceDiscoverySource: discoverySource,
      externalReferenceDiscoverySourceSite: discoverySourceSite,
      externalReferencePlanReason: 'not_reference_discovery_source',
      externalReferenceWarnings: warnings,
      externalReferenceNetworkAccessPerformed: false,
      externalReferenceCandidatesFound: 0,
      externalReferenceCandidatesAccepted: 0,
      externalReferenceHumanApprovalRequired: false,
      externalReferenceManualCandidatesAvailable: manualStats.available,
      externalReferenceManualCandidatesEligible: manualStats.eligible.length,
      displayMessage: buildDisplayMessage({
        mode: 'not_applicable',
        displayName: discoverySource,
        planReason: 'not_reference_discovery_source',
        manualEligible: manualStats.eligible.length,
        discoverySource,
      }),
      acceptedCandidates: [],
    };
  }

  if (input.reachedTarget) {
    warnings.push('external_reference_target_already_reached');
    if (manualStats.eligible.length > 0) {
      warnings.push('external_reference_manual_candidates_available');
    }
    return {
      externalReferenceSupplementAttempted: false,
      externalReferenceSupplementMode: mapPlanToSupplementMode(
        resolveDiscoveryAdapterExecutionPlan({
          discoverySource,
          discoverySourceSite,
          dryRun: input.dryRun,
        }),
        discoverySource
      ),
      externalReferenceDiscoverySource: discoverySource,
      externalReferenceDiscoverySourceSite: discoverySourceSite,
      externalReferencePlanReason: 'target_email_found_reached',
      externalReferenceWarnings: warnings,
      externalReferenceNetworkAccessPerformed: false,
      externalReferenceCandidatesFound: 0,
      externalReferenceCandidatesAccepted: 0,
      externalReferenceHumanApprovalRequired: false,
      externalReferenceManualCandidatesAvailable: manualStats.available,
      externalReferenceManualCandidatesEligible: manualStats.eligible.length,
      displayMessage:
        manualStats.eligible.length > 0
          ? `目標到達 — 手動URL候補 ${manualStats.eligible.length}件は Lead化承認待ち`
          : '目標到達 — 外部参照補完は不要',
      acceptedCandidates: [],
    };
  }

  const plan = resolveDiscoveryAdapterExecutionPlan({
    discoverySource,
    discoverySourceSite,
    dryRun: input.dryRun ?? input.previewOnly,
  });
  const mode = mapPlanToSupplementMode(plan, discoverySource);
  warnings.push(...plan.warnings);

  if (plan.humanApprovalRequired) {
    warnings.push('external_reference_human_approval_required');
  }
  if (mode === 'dry_run_only') {
    warnings.push('external_reference_dry_run_only');
  }
  if (mode === 'blocked' || mode === 'skipped_not_approved') {
    warnings.push('external_reference_blocked');
  }
  warnings.push('external_reference_network_access_not_performed');

  if (manualStats.eligible.length > 0) {
    warnings.push('external_reference_manual_candidates_available');
  }

  let plannedNote: string | null = null;
  let candidatesFound = 0;
  let acceptedCandidates: ExternalLeadCandidate[] = [];

  const shouldInvokeAdapter =
    !input.previewOnly &&
    plan.canRun &&
    plan.mode === 'low_frequency_allowed' &&
    !input.dryRun;

  if (plan.canRun && (plan.mode === 'dry_run_only' || input.dryRun || input.previewOnly)) {
    const dryResult = await runDiscoveryReferenceWithPlan(
      {
        discoverySource,
        discoverySourceSite,
        area: input.prefecture ?? '宮城県',
        prefecture: input.prefecture ?? '宮城県',
        industryCategory: input.profile.industryCategory,
        batchId: input.batchId,
      },
      { dryRun: true }
    );
    plannedNote = dryResult.note;
    candidatesFound = dryResult.candidates.length;
  } else if (shouldInvokeAdapter) {
    const runResult = await runDiscoveryReferenceWithPlan(
      {
        discoverySource,
        discoverySourceSite,
        area: input.prefecture ?? '宮城県',
        prefecture: input.prefecture ?? '宮城県',
        industryCategory: input.profile.industryCategory,
        batchId: input.batchId,
      },
      { dryRun: false }
    );
    plannedNote = runResult.note;
    candidatesFound = runResult.candidates.length;
    warnings.push('external_reference_implementation_pending');
    const runId = `external-ref-supplement-${input.batchId}-${Date.now()}`;
    acceptedCandidates = runResult.candidates
      .slice(0, plan.maxCandidatesPerRun)
      .map((stub) =>
        stubToExternalCandidate(stub, input.profile, input.batchId, runId)
      );
  } else if (!plan.canRun) {
    warnings.push('external_reference_no_approved_adapter');
  }

  const displayMessage = buildDisplayMessage({
    mode,
    displayName: plan.displayName,
    planReason: plan.reason,
    manualEligible: manualStats.eligible.length,
    discoverySource,
  });

  return {
    externalReferenceSupplementAttempted: true,
    externalReferenceSupplementMode: mode,
    externalReferenceDiscoverySource: discoverySource,
    externalReferenceDiscoverySourceSite: discoverySourceSite,
    externalReferencePlanReason: plan.reason,
    externalReferenceWarnings: [...new Set(warnings)],
    externalReferenceNetworkAccessPerformed: false,
    externalReferenceCandidatesFound: candidatesFound,
    externalReferenceCandidatesAccepted: acceptedCandidates.length,
    externalReferenceHumanApprovalRequired: plan.humanApprovalRequired,
    externalReferenceManualCandidatesAvailable: manualStats.available,
    externalReferenceManualCandidatesEligible: manualStats.eligible.length,
    plannedExternalReferenceNote: plannedNote,
    displayMessage,
    acceptedCandidates,
  };
}

/** UI / dashboard 用プレビュー（常にネットワークなし） */
export async function previewDaily30ExternalReferenceSupplement(
  input: Omit<Daily30ExternalReferenceSupplementInput, 'previewOnly' | 'dryRun'>
): Promise<Daily30ExternalReferenceSupplementResult> {
  return runDaily30ExternalReferenceSupplement({
    ...input,
    previewOnly: true,
    dryRun: true,
  });
}

export function supplementResultToStateFields(
  result: Daily30ExternalReferenceSupplementResult
): Pick<
  import('../storage/daily30CloudRunState.js').Daily30CloudRunStateEntry,
  | 'externalReferenceSupplementAttempted'
  | 'externalReferenceSupplementMode'
  | 'externalReferenceDiscoverySource'
  | 'externalReferenceDiscoverySourceSite'
  | 'externalReferencePlanReason'
  | 'externalReferenceWarnings'
  | 'externalReferenceNetworkAccessPerformed'
  | 'externalReferenceCandidatesFound'
  | 'externalReferenceCandidatesAccepted'
  | 'externalReferenceHumanApprovalRequired'
  | 'externalReferenceManualCandidatesAvailable'
  | 'externalReferenceManualCandidatesEligible'
  | 'plannedExternalReferenceNote'
  | 'externalReferenceDisplayMessage'
> {
  return {
    externalReferenceSupplementAttempted: result.externalReferenceSupplementAttempted,
    externalReferenceSupplementMode: result.externalReferenceSupplementMode,
    externalReferenceDiscoverySource: result.externalReferenceDiscoverySource,
    externalReferenceDiscoverySourceSite: result.externalReferenceDiscoverySourceSite,
    externalReferencePlanReason: result.externalReferencePlanReason,
    externalReferenceWarnings: result.externalReferenceWarnings,
    externalReferenceNetworkAccessPerformed: result.externalReferenceNetworkAccessPerformed,
    externalReferenceCandidatesFound: result.externalReferenceCandidatesFound,
    externalReferenceCandidatesAccepted: result.externalReferenceCandidatesAccepted,
    externalReferenceHumanApprovalRequired: result.externalReferenceHumanApprovalRequired,
    externalReferenceManualCandidatesAvailable: result.externalReferenceManualCandidatesAvailable,
    externalReferenceManualCandidatesEligible: result.externalReferenceManualCandidatesEligible,
    plannedExternalReferenceNote: result.plannedExternalReferenceNote ?? null,
    externalReferenceDisplayMessage: result.displayMessage,
  };
}

export type Daily30ExternalReferenceSupplementFields = ReturnType<
  typeof supplementResultToStateFields
>;
