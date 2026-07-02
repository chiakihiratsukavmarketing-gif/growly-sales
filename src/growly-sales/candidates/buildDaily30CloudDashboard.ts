import type { ExternalLeadCandidate } from '../adapters/externalLeadCandidateTypes.js';
import type { Lead } from '../types/lead.js';
import { buildDaily30Dashboard } from './buildDaily30Dashboard.js';
import { todayBatchIdJst } from './daily30AreaConfig.js';
import { resolveDaily30FetchRunContext } from './fetchDaily30Candidates.js';
import {
  formatScheduleSourceLabel,
  buildRunContextFromCloudStateEntry,
} from './resolveDaily30CollectionSchedule.js';
import { getDaily30CloudErrorDefinition } from './daily30CloudRunErrors.js';
import {
  buildDaily30CloudStatus,
  type Daily30CloudAutomationStatus,
} from './runDaily30CloudAutoFetch.js';
import { loadExternalCandidatesFromJson } from '../storage/externalCandidatesRepository.js';
import {
  getLatestCloudRunEntry,
  type Daily30CloudRunStateEntry,
} from '../storage/daily30CloudRunState.js';
import { describeStorageBackendStatus, getStorageBackend } from '../config/storageBackend.js';
import { diagnoseGcsAuth } from '../config/gcsAuthDiagnostics.js';
import { summarizeDaily30ContactPaths, type Daily30ContactPathSummary } from './summarizeDaily30ContactPaths.js';
import { sanitizeErrorMessageSafe } from './daily30CloudRunErrors.js';
import { filterDaily30VisibleCandidates, countDaily30HumanExcluded, isDaily30HumanExcludedCandidate } from './daily30CandidateVisibility.js';
import { NEXT_SCHEDULED_RUN_LABEL, isCloudRunUrlConfigured, isCloudSchedulerConfigured } from '../config/cloudDeployConfig.js';
import { countDaily30BatchMetrics } from './daily30BatchMetrics.js';
import type { Daily30StoppedReason } from './daily30BatchMetrics.js';
import type { ExternalReferenceSupplementMode } from './externalReferenceSupplementConstants.js';

export class Daily30GcsReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'Daily30GcsReadError';
  }
}

export interface Daily30CloudDashboardPayload {
  ok: boolean;
  storageBackend: 'local' | 'gcs';
  batchId: string;
  status: Daily30CloudAutomationStatus | 'not_run';
  mode: string;
  targetEmailFound: number;
  collected: number;
  totalCollected: number;
  emailFound: number;
  formOnly: number;
  noEmail: number;
  reachedTarget: boolean;
  stoppedReason?: Daily30StoppedReason;
  duplicates: number;
  excluded: number;
  nextArea: string;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  errorCode?: string;
  recoveryHint?: string;
  gcsBucketConfigured: boolean;
  schedulerConfigured: boolean;
  cloudRunUrlConfigured: boolean;
  nextScheduledRun: string;
  /** 論理除外を含む全候補（ダッシュボード集計用） */
  allCandidates: ExternalLeadCandidate[];
  /** 通常一覧用（論理除外済みを除く） */
  candidates: ExternalLeadCandidate[];
  emailFoundCandidates: ExternalLeadCandidate[];
  gcsReadError?: string;
  gcsAuthSummary?: string[];
  contactPathSummary?: Daily30ContactPathSummary;
  humanExcludedCount?: number;
  humanExcludedCandidates?: ExternalLeadCandidate[];
  lastRunCollectionProfileName?: string | null;
  lastRunScheduleSource?: string | null;
  lastRunAreasUsed?: string[];
  lastRunScheduleWarning?: string | null;
  resolvedForToday?: Awaited<ReturnType<typeof resolveDaily30FetchRunContext>>;
  lastRunResolvedContext?: ReturnType<typeof buildRunContextFromCloudStateEntry>;
  /** Phase 41.4: 外部参照補完（直近 Cloud Run エントリ由来） */
  externalReferenceSupplementAttempted?: boolean;
  externalReferenceSupplementMode?: ExternalReferenceSupplementMode | string;
  externalReferenceDiscoverySource?: string;
  externalReferenceDiscoverySourceSite?: string | null;
  externalReferencePlanReason?: string;
  externalReferenceWarnings?: string[];
  externalReferenceNetworkAccessPerformed?: boolean;
  externalReferenceCandidatesFound?: number;
  externalReferenceCandidatesAccepted?: number;
  externalReferenceHumanApprovalRequired?: boolean;
  externalReferenceManualCandidatesAvailable?: number;
  externalReferenceManualCandidatesEligible?: number;
  plannedExternalReferenceNote?: string | null;
  externalReferenceDisplayMessage?: string | null;
}

