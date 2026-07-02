import type { ExternalLeadCandidate } from '../adapters/externalLeadCandidateTypes.js';
import { isApiProductionEnabled, isExternalFetchConfigured, loadEnv } from '../config/env.js';
import { loadTargetProfile } from '../config/targetProfile.js';
import { getLeadsJsonPath } from '../config/paths.js';
import { loadLeadsFromJson } from '../storage/jsonLeadRepository.js';
import { loadExternalCandidatesFromJson, persistExternalCandidates } from '../storage/externalCandidatesRepository.js';
import {
  buildDaily30Dashboard,
  describeDaily30AreaExpansion,
} from './buildDaily30Dashboard.js';
import { fetchDaily30Candidates, resolveDaily30FetchRunContext } from './fetchDaily30Candidates.js';
import { getJstDateString, todayBatchIdJst } from './daily30AreaConfig.js';
import { DAILY_30_TARGET, DAILY_30_TARGET_EMAIL_FOUND } from './daily30CandidateStatus.js';
import type { Daily30CollectionProfileSnapshot } from './daily30CollectionProfile.js';
import {
  formatScheduleWarningLabel,
  type Daily30ScheduleSource,
  type Daily30ScheduleWarning,
  type ResolvedDaily30CollectionRunContext,
} from './resolveDaily30CollectionSchedule.js';
import {
  countDaily30BatchMetrics,
  ensureDaily30StoppedReasonForRun,
  type Daily30StoppedReason,
} from './daily30BatchMetrics.js';
import { DAILY_30_AREA_EXPANSION, filterDaily30ExecutionAreas } from './daily30AreaConfig.js';
import {
  createCloudRunId,
  getCloudRunEntryForBatch,
  isBatchCloudRunCompleted,
  recordCloudRunEntry,
  getLatestCloudRunEntry,
  type Daily30CloudRunStateEntry,
  type Daily30CloudRunMode,
  type Daily30CloudRunStatus,
} from '../storage/daily30CloudRunState.js';
import { isDaily30CloudRunTokenConfigured } from '../config/daily30CloudAuth.js';
import {
  getCloudRunServiceUrl,
  isCloudRunUrlConfigured,
  isCloudSchedulerConfigured,
  NEXT_SCHEDULED_RUN_LABEL,
  SCHEDULER_JOB_NAME,
  SCHEDULER_CRON,
  SCHEDULER_TARGET_PATH,
  SCHEDULER_TIMEZONE,
  CLOUD_LOGGING_FILTER_ONE_LINE,
} from '../config/cloudDeployConfig.js';
import {
  assertGcsStorageConfigured,
  describeStorageBackendStatus,
  getStorageBackend,
  isGcsStorageBackend,
} from '../config/storageBackend.js';
import {
  previewDaily30ExternalReferenceSupplement,
  supplementResultToStateFields,
  type Daily30ExternalReferenceSupplementResult,
} from './daily30ExternalReferenceSupplement.js';
import {
  classifyUnknownError,
  getDaily30CloudErrorDefinition,
  type Daily30CloudErrorCode,
} from './daily30CloudRunErrors.js';

export type Daily30CloudAutoFetchMode = Daily30CloudRunMode;

export interface Daily30CloudAutoFetchResponse {
  ok: boolean;
  mode: Daily30CloudAutoFetchMode;
  status: Daily30CloudRunStatus;
  runId: string;
  batchId: string;
  target: number;
  targetEmailFound: number;
  collected: number;
  totalCollected: number;
  emailFound: number;
  formOnly: number;
  noEmail: number;
  duplicates: number;
  excluded: number;
  reachedTarget: boolean;
  stoppedReason?: Daily30StoppedReason;
  nextArea: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  message: string;
  safeMessage: string;
  dryRun?: boolean;
  force?: boolean;
  areaExpansion?: string;
  externalFetchConfigured?: boolean;
  cloudRunAlreadyCompleted?: boolean;
  existingCount?: number;
  errorCode?: Daily30CloudErrorCode;
  recoveryHint?: string;
  logsHint: string;
  selectedProfile?: Daily30CollectionProfileSnapshot;
  scheduleSource?: Daily30ScheduleSource;
  plannedAreaStrategy?: Daily30CollectionProfileSnapshot['areaStrategy'];
  plannedAreas?: string[];
  effectiveFromBatchId?: string | null;
  wouldConsumeOverride?: boolean;
  scheduleWarnings?: string[];
  areasUsed?: string[];
  warning?: string;
  externalReferenceSupplement?: Daily30ExternalReferenceSupplementResult;
}

