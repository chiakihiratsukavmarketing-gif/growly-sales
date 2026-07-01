import type { Daily30AreaSpec } from './daily30AreaConfig.js';
import { filterDaily30ExecutionAreas } from './daily30AreaConfig.js';
import type {
  Daily30CollectionProfileSnapshot,
  Daily30AreaStrategy,
  Daily30DiscoverySource,
} from './daily30CollectionProfile.js';
import { defaultDaily30CollectionProfileSnapshot } from './daily30CollectionProfile.js';
import type { Daily30RegionGroup } from './daily30CandidateStatus.js';
import {
  DAILY_30_NATIONWIDE_PREFECTURES_ORDERED,
  isDaily30PrefectureExcluded,
} from './daily30PrefectureRegistry.js';
import type { Daily30CollectionProfileSnapshot } from './daily30CollectionProfile.js';
import type { Daily30CloudRunStateEntry } from '../storage/daily30CloudRunState.js';
import { buildDefaultDaily30CollectionScheduleStore } from '../storage/daily30CollectionScheduleTypes.js';

export type Daily30ScheduleSource =
  | 'active_profile'
  | 'next_profile_override'
  | 'one_day_override'
  | 'default_fallback';

export type Daily30ScheduleWarning =
  | 'schedule_load_failed'
  | 'schedule_profile_incomplete'
  | 'external_reference_collection_not_yet_implemented';

const PRIORITY_MFY_THEN_NORTH_KANTO = [
  '宮城県',
  '福島県',
  '山形県',
  '茨城県',
  '栃木県',
  '群馬県',
] as const;

const NORTH_KANTO_THEN_MFY = ['茨城県', '栃木県', '群馬県', '宮城県', '福島県', '山形県'] as const;

const EXTERNAL_REFERENCE_DISCOVERY_SOURCES = new Set<Daily30DiscoverySource>([
  'job_site_reference',
  'rakuten_marketplace_reference',
  'portal_site_reference',
  'industry_directory_reference',
  'manual_url',
]);

export function isExternalReferenceDiscoverySource(
  source: Daily30DiscoverySource | null | undefined
): boolean {
  return Boolean(source && EXTERNAL_REFERENCE_DISCOVERY_SOURCES.has(source));
}

export function formatScheduleWarningLabel(warning: Daily30ScheduleWarning): string {
  switch (warning) {
    case 'schedule_load_failed':
      return '収集スケジュールの読み込みに失敗したため、デフォルト設定で実行します';
    case 'schedule_profile_incomplete':
      return '収集スケジュールが不完全なため、デフォルト設定で実行します';
    case 'external_reference_collection_not_yet_implemented':
      return '求人サイト参考は設定済みですが、外部掲載サイト探索は Phase 40.6 で実装予定です（実行は Google Places / 公式サイト検索）';
    default:
      return warning;
  }
}

export function formatScheduleSourceLabel(source: Daily30ScheduleSource): string {
  switch (source) {
    case 'active_profile':
      return 'active profile';
    case 'next_profile_override':
      return 'next profile override';
    case 'one_day_override':
      return 'one day override';
    case 'default_fallback':
      return 'default fallback';
    default:
      return source;
  }
}

function resolveRegionGroupForPrefecture(prefecture: string): Daily30RegionGroup {
  if (prefecture === '宮城県') return '宮城';
  if (prefecture === '福島県') return '福島';
  if (prefecture === '山形県') return '山形';
  return '北関東';
}

function uniquePrefectureOrder(primary: readonly string[], appendNationwide = true): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const prefecture of primary) {
    if (seen.has(prefecture) || isDaily30PrefectureExcluded(prefecture)) continue;
    seen.add(prefecture);
    out.push(prefecture);
  }
  if (!appendNationwide) return out;
  for (const prefecture of DAILY_30_NATIONWIDE_PREFECTURES_ORDERED) {
    if (seen.has(prefecture)) continue;
    seen.add(prefecture);
    out.push(prefecture);
  }
  return out;
}

export function buildPrefectureOrderForAreaStrategy(
  areaStrategy: Daily30AreaStrategy
): string[] {
  switch (areaStrategy) {
    case 'priority_miyagi_fukushima_yamagata':
      return uniquePrefectureOrder(PRIORITY_MFY_THEN_NORTH_KANTO);
    case 'north_kanto':
      return uniquePrefectureOrder(NORTH_KANTO_THEN_MFY);
    case 'nationwide_excluding_tokyo':
      return uniquePrefectureOrder(DAILY_30_NATIONWIDE_PREFECTURES_ORDERED, false);
    default:
      return uniquePrefectureOrder(PRIORITY_MFY_THEN_NORTH_KANTO);
  }
}

