import type {
  Daily30CollectionProfileSnapshot,
  Daily30CollectionMode,
  Daily30DiscoverySource,
  Daily30DiscoverySourceSite,
  Daily30IndustryCategory,
  Daily30AreaStrategy,
} from './daily30CollectionProfile.js';
import { defaultDaily30CollectionProfileSnapshot } from './daily30CollectionProfile.js';
import {
  DISCOVERY_SOURCE_LABELS,
  DISCOVERY_SOURCE_SITE_LABELS,
  INDUSTRY_CATEGORY_LABELS,
  AREA_STRATEGY_LABELS,
} from './daily30CollectionScheduleLabels.js';
import { getTomorrowBatchIdJst } from './daily30AreaConfig.js';
import type {
  Daily30CollectionScheduleOverride,
  Daily30CollectionScheduleStore,
} from '../storage/daily30CollectionScheduleTypes.js';
import { buildDefaultDaily30CollectionScheduleStore } from '../storage/daily30CollectionScheduleTypes.js';

export type Daily30ScheduleUpdateMode =
  | 'auto_continue'
  | 'one_day_override'
  | 'user_selected'
  | 'reset_to_auto';

export interface Daily30ScheduleProfileInput {
  collectionProfileName?: string;
  industryCategory?: Daily30IndustryCategory;
  areaStrategy?: Daily30AreaStrategy;
  discoverySource?: Daily30DiscoverySource;
  /** UI から `none` を送った場合は null に正規化 */
  discoverySourceSite?: Daily30DiscoverySourceSite | 'none' | null;
}

export interface Daily30ScheduleUpdateInput {
  mode: Daily30ScheduleUpdateMode;
  profile?: Daily30ScheduleProfileInput;
  effectiveFromBatchId?: string | null;
}

function resolveDiscoverySourceSite(
  site: Daily30ScheduleProfileInput['discoverySourceSite']
): Daily30DiscoverySourceSite | null {
  if (!site || site === 'none') return null;
  return site;
}

function buildDiscoverySourceLabel(
  discoverySource: Daily30DiscoverySource,
  discoverySourceSite: Daily30DiscoverySourceSite | null
): string {
  if (discoverySource === 'job_site_reference' && discoverySourceSite) {
    const siteLabel = DISCOVERY_SOURCE_SITE_LABELS[discoverySourceSite] ?? discoverySourceSite;
    return `求人サイト / ${siteLabel}`;
  }
  return DISCOVERY_SOURCE_LABELS[discoverySource] ?? discoverySource;
}

export function buildCollectionProfileNameFromInput(
  input: Daily30ScheduleProfileInput,
  collectionMode: Daily30CollectionMode
): string {
  if (input.collectionProfileName?.trim()) return input.collectionProfileName.trim();
  const industry = INDUSTRY_CATEGORY_LABELS[input.industryCategory ?? 'housing'];
  const area = AREA_STRATEGY_LABELS[input.areaStrategy ?? 'priority_miyagi_fukushima_yamagata'];
  const discoverySource = input.discoverySource ?? 'google_places';
  const site = resolveDiscoverySourceSite(input.discoverySourceSite);
  const sourceLabel = buildDiscoverySourceLabel(discoverySource, site);
  if (collectionMode === 'auto_continue') return '住宅系おまかせ継続';
  return `${sourceLabel} / ${industry} / ${area}`;
}

export function buildProfileSnapshotFromInput(
  input: Daily30ScheduleProfileInput,
  collectionMode: Daily30CollectionMode
): Daily30CollectionProfileSnapshot {
  const defaults = defaultDaily30CollectionProfileSnapshot();
  const industryCategory = input.industryCategory ?? defaults.industryCategory;
  const areaStrategy = input.areaStrategy ?? defaults.areaStrategy;
  const discoverySource = input.discoverySource ?? defaults.discoverySource;
  const discoverySourceSite = resolveDiscoverySourceSite(input.discoverySourceSite);
  const collectionProfileName = buildCollectionProfileNameFromInput(input, collectionMode);
  const collectionProfileId =
    collectionMode === 'auto_continue'
      ? defaults.collectionProfileId
      : `daily30-${industryCategory}-${collectionMode}`;

  return {
    collectionProfileId,
    collectionProfileName,
    collectionMode,
    industryCategory,
    areaStrategy,
    areaQueuePosition: 0,
    discoverySource,
    discoverySourceSite,
    discoverySourceLabel: buildDiscoverySourceLabel(discoverySource, discoverySourceSite),
    discoverySourceUrl: null,
    sourceComplianceStatus: null,
    sourceComplianceNote: null,
    collectionRunId: null,
  };
}

function buildOverride(
  profile: Daily30CollectionProfileSnapshot,
  effectiveFromBatchId: string,
  expiresBatchId?: string | null
): Daily30CollectionScheduleOverride {
  const now = new Date().toISOString();
  return {
    effectiveFromBatchId,
    expiresBatchId: expiresBatchId ?? null,
    profile,
    setAt: now,
    setBy: 'human_ui',
  };
}

export function resolveScheduleEffectiveBatchId(
  input: Daily30ScheduleUpdateInput,
  d = new Date()
): string {
  const explicit = input.effectiveFromBatchId?.trim();
  if (explicit) return explicit;
  return getTomorrowBatchIdJst(d);
}

/** schedule JSON を UI/API 入力に基づき更新（実行時消費は resolveDaily30CollectionSchedule） */
export function applyDaily30CollectionScheduleUpdate(
  store: Daily30CollectionScheduleStore,
  input: Daily30ScheduleUpdateInput,
  now = new Date()
): Daily30CollectionScheduleStore {
  const updatedAt = now.toISOString();
  const effectiveBatchId = resolveScheduleEffectiveBatchId(input, now);

  if (input.mode === 'reset_to_auto' || input.mode === 'auto_continue') {
    const activeProfile = defaultDaily30CollectionProfileSnapshot();
    return {
      ...buildDefaultDaily30CollectionScheduleStore(updatedAt),
      autoContinue: {
        ...store.autoContinue,
        areaStrategy: activeProfile.areaStrategy,
        lastCollectionProfileId: activeProfile.collectionProfileId,
      },
      activeProfile,
      nextProfileOverride: null,
      oneDayOverride: null,
      updatedBy: 'human_ui',
    };
  }

  if (input.mode === 'one_day_override') {
    const profile = buildProfileSnapshotFromInput(input.profile ?? {}, 'one_day_override');
    return {
      ...store,
      updatedAt,
      updatedBy: 'human_ui',
      oneDayOverride: buildOverride(profile, effectiveBatchId, effectiveBatchId),
    };
  }

  if (input.mode === 'user_selected') {
    const profile = buildProfileSnapshotFromInput(input.profile ?? {}, 'user_selected');
    return {
      ...store,
      updatedAt,
      updatedBy: 'human_ui',
      nextProfileOverride: buildOverride(profile, effectiveBatchId),
    };
  }

  return store;
}
