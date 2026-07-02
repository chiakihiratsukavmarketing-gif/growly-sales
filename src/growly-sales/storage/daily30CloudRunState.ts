import { DAILY30_CLOUD_RUN_STATE_JSON } from './jsonDocumentNames.js';
import { readJsonDocument, writeJsonDocument } from './jsonDocumentStorage.js';
import type { Daily30CloudErrorCode } from '../candidates/daily30CloudRunErrors.js';
import type { Daily30StoppedReason } from '../candidates/daily30BatchMetrics.js';
import { DAILY_30_TARGET_EMAIL_FOUND } from '../candidates/daily30CandidateStatus.js';
import type {
  Daily30AreaStrategy,
  Daily30CollectionMode,
  Daily30DiscoverySource,
  Daily30DiscoverySourceSite,
  Daily30IndustryCategory,
} from '../candidates/daily30CollectionProfile.js';
import type { Daily30ScheduleSource } from '../candidates/resolveDaily30CollectionSchedule.js';

export type Daily30CloudRunMode = 'dry_run' | 'run' | 'already_ran' | 'blocked' | 'failed';
export type Daily30CloudRunStatus = 'success' | 'partial_success' | 'failed' | 'skipped' | 'blocked';

export interface Daily30CloudRunStateEntry {
  runId: string;
  batchId: string;
  mode: Daily30CloudRunMode;
  status: Daily30CloudRunStatus;
  startedAt: string;
  finishedAt: string;
  /** @deprecated use finishedAt — kept for backward compatibility */
  completedAt: string;
  durationMs: number;
  /** @deprecated use totalCollected — 総収集候補（互換） */
  collected: number;
  targetEmailFound: number;
  emailFound: number;
  totalCollected: number;
  formOnly: number;
  noEmail: number;
  reachedTarget: boolean;
  stoppedReason?: Daily30StoppedReason;
  duplicates: number;
  excluded: number;
  nextArea?: string;
  errorCode?: Daily30CloudErrorCode;
  errorMessageSafe?: string;
  recoveryHint?: string;
  storageBackend: string;
  schedulerConfigured: boolean;
  cloudRunServiceUrlConfigured: boolean;
  gcsBucketConfigured: boolean;
  force: boolean;
  message?: string;
  /** Phase 40.2: 実行開始（UTC ISO） */
  runStartedAtUtc?: string;
  /** Phase 40.2: 実行開始日（JST YYYY-MM-DD） */
  runStartedAtJst?: string;
  collectionProfileId?: string;
  collectionProfileName?: string;
  collectionMode?: Daily30CollectionMode;
  industryCategory?: Daily30IndustryCategory;
  areaStrategy?: Daily30AreaStrategy;
  collectionRunId?: string;
  discoverySource?: Daily30DiscoverySource;
  discoverySourceSite?: Daily30DiscoverySourceSite | null;
  discoverySourceLabel?: string | null;
  areasUsed?: string[];
  scheduleSource?: Daily30ScheduleSource;
  scheduleWarning?: string | null;
  effectiveFromBatchId?: string | null;
  scheduleConsumedAt?: string | null;
  scheduleConsumedBatchId?: string | null;
  /** Phase 41.4: 外部参照補完 */
  externalReferenceSupplementAttempted?: boolean;
  externalReferenceSupplementMode?: string;
  externalReferenceDiscoverySource?: Daily30DiscoverySource;
  externalReferenceDiscoverySourceSite?: Daily30DiscoverySourceSite | null;
  externalReferencePlanReason?: string;
  externalReferenceWarnings?: string[];
  externalReferenceNetworkAccessPerformed?: false;
  externalReferenceCandidatesFound?: number;
  externalReferenceCandidatesAccepted?: number;
  externalReferenceHumanApprovalRequired?: boolean;
  externalReferenceManualCandidatesAvailable?: number;
  externalReferenceManualCandidatesEligible?: number;
  plannedExternalReferenceNote?: string | null;
  externalReferenceDisplayMessage?: string | null;
}