export function resolveCollectionAreasForProfile(
  profile: Daily30CollectionProfileSnapshot,
  autoContinue: Daily30CollectionScheduleStore['autoContinue']
): Daily30AreaSpec[] {
  const order = buildPrefectureOrderForAreaStrategy(profile.areaStrategy);
  const startIndex = Math.max(0, autoContinue.areaQueuePosition ?? profile.areaQueuePosition ?? 0);
  const sliced = order.slice(startIndex);
  return filterDaily30ExecutionAreas(
    sliced.map((prefecture, idx) => ({
      prefecture,
      regionGroup: resolveRegionGroupForPrefecture(prefecture),
      collectionPriority: startIndex + idx + 1,
    }))
  );
}

function collectWarningsForProfile(
  profile: Daily30CollectionProfileSnapshot,
  extra: Daily30ScheduleWarning[] = []
): Daily30ScheduleWarning[] {
  const warnings = [...extra];
  if (isExternalReferenceDiscoverySource(profile.discoverySource)) {
    warnings.push('external_reference_collection_not_yet_implemented');
  }
  return [...new Set(warnings)];
}

function isProfileIncomplete(profile: Daily30CollectionProfileSnapshot | null | undefined): boolean {
  if (!profile?.collectionProfileId?.trim()) return true;
  if (!profile.areaStrategy) return true;
  return false;
}

export interface ResolvedDaily30CollectionRunContext {
  profile: Daily30CollectionProfileSnapshot;
  scheduleSource: Daily30ScheduleSource;
  effectiveFromBatchId: string | null;
  warnings: Daily30ScheduleWarning[];
  wouldConsumeOverride: boolean;
  plannedAreas: Daily30AreaSpec[];
  plannedAreaPrefectures: string[];
  scheduleLoaded: boolean;
}

export function resolveEffectiveCollectionProfileForBatch(
  store: Daily30CollectionScheduleStore | null,
  batchId: string,
  options?: { loadFailed?: boolean }
): ResolvedDaily30CollectionRunContext {
  const warnings: Daily30ScheduleWarning[] = [];
  if (options?.loadFailed || !store) {
    const profile = defaultDaily30CollectionProfileSnapshot();
    const plannedAreas = resolveCollectionAreasForProfile(
      profile,
      buildDefaultDaily30CollectionScheduleStore().autoContinue
    );
    return {
      profile,
      scheduleSource: 'default_fallback',
      effectiveFromBatchId: null,
      warnings: collectWarningsForProfile(profile, ['schedule_load_failed']),
      wouldConsumeOverride: false,
      plannedAreas,
      plannedAreaPrefectures: plannedAreas.map((a) => a.prefecture),
      scheduleLoaded: false,
    };
  }

  const normalized = store;

  if (normalized.oneDayOverride?.effectiveFromBatchId === batchId) {
    const profile = normalized.oneDayOverride.profile;
    const plannedAreas = resolveCollectionAreasForProfile(profile, normalized.autoContinue);
    return {
      profile,
      scheduleSource: 'one_day_override',
      effectiveFromBatchId: normalized.oneDayOverride.effectiveFromBatchId,
      warnings: collectWarningsForProfile(profile),
      wouldConsumeOverride: true,
      plannedAreas,
      plannedAreaPrefectures: plannedAreas.map((a) => a.prefecture),
      scheduleLoaded: true,
    };
  }

  if (
    normalized.nextProfileOverride &&
    batchId >= normalized.nextProfileOverride.effectiveFromBatchId
  ) {
    const profile: Daily30CollectionProfileSnapshot = {
      ...normalized.nextProfileOverride.profile,
      collectionMode: 'user_selected',
    };
    const plannedAreas = resolveCollectionAreasForProfile(profile, normalized.autoContinue);
    return {
      profile,
      scheduleSource: 'next_profile_override',
      effectiveFromBatchId: normalized.nextProfileOverride.effectiveFromBatchId,
      warnings: collectWarningsForProfile(profile),
      wouldConsumeOverride: true,
      plannedAreas,
      plannedAreaPrefectures: plannedAreas.map((a) => a.prefecture),
      scheduleLoaded: true,
    };
  }

  if (isProfileIncomplete(normalized.activeProfile)) {
    const profile = defaultDaily30CollectionProfileSnapshot();
    const plannedAreas = resolveCollectionAreasForProfile(profile, normalized.autoContinue);
    return {
      profile,
      scheduleSource: 'default_fallback',
      effectiveFromBatchId: null,
      warnings: collectWarningsForProfile(profile, ['schedule_profile_incomplete']),
      wouldConsumeOverride: false,
      plannedAreas,
      plannedAreaPrefectures: plannedAreas.map((a) => a.prefecture),
      scheduleLoaded: true,
    };
  }

  const profile = normalized.activeProfile;
  const plannedAreas = resolveCollectionAreasForProfile(profile, normalized.autoContinue);
  return {
    profile,
    scheduleSource: 'active_profile',
    effectiveFromBatchId: null,
    warnings: collectWarningsForProfile(profile),
    wouldConsumeOverride: false,
    plannedAreas,
    plannedAreaPrefectures: plannedAreas.map((a) => a.prefecture),
    scheduleLoaded: true,
  };
}