export interface Daily30CloudAutoFetchOptions {
  dryRun?: boolean;
  force?: boolean;
  batchId?: string;
  /** dry-run やローカル確認時は state へ書かない */
  skipStateWrite?: boolean;
}

interface RunEnvironmentSnapshot {
  storageBackend: string;
  schedulerConfigured: boolean;
  cloudRunServiceUrlConfigured: boolean;
  gcsBucketConfigured: boolean;
}

function countBatchMetrics(candidates: ExternalLeadCandidate[], batchId: string) {
  return countDaily30BatchMetrics(candidates, batchId);
}

function buildRunMetricsFields(metrics: ReturnType<typeof countDaily30BatchMetrics>) {
  return {
    collected: metrics.totalCollected,
    totalCollected: metrics.totalCollected,
    targetEmailFound: metrics.targetEmailFound,
    emailFound: metrics.emailFound,
    formOnly: metrics.formOnly,
    noEmail: metrics.noEmail,
    duplicates: metrics.duplicates,
    excluded: metrics.excluded,
    reachedTarget: metrics.reachedTarget,
  };
}

function buildFetchCompletionMessage(reachedTarget: boolean): string {
  return reachedTarget
    ? 'Daily 30 email-found target completed'
    : 'Daily 30 partially completed — email-found target not reached';
}

function buildFetchFailedMessage(fallback: string): string {
  return fallback.trim() || 'Daily 30 auto-fetch failed';
}

function getEnvironmentSnapshot(): RunEnvironmentSnapshot {
  const storage = describeStorageBackendStatus();
  return {
    storageBackend: storage.backend,
    schedulerConfigured: isCloudSchedulerConfigured(),
    cloudRunServiceUrlConfigured: isCloudRunUrlConfigured(),
    gcsBucketConfigured: storage.backend === 'gcs' && Boolean(storage.gcsBucket),
  };
}

function durationMs(startedAt: string, finishedAt: string): number {
  return Math.max(0, new Date(finishedAt).getTime() - new Date(startedAt).getTime());
}

function logCloudAutoFetch(
  phase: 'start' | 'complete' | 'failed',
  fields: Record<string, string | number | boolean | undefined>
): void {
  const safe: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined) safe[k] = v;
  }
  console.log(`[daily30-cloud] auto-fetch ${phase}`, safe);
}

function buildResponse(
  partial: Omit<Daily30CloudAutoFetchResponse, 'finishedAt' | 'durationMs' | 'logsHint' | 'safeMessage'> & {
    finishedAt?: string;
    logsHint?: string;
    safeMessage?: string;
  }
): Daily30CloudAutoFetchResponse {
  const finishedAt = partial.finishedAt ?? new Date().toISOString();
  const safeMessage = partial.safeMessage ?? partial.message;
  const totalCollected = partial.totalCollected ?? partial.collected ?? 0;
  const targetEmailFound = partial.targetEmailFound ?? DAILY_30_TARGET_EMAIL_FOUND;
  return {
    ...partial,
    target: partial.target ?? DAILY_30_TARGET,
    targetEmailFound,
    totalCollected,
    collected: totalCollected,
    formOnly: partial.formOnly ?? 0,
    noEmail: partial.noEmail ?? 0,
    reachedTarget: partial.reachedTarget ?? partial.emailFound >= targetEmailFound,
    finishedAt,
    durationMs: durationMs(partial.startedAt, finishedAt),
    safeMessage,
    logsHint: partial.logsHint ?? CLOUD_LOGGING_FILTER_ONE_LINE,
  };
}

async function finalizeRun(
  entry: Daily30CloudRunStateEntry,
  response: Omit<Daily30CloudAutoFetchResponse, 'finishedAt' | 'durationMs' | 'logsHint' | 'safeMessage'>,
  options: { skipStateWrite?: boolean }
): Promise<Daily30CloudAutoFetchResponse> {
  if (!options.skipStateWrite && entry.mode !== 'dry_run') {
    await recordCloudRunEntry(entry);
  }
  logCloudAutoFetch(entry.status === 'failed' ? 'failed' : 'complete', {
    runId: entry.runId,
    batchId: entry.batchId,
    mode: entry.mode,
    status: entry.status,
    errorCode: entry.errorCode,
    durationMs: entry.durationMs,
  });
  return buildResponse({
    ...response,
    finishedAt: entry.finishedAt,
    safeMessage: entry.errorMessageSafe ?? response.message,
    errorCode: entry.errorCode,
    recoveryHint: entry.recoveryHint,
  });
}