export interface Daily30CloudRunStateStore {
  runs: Record<string, Daily30CloudRunStateEntry>;
  history: Daily30CloudRunStateEntry[];
  updatedAt: string;
  note: string;
}

const EMPTY_STORE: Daily30CloudRunStateStore = {
  runs: {},
  history: [],
  updatedAt: new Date().toISOString(),
  note: 'Daily 30 Cloud Scheduler 実行記録（同日二重実行ガード・失敗ログ）',
};

function normalizeEntry(raw: Partial<Daily30CloudRunStateEntry> & { batchId: string }): Daily30CloudRunStateEntry {
  const finishedAt = raw.finishedAt ?? raw.completedAt ?? new Date().toISOString();
  const startedAt = raw.startedAt ?? finishedAt;
  const totalCollected = raw.totalCollected ?? raw.collected ?? 0;
  const emailFound = raw.emailFound ?? 0;
  const targetEmailFound = raw.targetEmailFound ?? DAILY_30_TARGET_EMAIL_FOUND;
  const reachedTarget = raw.reachedTarget ?? emailFound >= targetEmailFound;
  const mode = raw.mode ?? 'run';
  const status: Daily30CloudRunStatus =
    raw.status ??
    (mode === 'run'
      ? reachedTarget
        ? 'success'
        : 'partial_success'
      : mode === 'failed'
        ? 'failed'
        : 'skipped');
  const normalizedStatus: Daily30CloudRunStatus =
    status === 'success' && !reachedTarget && mode === 'run' ? 'partial_success' : status;
  return {
    runId: raw.runId ?? `${raw.batchId}-legacy`,
    batchId: raw.batchId,
    mode,
    status: normalizedStatus,
    startedAt,
    finishedAt,
    completedAt: finishedAt,
    durationMs: raw.durationMs ?? 0,
    collected: totalCollected,
    targetEmailFound,
    emailFound,
    totalCollected,
    formOnly: raw.formOnly ?? 0,
    noEmail: raw.noEmail ?? 0,
    reachedTarget,
    stoppedReason: raw.stoppedReason,
    duplicates: raw.duplicates ?? 0,
    excluded: raw.excluded ?? 0,
    nextArea: raw.nextArea,
    errorCode: raw.errorCode,
    errorMessageSafe: raw.errorMessageSafe,
    recoveryHint: raw.recoveryHint,
    storageBackend: raw.storageBackend ?? 'local',
    schedulerConfigured: raw.schedulerConfigured ?? false,
    cloudRunServiceUrlConfigured: raw.cloudRunServiceUrlConfigured ?? false,
    gcsBucketConfigured: raw.gcsBucketConfigured ?? false,
    force: raw.force ?? false,
    message: raw.message,
    runStartedAtUtc: raw.runStartedAtUtc ?? startedAt,
    runStartedAtJst: raw.runStartedAtJst,
    collectionProfileId: raw.collectionProfileId,
    collectionProfileName: raw.collectionProfileName,
    collectionMode: raw.collectionMode,
    industryCategory: raw.industryCategory,
    areaStrategy: raw.areaStrategy,
    collectionRunId: raw.collectionRunId ?? raw.runId,
    discoverySource: raw.discoverySource,
    discoverySourceSite: raw.discoverySourceSite,
    discoverySourceLabel: raw.discoverySourceLabel,
    areasUsed: raw.areasUsed,
    scheduleSource: raw.scheduleSource,
    scheduleWarning: raw.scheduleWarning,
    effectiveFromBatchId: raw.effectiveFromBatchId,
    scheduleConsumedAt: raw.scheduleConsumedAt,
    scheduleConsumedBatchId: raw.scheduleConsumedBatchId,
    externalReferenceSupplementAttempted: raw.externalReferenceSupplementAttempted,
    externalReferenceSupplementMode: raw.externalReferenceSupplementMode,
    externalReferenceDiscoverySource: raw.externalReferenceDiscoverySource,
    externalReferenceDiscoverySourceSite: raw.externalReferenceDiscoverySourceSite,
    externalReferencePlanReason: raw.externalReferencePlanReason,
    externalReferenceWarnings: raw.externalReferenceWarnings,
    externalReferenceNetworkAccessPerformed: raw.externalReferenceNetworkAccessPerformed,
    externalReferenceCandidatesFound: raw.externalReferenceCandidatesFound,
    externalReferenceCandidatesAccepted: raw.externalReferenceCandidatesAccepted,
    externalReferenceHumanApprovalRequired: raw.externalReferenceHumanApprovalRequired,
    externalReferenceManualCandidatesAvailable: raw.externalReferenceManualCandidatesAvailable,
    externalReferenceManualCandidatesEligible: raw.externalReferenceManualCandidatesEligible,
    plannedExternalReferenceNote: raw.plannedExternalReferenceNote,
    externalReferenceDisplayMessage: raw.externalReferenceDisplayMessage,
  };
}

