import type { Daily30CollectionScheduleStore } from '../storage/daily30CollectionScheduleTypes.js';
import type { Daily30ScheduleUpdateMode } from '../candidates/updateDaily30CollectionSchedule.js';
import type {
  Daily30AreaStrategy,
  Daily30DiscoverySource,
  Daily30DiscoverySourceSite,
  Daily30IndustryCategory,
} from '../candidates/daily30CollectionProfile.js';
import { readApiError } from './apiError.js';

const API_BASE = '';

export interface Daily30CollectionScheduleResponse {
  schedule: Daily30CollectionScheduleStore;
  nextEffectiveBatchId: string;
  resolvedForToday?: import('../candidates/resolveDaily30CollectionSchedule.js').ResolvedDaily30CollectionRunContext;
  resolvedForTomorrow?: import('../candidates/resolveDaily30CollectionSchedule.js').ResolvedDaily30CollectionRunContext;
  generatedAt: string;
  note: string;
}

export interface Daily30CollectionScheduleUpdatePayload {
  mode: Daily30ScheduleUpdateMode;
  profile?: {
    collectionProfileName?: string;
    industryCategory?: Daily30IndustryCategory;
    areaStrategy?: Daily30AreaStrategy;
    discoverySource?: Daily30DiscoverySource;
    discoverySourceSite?: Daily30DiscoverySourceSite | 'none' | null;
  };
  effectiveFromBatchId?: string;
}

export interface Daily30CollectionScheduleUpdateResponse {
  schedule: Daily30CollectionScheduleStore;
  message: string;
  generatedAt: string;
}

export async function fetchDaily30CollectionSchedule(): Promise<Daily30CollectionScheduleResponse> {
  const res = await fetch(`${API_BASE}/api/daily30-collection-schedule`);
  if (!res.ok) {
    throw new Error(
      await readApiError(res, 'GET /api/daily30-collection-schedule', '収集スケジュールの取得に失敗しました')
    );
  }
  return (await res.json()) as Daily30CollectionScheduleResponse;
}

export async function saveDaily30CollectionSchedule(
  payload: Daily30CollectionScheduleUpdatePayload
): Promise<Daily30CollectionScheduleUpdateResponse> {
  const res = await fetch(`${API_BASE}/api/daily30-collection-schedule`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(
      await readApiError(res, 'POST /api/daily30-collection-schedule', '収集スケジュールの保存に失敗しました')
    );
  }
  return (await res.json()) as Daily30CollectionScheduleUpdateResponse;
}