function attachSupplementToEntry(
  entry: Daily30CloudRunStateEntry,
  supplement: Daily30ExternalReferenceSupplementResult | undefined
): Daily30CloudRunStateEntry {
  if (!supplement) return entry;
  return { ...entry, ...supplementResultToStateFields(supplement) };
}

function supplementResponseFields(
  supplement: Daily30ExternalReferenceSupplementResult | undefined
): Pick<Daily30CloudAutoFetchResponse, 'externalReferenceSupplement'> {
  return supplement ? { externalReferenceSupplement: supplement } : {};
}

function scheduleWarningText(warnings: Daily30ScheduleWarning[]): string | null {
  if (warnings.length === 0) return null;
  return warnings.map(formatScheduleWarningLabel).join(' / ');
}

function buildScheduleResponseFields(runContext: ResolvedDaily30CollectionRunContext) {
  return {
    selectedProfile: runContext.profile,
    scheduleSource: runContext.scheduleSource,
    plannedAreaStrategy: runContext.profile.areaStrategy,
    plannedAreas: runContext.plannedAreaPrefectures,
    effectiveFromBatchId: runContext.effectiveFromBatchId,
    wouldConsumeOverride: runContext.wouldConsumeOverride,
    scheduleWarnings: runContext.warnings.map(formatScheduleWarningLabel),
  };
}

function attachRunCollectionMeta(
  entry: Daily30CloudRunStateEntry,
  meta?: {
    startedAt: string;
    runId: string;
    profile: Daily30CollectionProfileSnapshot;
    runContext?: ResolvedDaily30CollectionRunContext;
    areasUsed?: string[];
    scheduleConsumedAt?: string | null;
    scheduleConsumedBatchId?: string | null;
  }
): Daily30CloudRunStateEntry {
  if (!meta) return entry;
  const runContext = meta.runContext;
  return {
    ...entry,
    runStartedAtUtc: meta.startedAt,
    runStartedAtJst: getJstDateString(new Date(meta.startedAt)),
    collectionProfileId: meta.profile.collectionProfileId,
    collectionProfileName: meta.profile.collectionProfileName,
    collectionMode: meta.profile.collectionMode,
    industryCategory: meta.profile.industryCategory,
    areaStrategy: meta.profile.areaStrategy,
    collectionRunId: meta.runId,
    discoverySource: meta.profile.discoverySource,
    discoverySourceSite: meta.profile.discoverySourceSite,
    discoverySourceLabel: meta.profile.discoverySourceLabel,
    areasUsed: meta.areasUsed,
    scheduleSource: runContext?.scheduleSource,
    scheduleWarning: runContext ? scheduleWarningText(runContext.warnings) : null,
    effectiveFromBatchId: runContext?.effectiveFromBatchId ?? null,
    scheduleConsumedAt: meta.scheduleConsumedAt ?? null,
    scheduleConsumedBatchId: meta.scheduleConsumedBatchId ?? null,
  };
}

function makeStateEntry(
  base: {
    runId: string;
    batchId: string;
    mode: Daily30CloudRunMode;
    status: Daily30CloudRunStatus;
    startedAt: string;
    finishedAt: string;
    collected: number;
    totalCollected?: number;
    targetEmailFound?: number;
    emailFound: number;
    formOnly?: number;
    noEmail?: number;
    reachedTarget?: boolean;
    stoppedReason?: Daily30StoppedReason;
    duplicates: number;
    excluded: number;
    nextArea?: string;
    force: boolean;
    message?: string;
    errorCode?: Daily30CloudErrorCode;
    errorMessageSafe?: string;
    recoveryHint?: string;
  },
  env: RunEnvironmentSnapshot,
  collectionMeta?: {
    startedAt: string;
    runId: string;
    profile: Daily30CollectionProfileSnapshot;
    runContext?: ResolvedDaily30CollectionRunContext;
    areasUsed?: string[];
    scheduleConsumedAt?: string | null;
    scheduleConsumedBatchId?: string | null;
  }
): Daily30CloudRunStateEntry {
  const executionAreaCount = filterDaily30ExecutionAreas(DAILY_30_AREA_EXPANSION).length;
  const totalCollected = base.totalCollected ?? base.collected;
  const targetEmailFound = base.targetEmailFound ?? DAILY_30_TARGET_EMAIL_FOUND;
  const emailFound = base.emailFound;
  const reachedTarget = base.reachedTarget ?? emailFound >= targetEmailFound;
  const duration = durationMs(base.startedAt, base.finishedAt);
  const stoppedReason =
    base.mode === 'run' && (base.status === 'success' || base.status === 'partial_success')
      ? ensureDaily30StoppedReasonForRun({
          reachedTarget,
          emailFound,
          targetEmailFound,
          totalCollected,
          durationMs: duration,
          explicit: base.stoppedReason,
          totalAreas: executionAreaCount,
        })
      : base.stoppedReason;
  return attachRunCollectionMeta(
    {
      ...base,
      collected: totalCollected,
      totalCollected,
      targetEmailFound,
      formOnly: base.formOnly ?? 0,
      noEmail: base.noEmail ?? 0,
      reachedTarget,
      stoppedReason,
      completedAt: base.finishedAt,
      durationMs: duration,
      storageBackend: env.storageBackend,
      schedulerConfigured: env.schedulerConfigured,
      cloudRunServiceUrlConfigured: env.cloudRunServiceUrlConfigured,
      gcsBucketConfigured: env.gcsBucketConfigured,
    },
    collectionMeta
  );
}

