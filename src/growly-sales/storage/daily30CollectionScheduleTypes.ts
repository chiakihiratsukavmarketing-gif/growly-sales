import type {
  Daily30CollectionProfileSnapshot,
  Daily30CollectionMode,
} from '../candidates/daily30CollectionProfile.js';
import { defaultDaily30CollectionProfileSnapshot } from '../candidates/daily30CollectionProfile.js';

export type Daily30ScheduleUpdatedBy = 'system' | 'human_ui' | 'human_cli' | 'cloud_run';

export interface Daily30CollectionScheduleOverride {
  /** 適用開始 batchId（JST YYYY-MM-DD） */
  effectiveFromBatchId: string;
  /** one_day_override の場合の失効 batchId（含む日まで有効） */
  expiresBatchId?: string | null;
  profile: Daily30CollectionProfileSnapshot;
  setAt: string;
  setBy: Daily30ScheduleUpdatedBy;
}

export interface Daily30CollectionScheduleStore {
  updatedAt: string;
  updatedBy: Daily30ScheduleUpdatedBy;
  note: string;
  /** おまかせ継続のカーソル（Phase 40.5 で消費） */
  autoContinue: {
    areaStrategy: Daily30CollectionProfileSnapshot['areaStrategy'];
    areaQueuePosition: number;
    lastCompletedBatchId: string | null;
    lastCollectionProfileId: string;
  };
  /** 現在有効な active profile（UI表示・監査用） */
  activeProfile: Daily30CollectionProfileSnapshot;
  /** 翌日以降の override（Phase 40.3 で UI から設定） */
  nextProfileOverride: Daily30CollectionScheduleOverride | null;
  /** 1日だけの override */
  oneDayOverride: Daily30CollectionScheduleOverride | null;
}

export function buildDefaultDaily30CollectionScheduleStore(
  now = new Date().toISOString()
): Daily30CollectionScheduleStore {
  const activeProfile = defaultDaily30CollectionProfileSnapshot();
  return {
    updatedAt: now,
    updatedBy: 'system',
    note: 'Daily 30 収集スケジュール（次回設定・おまかせ継続カーソル）',
    autoContinue: {
      areaStrategy: activeProfile.areaStrategy,
      areaQueuePosition: 0,
      lastCompletedBatchId: null,
      lastCollectionProfileId: activeProfile.collectionProfileId,
    },
    activeProfile,
    nextProfileOverride: null,
    oneDayOverride: null,
  };
}

/** schedule が無い / 壊れている場合のフォールバック active profile */
export function resolveDefaultActiveCollectionProfile(): Daily30CollectionProfileSnapshot {
  return defaultDaily30CollectionProfileSnapshot();
}

export function resolveCollectionModeFromSchedule(
  store: Daily30CollectionScheduleStore
): Daily30CollectionMode {
  return store.activeProfile.collectionMode ?? 'auto_continue';
}
