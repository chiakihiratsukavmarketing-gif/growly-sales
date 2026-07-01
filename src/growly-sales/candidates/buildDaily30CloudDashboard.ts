import type { ExternalLeadCandidate } from '../adapters/externalLeadCandidateTypes.js';
import type { Lead } from '../types/lead.js';
import { buildDaily30Dashboard } from './buildDaily30Dashboard.js';
import { todayBatchId } from './daily30AreaConfig.js';
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
import { filterDaily30VisibleCandidates } from '../workflow/excludeDaily30Candidate.js';
import { NEXT_SCHEDULED_RUN_LABEL, isCloudRunUrlConfigured, isCloudSchedulerConfigured } from '../config/cloudDeployConfig.js';
import { countDaily30BatchMetrics } from './daily30BatchMetrics.js';
import type { Daily30StoppedReason } from './daily30BatchMetrics.js';

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
  candidates: ExternalLeadCandidate[];
  emailFoundCandidates: ExternalLeadCandidate[];
  gcsReadError?: string;
  gcsAuthSummary?: string[];
  contactPathSummary?: Daily30ContactPathSummary;
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
  const batchId = todayBatchId();

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
    candidates: visibleCandidates,
    emailFoundCandidates,
    contactPathSummary,
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