/** Cloud Run / Scheduler 向け Daily 30 候補収集のみ（Gmail・営業文・Lead取り込みなし） */
export async function runDaily30CloudAutoFetch(
  options: Daily30CloudAutoFetchOptions = {}
): Promise<Daily30CloudAutoFetchResponse> {
  const startedAt = new Date().toISOString();
  const batchId = options.batchId ?? todayBatchIdJst();
  const dryRun = options.dryRun === true;
  const force = options.force === true;
  const runId = createCloudRunId(batchId);
  const env = getEnvironmentSnapshot();
  const skipStateWrite = options.skipStateWrite === true;
  const runContext = await resolveDaily30FetchRunContext(batchId);
  const collectionMeta = {
    startedAt,
    runId,
    profile: runContext.profile,
    runContext,
  };
  const scheduleFields = buildScheduleResponseFields(runContext);

  logCloudAutoFetch('start', { runId, batchId, dryRun, force });

  let leads;
  let existingCandidates;
  try {
    [leads, existingCandidates] = await Promise.all([
      loadLeadsFromJson(getLeadsJsonPath()),
      loadExternalCandidatesFromJson(),
    ]);
  } catch (err) {
    const classified = classifyUnknownError(err);
    const code =
      isGcsStorageBackend() && /read/i.test(classified.errorMessageSafe)
        ? 'GCS_READ_FAILED'
        : classified.errorCode;
    const def = getDaily30CloudErrorDefinition(code);
    const finishedAt = new Date().toISOString();
    const entry = makeStateEntry(
      {
        runId,
        batchId,
        mode: 'failed',
        status: 'failed',
        startedAt,
        finishedAt,
        collected: 0,
        emailFound: 0,
        duplicates: 0,
        excluded: 0,
        force,
        errorCode: code,
        errorMessageSafe: def.errorMessageSafe,
        recoveryHint: def.recoveryHint,
        message: def.errorMessageSafe,
      },
      env,
      collectionMeta
    );
    return finalizeRun(
      entry,
      {
        ok: false,
        mode: 'failed',
        status: 'failed',
        runId,
        batchId,
        target: DAILY_30_TARGET,
        collected: 0,
        emailFound: 0,
        duplicates: 0,
        excluded: 0,
        nextArea: '',
        startedAt,
        message: def.errorMessageSafe,
        force,
        errorCode: code,
        recoveryHint: def.recoveryHint,
      },
      { skipStateWrite }
    );
  }

  const dashboard = buildDaily30Dashboard(existingCandidates, leads, batchId);
  const cloudRunAlreadyCompleted = await isBatchCloudRunCompleted(batchId);

  if (dryRun) {
    const metrics = countBatchMetrics(existingCandidates, batchId);
    const supplement = await previewDaily30ExternalReferenceSupplement({
      profile: runContext.profile,
      batchId,
      emailFound: metrics.emailFound,
      reachedTarget: metrics.reachedTarget,
      existingCandidates,
      prefecture: runContext.plannedAreaPrefectures[0] ?? null,
    });
    const finishedAt = new Date().toISOString();
    return buildResponse({
      ok: true,
      mode: 'dry_run',
      status: 'skipped',
      runId,
      batchId,
      target: DAILY_30_TARGET,
      ...buildRunMetricsFields(metrics),
      nextArea: runContext.plannedAreaPrefectures[0] ?? dashboard.nextExploreArea,
      startedAt,
      finishedAt,
      message: 'Dry run — 外部通信・保存・schedule消費は行っていません',
      dryRun: true,
      force,
      areaExpansion: describeDaily30AreaExpansion(),
      externalFetchConfigured: isExternalFetchConfigured(),
      cloudRunAlreadyCompleted,
      existingCount: existingCandidates.length,
      ...scheduleFields,
      warning: scheduleFields.scheduleWarnings?.[0],
      ...supplementResponseFields(supplement),
    });
  }

  if (isGcsStorageBackend()) {
    try {
      assertGcsStorageConfigured();
    } catch {
      const def = getDaily30CloudErrorDefinition('GCS_NOT_CONFIGURED');
      const finishedAt = new Date().toISOString();
      const entry = makeStateEntry(
        {
          runId,
          batchId,
          mode: 'blocked',
          status: 'blocked',
          startedAt,
          finishedAt,
          collected: dashboard.collectedToday,
          emailFound: dashboard.emailFoundCount,
          duplicates: dashboard.duplicateExcludedCount,
          excluded: dashboard.excludedCount,
          nextArea: dashboard.nextExploreArea,
          force,
          errorCode: 'GCS_NOT_CONFIGURED',
          errorMessageSafe: def.errorMessageSafe,
          recoveryHint: def.recoveryHint,
        },
        env,
        collectionMeta
      );
      return finalizeRun(
        entry,
        {
          ok: false,
          mode: 'blocked',
          status: 'blocked',
          runId,
          batchId,
          target: DAILY_30_TARGET,
          collected: dashboard.collectedToday,
          emailFound: dashboard.emailFoundCount,
          duplicates: dashboard.duplicateExcludedCount,
          excluded: dashboard.excludedCount,
          nextArea: dashboard.nextExploreArea,
          startedAt,
          message: def.errorMessageSafe,
          force,
          errorCode: 'GCS_NOT_CONFIGURED',
          recoveryHint: def.recoveryHint,
          externalFetchConfigured: isExternalFetchConfigured(),
          cloudRunAlreadyCompleted,
        },
        { skipStateWrite }
      );
    }
  }

  if (!isApiProductionEnabled()) {
    const def = getDaily30CloudErrorDefinition('API_PRODUCTION_DISABLED');
    const finishedAt = new Date().toISOString();
    const entry = makeStateEntry(
      {
        runId,
        batchId,
        mode: 'blocked',
        status: 'blocked',
        startedAt,
        finishedAt,
        collected: dashboard.collectedToday,
        emailFound: dashboard.emailFoundCount,
        duplicates: dashboard.duplicateExcludedCount,
        excluded: dashboard.excludedCount,
        nextArea: dashboard.nextExploreArea,
        force,
        errorCode: 'API_PRODUCTION_DISABLED',
        errorMessageSafe: def.errorMessageSafe,
        recoveryHint: def.recoveryHint,
      },
      env,
      collectionMeta
    );
    return finalizeRun(
      entry,
      {
        ok: false,
        mode: 'blocked',
        status: 'blocked',
        runId,
        batchId,
        target: DAILY_30_TARGET,
        collected: dashboard.collectedToday,
        emailFound: dashboard.emailFoundCount,
        duplicates: dashboard.duplicateExcludedCount,
        excluded: dashboard.excludedCount,
        nextArea: dashboard.nextExploreArea,
        startedAt,
        message: def.errorMessageSafe,
        force,
        errorCode: 'API_PRODUCTION_DISABLED',
        recoveryHint: def.recoveryHint,
        externalFetchConfigured: false,
        cloudRunAlreadyCompleted,
      },
      { skipStateWrite }
    );
  }

  if (!isExternalFetchConfigured()) {
    const envKeys = loadEnv();
    const code: Daily30CloudErrorCode = envKeys.isPlacesConfigured
      ? 'API_PRODUCTION_DISABLED'
      : 'PLACES_API_KEY_MISSING';
    const def = getDaily30CloudErrorDefinition(code);
    const finishedAt = new Date().toISOString();
    const entry = makeStateEntry(
      {
        runId,
        batchId,
        mode: 'blocked',
        status: 'blocked',
        startedAt,
        finishedAt,
        collected: dashboard.collectedToday,
        emailFound: dashboard.emailFoundCount,
        duplicates: dashboard.duplicateExcludedCount,
        excluded: dashboard.excludedCount,
        nextArea: dashboard.nextExploreArea,
        force,
        errorCode: code,
        errorMessageSafe: def.errorMessageSafe,
        recoveryHint: def.recoveryHint,
      },
      env,
      collectionMeta
    );
    return finalizeRun(
      entry,
      {
        ok: false,
        mode: 'blocked',
        status: 'blocked',
        runId,
        batchId,
        target: DAILY_30_TARGET,
        collected: dashboard.collectedToday,
        emailFound: dashboard.emailFoundCount,
        duplicates: dashboard.duplicateExcludedCount,
        excluded: dashboard.excludedCount,
        nextArea: dashboard.nextExploreArea,
        startedAt,
        message: def.errorMessageSafe,
        force,
        errorCode: code,
        recoveryHint: def.recoveryHint,
        externalFetchConfigured: false,
        cloudRunAlreadyCompleted,
      },
      { skipStateWrite }
    );
  }

  if (!force && cloudRunAlreadyCompleted) {
    const prev = await getCloudRunEntryForBatch(batchId);
    const def = getDaily30CloudErrorDefinition('DUPLICATE_GUARD_ALREADY_RAN');
    const finishedAt = new Date().toISOString();
    const entry = makeStateEntry(
      {
        runId,
        batchId,
        mode: 'already_ran',
        status: 'skipped',
        startedAt,
        finishedAt,
        collected: prev?.collected ?? dashboard.collectedToday,
        emailFound: prev?.emailFound ?? dashboard.emailFoundCount,
        duplicates: prev?.duplicates ?? dashboard.duplicateExcludedCount,
        excluded: prev?.excluded ?? dashboard.excludedCount,
        nextArea: dashboard.nextExploreArea,
        force: false,
        errorCode: 'DUPLICATE_GUARD_ALREADY_RAN',
        errorMessageSafe: def.errorMessageSafe,
        recoveryHint: def.recoveryHint,
        message: def.errorMessageSafe,
      },
      env,
      collectionMeta
    );
    return finalizeRun(
      entry,
      {
        ok: true,
        mode: 'already_ran',
        status: 'skipped',
        runId,
        batchId,
        target: DAILY_30_TARGET,
        collected: prev?.collected ?? dashboard.collectedToday,
        emailFound: prev?.emailFound ?? dashboard.emailFoundCount,
        duplicates: prev?.duplicates ?? dashboard.duplicateExcludedCount,
        excluded: prev?.excluded ?? dashboard.excludedCount,
        nextArea: dashboard.nextExploreArea,
        startedAt,
        message: def.errorMessageSafe,
        force: false,
        errorCode: 'DUPLICATE_GUARD_ALREADY_RAN',
        recoveryHint: def.recoveryHint,
        cloudRunAlreadyCompleted: true,
      },
      { skipStateWrite }
    );
  }

  try {
    const profile = await loadTargetProfile();
    const { candidates, stats } = await fetchDaily30Candidates(profile, leads, existingCandidates, {
      batchId,
      verifyEmails: true,
      collectionRunId: runId,
      runContext,
    });

    try {
      await persistExternalCandidates(candidates);
    } catch (persistErr) {
      const classified = classifyUnknownError(persistErr);
      const code = isGcsStorageBackend() ? 'GCS_WRITE_FAILED' : classified.errorCode;
      const def = getDaily30CloudErrorDefinition(code);
      const finishedAt = new Date().toISOString();
      const metrics = countBatchMetrics(candidates, batchId);
      const entry = makeStateEntry(
        {
          runId,
          batchId,
          mode: 'failed',
          status: 'failed',
          startedAt,
          finishedAt,
          collected: metrics.collected,
          emailFound: stats.emailFound,
          duplicates: metrics.duplicates,
          excluded: metrics.excluded,
          nextArea: dashboard.nextExploreArea,
          force,
          errorCode: code,
          errorMessageSafe: def.errorMessageSafe,
          recoveryHint: def.recoveryHint,
        },
        env,
        collectionMeta
      );
      return finalizeRun(
        entry,
        {
          ok: false,
          mode: 'failed',
          status: 'failed',
          runId,
          batchId,
          target: DAILY_30_TARGET,
          collected: metrics.collected,
          emailFound: stats.emailFound,
          duplicates: metrics.duplicates,
          excluded: metrics.excluded,
          nextArea: dashboard.nextExploreArea,
          startedAt,
          message: def.errorMessageSafe,
          force,
          errorCode: code,
          recoveryHint: def.recoveryHint,
        },
        { skipStateWrite }
      );
    }

    const metrics = countBatchMetrics(candidates, batchId);
    const afterDashboard = buildDaily30Dashboard(candidates, leads, batchId);
    const finishedAt = new Date().toISOString();
    const reachedTarget = stats.reachedTarget;
    const runStatus: Daily30CloudRunStatus = reachedTarget ? 'success' : 'partial_success';
    const message = buildFetchCompletionMessage(reachedTarget);
    const runCollectionMeta = {
      ...collectionMeta,
      areasUsed: stats.areasUsed,
      scheduleConsumedAt: runContext.wouldConsumeOverride ? finishedAt : null,
      scheduleConsumedBatchId: runContext.wouldConsumeOverride ? batchId : null,
    };
    const entry = attachSupplementToEntry(
      makeStateEntry(
        {
          runId,
          batchId,
          mode: 'run',
          status: runStatus,
          startedAt,
          finishedAt,
          ...buildRunMetricsFields(metrics),
          stoppedReason: stats.stoppedReason,
          nextArea: afterDashboard.nextExploreArea,
          force,
          message,
        },
        env,
        runCollectionMeta
      ),
      stats.externalReferenceSupplement
    );
    return finalizeRun(
      entry,
      {
        ok: true,
        mode: 'run',
        status: runStatus,
        runId,
        batchId,
        target: DAILY_30_TARGET,
        ...buildRunMetricsFields(metrics),
        stoppedReason: stats.stoppedReason,
        nextArea: afterDashboard.nextExploreArea,
        startedAt,
        message,
        force,
        cloudRunAlreadyCompleted: false,
        ...scheduleFields,
        areasUsed: stats.areasUsed,
        warning: scheduleFields.scheduleWarnings?.[0],
        ...supplementResponseFields(stats.externalReferenceSupplement),
      },
      { skipStateWrite }
    );
  } catch (err) {
    const classified = classifyUnknownError(err);
    let code = classified.errorCode;
    if (/Places|places|PLACES/i.test(classified.errorMessageSafe)) {
      code = 'PLACES_API_FAILED';
    } else if (code === 'UNKNOWN_ERROR') {
      code = 'FETCH_FAILED';
    }
    const def = getDaily30CloudErrorDefinition(code);
    const finishedAt = new Date().toISOString();
    const entry = makeStateEntry(
      {
        runId,
        batchId,
        mode: 'failed',
        status: 'failed',
        startedAt,
        finishedAt,
        collected: dashboard.collectedToday,
        emailFound: dashboard.emailFoundCount,
        duplicates: dashboard.duplicateExcludedCount,
        excluded: dashboard.excludedCount,
        nextArea: dashboard.nextExploreArea,
        force,
        errorCode: code,
        errorMessageSafe: def.errorMessageSafe,
        recoveryHint: def.recoveryHint,
      },
      env,
      collectionMeta
    );
    return finalizeRun(
      entry,
      {
        ok: false,
        mode: 'failed',
        status: 'failed',
        runId,
        batchId,
        target: DAILY_30_TARGET,
        collected: dashboard.collectedToday,
        emailFound: dashboard.emailFoundCount,
        duplicates: dashboard.duplicateExcludedCount,
        excluded: dashboard.excludedCount,
        nextArea: dashboard.nextExploreArea,
        startedAt,
        message: def.errorMessageSafe,
        force,
        errorCode: code,
        recoveryHint: def.recoveryHint,
      },
      { skipStateWrite }
    );
  }
}