function externalReferenceFieldsFromEntry(
  entry: Daily30CloudRunStateEntry | null,
  batchId: string
): Pick<
  Daily30CloudDashboardPayload,
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
  if (!entry || entry.batchId !== batchId) return {};
  return {
    externalReferenceSupplementAttempted: entry.externalReferenceSupplementAttempted,
    externalReferenceSupplementMode: entry.externalReferenceSupplementMode,
    externalReferenceDiscoverySource: entry.externalReferenceDiscoverySource,
    externalReferenceDiscoverySourceSite: entry.externalReferenceDiscoverySourceSite,
    externalReferencePlanReason: entry.externalReferencePlanReason,
    externalReferenceWarnings: entry.externalReferenceWarnings,
    externalReferenceNetworkAccessPerformed: entry.externalReferenceNetworkAccessPerformed,
    externalReferenceCandidatesFound: entry.externalReferenceCandidatesFound,
    externalReferenceCandidatesAccepted: entry.externalReferenceCandidatesAccepted,
    externalReferenceHumanApprovalRequired: entry.externalReferenceHumanApprovalRequired,
    externalReferenceManualCandidatesAvailable: entry.externalReferenceManualCandidatesAvailable,
    externalReferenceManualCandidatesEligible: entry.externalReferenceManualCandidatesEligible,
    plannedExternalReferenceNote: entry.plannedExternalReferenceNote,
    externalReferenceDisplayMessage: entry.externalReferenceDisplayMessage,
  };
}

function metricsFromRun(
  entry: Daily30CloudRunStateEntry | null,
  batchId: string,
  candidates: ExternalLeadCandidate[],
  leads: Lead[]
): Pick<
  Daily30CloudDashboardPayload,
  | 'collected'
  | 'totalCollected'
  | 'targetEmailFound'
  | 'emailFound'
  | 'formOnly'
  | 'noEmail'
  | 'reachedTarget'
  | 'stoppedReason'
  | 'duplicates'
  | 'excluded'
  | 'nextArea'
  | 'status'
  | 'mode'
> {
  const dashboard = buildDaily30Dashboard(candidates, leads, batchId);
  const batchMetrics = countDaily30BatchMetrics(candidates, batchId);
  if (entry && entry.batchId === batchId) {
    const staleFormMetrics =
      entry.formOnly === 0 &&
      entry.noEmail === 0 &&
      (batchMetrics.formOnly > 0 || batchMetrics.noEmail > 0);
    const normalizedStatus =
      entry.status === 'success' && !entry.reachedTarget && entry.mode === 'run'
        ? ('partial_success' as const)
        : entry.status;
    return {
      targetEmailFound: entry.targetEmailFound,
      collected: entry.totalCollected,
      totalCollected: entry.totalCollected,
      emailFound: entry.emailFound,
      formOnly: staleFormMetrics ? batchMetrics.formOnly : entry.formOnly,
      noEmail: staleFormMetrics ? batchMetrics.noEmail : entry.noEmail,
      reachedTarget: entry.reachedTarget,
      stoppedReason: entry.stoppedReason,
      duplicates: entry.duplicates,
      excluded: entry.excluded,
      nextArea: entry.nextArea ?? dashboard.nextExploreArea,
      status: normalizedStatus as Daily30CloudAutomationStatus,
      mode: entry.mode,
    };
  }
  return {
    targetEmailFound: batchMetrics.targetEmailFound,
    collected: batchMetrics.totalCollected,
    totalCollected: batchMetrics.totalCollected,
    emailFound: batchMetrics.emailFound,
    formOnly: batchMetrics.formOnly,
    noEmail: batchMetrics.noEmail,
    reachedTarget: batchMetrics.reachedTarget,
    duplicates: batchMetrics.duplicates,
    excluded: batchMetrics.excluded,
    nextArea: dashboard.nextExploreArea,
    status: 'not_run',
    mode: 'not_run',
  };
}