export async function loadDaily30CloudRunState(): Promise<Daily30CloudRunStateStore> {
  try {
    const raw = await readJsonDocument(DAILY30_CLOUD_RUN_STATE_JSON);
    if (!raw) return { ...EMPTY_STORE, history: [] };
    const parsed = JSON.parse(raw) as Daily30CloudRunStateStore;
    const runs: Record<string, Daily30CloudRunStateEntry> = {};
    for (const [key, entry] of Object.entries(parsed.runs ?? {})) {
      runs[key] = normalizeEntry({ ...entry, batchId: entry.batchId ?? key });
    }
    const history = (parsed.history ?? Object.values(runs)).map((e) =>
      normalizeEntry(e)
    );
    return {
      ...EMPTY_STORE,
      ...parsed,
      runs,
      history: history.sort((a, b) => b.finishedAt.localeCompare(a.finishedAt)),
    };
  } catch {
    return { ...EMPTY_STORE, history: [] };
  }
}

export async function saveDaily30CloudRunState(
  store: Daily30CloudRunStateStore
): Promise<void> {
  const payload: Daily30CloudRunStateStore = {
    ...store,
    updatedAt: new Date().toISOString(),
  };
  await writeJsonDocument(DAILY30_CLOUD_RUN_STATE_JSON, JSON.stringify(payload, null, 2));
}

export async function getCloudRunEntryForBatch(
  batchId: string
): Promise<Daily30CloudRunStateEntry | null> {
  const store = await loadDaily30CloudRunState();
  return store.runs[batchId] ?? null;
}

/** 同日の本番収集（mode=run, success または partial_success）が記録済みか */
export async function isBatchCloudRunCompleted(batchId: string): Promise<boolean> {
  const entry = await getCloudRunEntryForBatch(batchId);
  return (
    entry !== null &&
    entry.mode === 'run' &&
    (entry.status === 'success' || entry.status === 'partial_success')
  );
}

export function createCloudRunId(batchId: string): string {
  return `${batchId}-${Date.now()}`;
}

export async function recordCloudRunEntry(entry: Daily30CloudRunStateEntry): Promise<void> {
  const store = await loadDaily30CloudRunState();
  store.history = [entry, ...store.history.filter((h) => h.runId !== entry.runId)].slice(0, 100);
  if (
    (entry.status === 'success' || entry.status === 'partial_success') &&
    entry.mode === 'run'
  ) {
    store.runs[entry.batchId] = entry;
  }
  await saveDaily30CloudRunState(store);
}

/** @deprecated use recordCloudRunEntry */
export async function recordCloudRunCompleted(
  entry: Partial<Daily30CloudRunStateEntry> & { batchId: string }
): Promise<void> {
  await recordCloudRunEntry(normalizeEntry(entry));
}

export async function getLatestCloudRunEntry(): Promise<Daily30CloudRunStateEntry | null> {
  const store = await loadDaily30CloudRunState();
  if (store.history.length > 0) return store.history[0] ?? null;
  const entries = Object.values(store.runs);
  if (entries.length === 0) return null;
  return [...entries].sort((a, b) => b.finishedAt.localeCompare(a.finishedAt))[0] ?? null;
}