export interface Daily30CloudLastRunSummary {
  runId: string;
  batchId: string;
  completedAt: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  mode: string;
  status: string;
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
  nextArea?: string;
  force: boolean;
  message: string;
  errorCode?: Daily30CloudErrorCode;
  errorMessageSafe?: string;
  recoveryHint?: string;
  recoverySteps?: string[];
}

export type Daily30CloudAutomationStatus =
  | 'success'
  | 'partial_success'
  | 'failed'
  | 'skipped'
  | 'blocked'
  | 'not_run';

export interface Daily30CloudStatus {
  apiReady: boolean;
  tokenConfigured: boolean;
  schedulerConfigured: boolean;
  schedulerJobName: string;
  schedulerCron: string;
  schedulerTimezone: string;
  schedulerTargetPath: string;
  nextScheduledRun: string;
  cloudRunUrlConfigured: boolean;
  cloudRunServiceUrl: string | null;
  storageBackend: string;
  gcsBucket: string | null;
  gcsPrefix: string;
  gcsBucketConfigured: boolean;
  batchId: string;
  duplicateGuardActive: boolean;
  todayCloudRunCompleted: boolean;
  externalFetchConfigured: boolean;
  collectedToday: number;
  target: number;
  automationStatus: Daily30CloudAutomationStatus;
  lastRun: Daily30CloudLastRunSummary | null;
  cloudLoggingFilter: string;
  message: string;
}