export interface ConsumeScheduleAfterRunInput {
  batchId: string;
  scheduleSource: Daily30ScheduleSource;
  areasAttempted: number;
  runStatus?: string;
}

/** 本番 run 後に schedule を更新（dryRun では呼ばない） */
export function consumeScheduleAfterRun(
  store: Daily30CollectionScheduleStore,
  input: ConsumeScheduleAfterRunInput
): Daily30CollectionScheduleStore {
  const now = new Date().toISOString();
  let next: Daily30CollectionScheduleStore = {
    ...store,
    updatedAt: now,
    updatedBy: 'cloud_run',
  };

  if (
    next.oneDayOverride &&
    input.batchId > next.oneDayOverride.effectiveFromBatchId
  ) {
    next = { ...next, oneDayOverride: null };
  }

  if (input.scheduleSource === 'one_day_override') {
    next = {
      ...next,
      oneDayOverride: null,
      autoContinue: {
        ...next.autoContinue,
        areaQueuePosition: (next.autoContinue.areaQueuePosition ?? 0) + input.areasAttempted,
        lastCompletedBatchId: input.batchId,
        lastCollectionProfileId: next.activeProfile.collectionProfileId,
      },
    };
    return next;
  }

  if (input.scheduleSource === 'next_profile_override' && store.nextProfileOverride) {
    const promoted: Daily30CollectionProfileSnapshot = {
      ...store.nextProfileOverride.profile,
      collectionMode: 'user_selected',
    };
    return {
      ...next,
      activeProfile: promoted,
      nextProfileOverride: null,
      autoContinue: {
        ...next.autoContinue,
        areaStrategy: promoted.areaStrategy,
        lastCollectionProfileId: promoted.collectionProfileId,
        areaQueuePosition: (next.autoContinue.areaQueuePosition ?? 0) + input.areasAttempted,
        lastCompletedBatchId: input.batchId,
      },
    };
  }

  return {
    ...next,
    autoContinue: {
      ...next.autoContinue,
      areaStrategy: next.activeProfile.areaStrategy,
      lastCollectionProfileId: next.activeProfile.collectionProfileId,
      areaQueuePosition: (next.autoContinue.areaQueuePosition ?? 0) + input.areasAttempted,
      lastCompletedBatchId: input.batchId,
    },
  };
}

/** Cloud Run state entry から UI 表示用 context を復元（直近実行の表示用） */
export function buildRunContextFromCloudStateEntry(
  entry: Daily30CloudRunStateEntry | null | undefined
): ResolvedDaily30CollectionRunContext | null {
  if (!entry?.collectionProfileId) return null;
  const profile: Daily30CollectionProfileSnapshot = {
    collectionProfileId: entry.collectionProfileId,
    collectionProfileName: entry.collectionProfileName ?? entry.collectionProfileId,
    collectionMode: entry.collectionMode ?? 'auto_continue',
    industryCategory: entry.industryCategory ?? 'housing',
    areaStrategy: entry.areaStrategy ?? 'priority_miyagi_fukushima_yamagata',
    areaQueuePosition: 0,
    discoverySource: entry.discoverySource ?? 'google_places',
    discoverySourceSite: entry.discoverySourceSite ?? null,
    discoverySourceLabel: entry.discoverySourceLabel ?? null,
    discoverySourceUrl: null,
    sourceComplianceStatus: null,
    sourceComplianceNote: null,
    collectionRunId: entry.collectionRunId ?? entry.runId,
  };
  const warnings: Daily30ScheduleWarning[] = [];
  if (entry.scheduleWarning?.includes('Phase 40.6')) {
    warnings.push('external_reference_collection_not_yet_implemented');
  }
  return {
    profile,
    scheduleSource: entry.scheduleSource ?? 'active_profile',
    effectiveFromBatchId: entry.effectiveFromBatchId ?? null,
    warnings,
    wouldConsumeOverride: Boolean(entry.scheduleConsumedAt),
    plannedAreas: [],
    plannedAreaPrefectures: entry.areasUsed ?? [],
    scheduleLoaded: true,
  };
}