export async function buildDaily30CloudDashboardPayload(
  leads: Lead[]
): Promise<Daily30CloudDashboardPayload> {
  const storage = describeStorageBackendStatus();
  const batchId = todayBatchIdJst();

  let candidates: ExternalLeadCandidate[];
  let latestRun: Daily30CloudRunStateEntry | null = null;

  try {
    [candidates, latestRun] = await Promise.all([
      loadExternalCandidatesFromJson(),
      getLatestCloudRunEntry(),
    ]);
  } catch (err) {
    if (getStorageBackend() === 'gcs') {
      const hint = getDaily30CloudErrorDefinition('GCS_READ_FAILED').recoveryHint;
      const auth = diagnoseGcsAuth();
      return {
        ok: false,
        storageBackend: storage.backend,
        batchId,
        status: 'not_run',
        mode: 'gcs_read_failed',
        collected: 0,
        totalCollected: 0,
        targetEmailFound: 30,
        emailFound: 0,
        formOnly: 0,
        noEmail: 0,
        reachedTarget: false,
        duplicates: 0,
        excluded: 0,
        nextArea: '—',
        startedAt: null,
        finishedAt: null,
        durationMs: null,
        errorCode: 'GCS_READ_FAILED',
        recoveryHint: hint,
        gcsBucketConfigured: Boolean(storage.gcsBucket),
        schedulerConfigured: isCloudSchedulerConfigured(),
        cloudRunUrlConfigured: isCloudRunUrlConfigured(),
        nextScheduledRun: NEXT_SCHEDULED_RUN_LABEL,
        allCandidates: [],
        candidates: [],
        emailFoundCandidates: [],
        gcsReadError: sanitizeErrorMessageSafe(
          err instanceof Error ? err.message : 'GCS read failed'
        ),
        gcsAuthSummary: formatGcsAuthForPayload(auth),
      };
    }
    throw err;
  }

  const metrics = metricsFromRun(latestRun, batchId, candidates, leads);
  const resolvedForToday = await resolveDaily30FetchRunContext(batchId);
  const humanExcludedCandidates = candidates.filter(isDaily30HumanExcludedCandidate);
  const todayCandidates = candidates.filter((c) => c.collectionBatchId === batchId);
  const humanExcludedCount = countDaily30HumanExcluded(todayCandidates);
  const visibleCandidates = filterDaily30VisibleCandidates(candidates);
  const emailFoundCandidates = visibleCandidates.filter((c) => c.pipelineStatus === 'email_found');
  const contactPathSummary = summarizeDaily30ContactPaths(candidates, batchId);

  let cloudStatus;
  try {
    cloudStatus = await buildDaily30CloudStatus();
  } catch {
    cloudStatus = {
      automationStatus: 'not_run' as const,
    };
  }

  return {
    ok: true,
    storageBackend: storage.backend,
    batchId,
    status: cloudStatus.automationStatus,
    mode: latestRun?.mode ?? metrics.mode,
    targetEmailFound: metrics.targetEmailFound,
    collected: metrics.collected,
    totalCollected: metrics.totalCollected,
    emailFound: metrics.emailFound,
    formOnly: metrics.formOnly,
    noEmail: metrics.noEmail,
    reachedTarget: metrics.reachedTarget,
    stoppedReason: metrics.stoppedReason,
    duplicates: metrics.duplicates,
    excluded: metrics.excluded,
    nextArea: metrics.nextArea,
    startedAt: latestRun?.startedAt ?? null,
    finishedAt: latestRun?.finishedAt ?? null,
    durationMs: latestRun?.durationMs ?? null,
    errorCode: latestRun?.errorCode,
    recoveryHint: latestRun?.recoveryHint,
    gcsBucketConfigured: storage.backend === 'gcs' && Boolean(storage.gcsBucket),
    schedulerConfigured: isCloudSchedulerConfigured(),
    cloudRunUrlConfigured: isCloudRunUrlConfigured(),
    nextScheduledRun: NEXT_SCHEDULED_RUN_LABEL,
    allCandidates: candidates,
    candidates: visibleCandidates,
    emailFoundCandidates,
    contactPathSummary,
    humanExcludedCount,
    humanExcludedCandidates,
    lastRunCollectionProfileName: latestRun?.collectionProfileName ?? null,
    lastRunScheduleSource: latestRun?.scheduleSource
      ? formatScheduleSourceLabel(latestRun.scheduleSource)
      : null,
    lastRunAreasUsed: latestRun?.areasUsed ?? [],
    lastRunScheduleWarning: latestRun?.scheduleWarning ?? null,
    resolvedForToday,
    lastRunResolvedContext:
      latestRun?.batchId === batchId ? buildRunContextFromCloudStateEntry(latestRun) : null,
    ...externalReferenceFieldsFromEntry(latestRun, batchId),
  };
}

function formatGcsAuthForPayload(auth: ReturnType<typeof diagnoseGcsAuth>): string[] {
  return [
    `ADC: ${auth.adcCredentialFileFound ? 'あり' : 'なし'}`,
    `gcloud CLI: ${auth.gcloudCliAvailable ? 'あり' : 'なし'}`,
    `GOOGLE_APPLICATION_CREDENTIALS: ${
      auth.googleApplicationCredentialsSet
        ? auth.googleApplicationCredentialsFileExists
          ? 'ファイルあり'
          : 'ファイル未検出'
        : '未設定'
    }`,
    auth.recommendedAction,
  ];
}

export interface GrowlyStorageStatusPayload {
  storageBackend: 'local' | 'gcs';
  gcsBucket: string | null;
  gcsPrefix: string;
  schedulerConfigured: boolean;
  cloudRunUrlConfigured: boolean;
  pilotModeLabel: string;
  storageLabel: string;
}

export function buildGrowlyStorageStatusPayload(): GrowlyStorageStatusPayload {
  const storage = describeStorageBackendStatus();
  const isGcs = storage.backend === 'gcs';
  return {
    storageBackend: storage.backend,
    gcsBucket: storage.gcsBucket,
    gcsPrefix: storage.gcsPrefix,
    schedulerConfigured: isCloudSchedulerConfigured(),
    cloudRunUrlConfigured: isCloudRunUrlConfigured(),
    pilotModeLabel: isGcs
      ? 'Cloud Daily 30 連携 / ローカルUI'
      : 'ローカル手動MVP / パイロット運用',
    storageLabel: isGcs
      ? `保存先：Cloud Storage (${storage.gcsBucket ?? 'bucket未設定'})`
      : '保存先：ローカルJSON',
  };
}