function mapLastRun(entry: Daily30CloudRunStateEntry | null): Daily30CloudLastRunSummary | null {
  if (!entry) return null;
  const steps = entry.errorCode
    ? getDaily30CloudErrorDefinition(entry.errorCode).recoverySteps
    : undefined;
  return {
    runId: entry.runId,
    batchId: entry.batchId,
    completedAt: entry.finishedAt,
    startedAt: entry.startedAt,
    finishedAt: entry.finishedAt,
    durationMs: entry.durationMs,
    mode: entry.mode,
    status: entry.status,
    targetEmailFound: entry.targetEmailFound,
    collected: entry.collected,
    totalCollected: entry.totalCollected,
    emailFound: entry.emailFound,
    formOnly: entry.formOnly,
    noEmail: entry.noEmail,
    reachedTarget: entry.reachedTarget,
    stoppedReason: entry.stoppedReason,
    duplicates: entry.duplicates,
    excluded: entry.excluded,
    nextArea: entry.nextArea,
    force: entry.force,
    message: entry.message ?? entry.errorMessageSafe ?? '',
    errorCode: entry.errorCode,
    errorMessageSafe: entry.errorMessageSafe,
    recoveryHint: entry.recoveryHint,
    recoverySteps: steps,
  };
}

function deriveAutomationStatus(
  lastRun: Daily30CloudLastRunSummary | null,
  todayBatchId: string
): Daily30CloudAutomationStatus {
  if (!lastRun) return 'not_run';
  if (lastRun.batchId !== todayBatchId) return 'not_run';
  if (lastRun.status === 'success') return 'success';
  if (lastRun.status === 'partial_success') return 'partial_success';
  if (lastRun.status === 'failed') return 'failed';
  if (lastRun.status === 'blocked') return 'blocked';
  if (lastRun.status === 'skipped') return 'skipped';
  return 'not_run';
}

