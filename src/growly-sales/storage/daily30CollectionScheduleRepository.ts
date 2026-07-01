import { DAILY30_COLLECTION_SCHEDULE_JSON } from './jsonDocumentNames.js';
import { readJsonDocument, writeJsonDocument } from './jsonDocumentStorage.js';
import {
  buildDefaultDaily30CollectionScheduleStore,
  resolveDefaultActiveCollectionProfile,
  type Daily30CollectionScheduleStore,
} from './daily30CollectionScheduleTypes.js';
import type { Daily30CollectionProfileSnapshot } from '../candidates/daily30CollectionProfile.js';

const EMPTY_NOTE = 'Daily 30 収集スケジュール（次回設定・おまかせ継続カーソル）';

function normalizeStore(raw: Partial<Daily30CollectionScheduleStore> | null): Daily30CollectionScheduleStore {
  const defaults = buildDefaultDaily30CollectionScheduleStore();
  if (!raw) return defaults;
  const activeProfile: Daily30CollectionProfileSnapshot = {
    ...defaults.activeProfile,
    ...(raw.activeProfile ?? {}),
  };
  return {
    ...defaults,
    ...raw,
    activeProfile,
    autoContinue: {
      ...defaults.autoContinue,
      ...(raw.autoContinue ?? {}),
      lastCollectionProfileId:
        raw.autoContinue?.lastCollectionProfileId ?? activeProfile.collectionProfileId,
      areaStrategy: raw.autoContinue?.areaStrategy ?? activeProfile.areaStrategy,
    },
    nextProfileOverride: raw.nextProfileOverride ?? null,
    oneDayOverride: raw.oneDayOverride ?? null,
    note: raw.note?.trim() || EMPTY_NOTE,
  };
}

export async function loadDaily30CollectionSchedule(): Promise<Daily30CollectionScheduleStore> {
  try {
    const raw = await readJsonDocument(DAILY30_COLLECTION_SCHEDULE_JSON);
    if (!raw) return buildDefaultDaily30CollectionScheduleStore();
    const parsed = JSON.parse(raw) as Partial<Daily30CollectionScheduleStore>;
    return normalizeStore(parsed);
  } catch {
    return buildDefaultDaily30CollectionScheduleStore();
  }
}

export async function saveDaily30CollectionSchedule(
  store: Daily30CollectionScheduleStore
): Promise<void> {
  const payload: Daily30CollectionScheduleStore = {
    ...store,
    updatedAt: new Date().toISOString(),
    note: store.note?.trim() || EMPTY_NOTE,
  };
  await writeJsonDocument(DAILY30_COLLECTION_SCHEDULE_JSON, JSON.stringify(payload, null, 2));
}

/** activeProfile を返す。ファイル未存在時はデフォルトにフォールバック */
export async function loadActiveDaily30CollectionProfile(): Promise<Daily30CollectionProfileSnapshot> {
  const schedule = await loadDaily30CollectionSchedule();
  return schedule.activeProfile ?? resolveDefaultActiveCollectionProfile();
}