export async function buildDaily30CloudStatus(): Promise<Daily30CloudStatus> {
  const batchId = todayBatchIdJst();
  const tokenConfigured = isDaily30CloudRunTokenConfigured();
  const todayCloudRunCompleted = await isBatchCloudRunCompleted(batchId);
  const leads = await loadLeadsFromJson(getLeadsJsonPath());
  const candidates = await loadExternalCandidatesFromJson();
  const dashboard = buildDaily30Dashboard(candidates, leads, batchId);
  const storage = describeStorageBackendStatus();
  const latestRun = await getLatestCloudRunEntry();
  const schedulerConfigured = isCloudSchedulerConfigured();
  const lastRun = mapLastRun(latestRun);
  const automationStatus = deriveAutomationStatus(lastRun, batchId);

  return {
    apiReady: true,
    tokenConfigured,
    schedulerConfigured,
    schedulerJobName: SCHEDULER_JOB_NAME,
    schedulerCron: SCHEDULER_CRON,
    schedulerTimezone: SCHEDULER_TIMEZONE,
    schedulerTargetPath: SCHEDULER_TARGET_PATH,
    nextScheduledRun: NEXT_SCHEDULED_RUN_LABEL,
    cloudRunUrlConfigured: isCloudRunUrlConfigured(),
    cloudRunServiceUrl: getCloudRunServiceUrl(),
    storageBackend: storage.backend,
    gcsBucket: storage.gcsBucket,
    gcsPrefix: storage.gcsPrefix,
    gcsBucketConfigured: getStorageBackend() === 'gcs' && Boolean(storage.gcsBucket),
    batchId,
    duplicateGuardActive: true,
    todayCloudRunCompleted,
    externalFetchConfigured: isExternalFetchConfigured(),
    collectedToday: dashboard.emailFoundAtCollection,
    target: dashboard.targetEmailFound,
    automationStatus,
    lastRun,
    cloudLoggingFilter: CLOUD_LOGGING_FILTER_ONE_LINE,
    message:
      automationStatus === 'failed'
        ? '直近の Cloud 自動収集は失敗しました — recoveryHint を確認してください'
        : schedulerConfigured
          ? 'Cloud Scheduler 連携済み — 毎朝9時に候補収集のみ自動実行'
          : tokenConfigured
            ? 'Cloud 自動収集 API 準備済み'
            : 'DAILY30_CLOUD_RUN_TOKEN 未設定 — API は無効',
  };
}

/** ルート層の認証エラー用レスポンス（秘密情報なし） */
export function buildCloudAuthErrorResponse(
  errorCode: 'TOKEN_MISSING' | 'TOKEN_INVALID',
  startedAt: string = new Date().toISOString()
): Daily30CloudAutoFetchResponse {
  const def = getDaily30CloudErrorDefinition(errorCode);
  const runId = createCloudRunId(todayBatchIdJst());
  return buildResponse({
    ok: false,
    mode: 'blocked',
    status: 'blocked',
    runId,
    batchId: todayBatchIdJst(),
    target: DAILY_30_TARGET,
    collected: 0,
    emailFound: 0,
    duplicates: 0,
    excluded: 0,
    nextArea: '',
    startedAt,
    message: def.errorMessageSafe,
    errorCode,
    recoveryHint: def.recoveryHint,
  });
}
