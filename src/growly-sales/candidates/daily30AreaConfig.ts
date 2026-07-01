import type { Daily30RegionGroup } from './daily30CandidateStatus.js';
import { isDaily30PrefectureExcluded } from './daily30PrefectureRegistry.js';

export interface Daily30AreaSpec {
  prefecture: string;
  regionGroup: Daily30RegionGroup;
  collectionPriority: number;
}

/** エリア拡大順: 宮城 → 福島 → 山形 → 北関東（茨城 → 栃木 → 群馬） */
export const DAILY_30_AREA_EXPANSION: readonly Daily30AreaSpec[] = [
  { prefecture: '宮城県', regionGroup: '宮城', collectionPriority: 1 },
  { prefecture: '福島県', regionGroup: '福島', collectionPriority: 2 },
  { prefecture: '山形県', regionGroup: '山形', collectionPriority: 3 },
  { prefecture: '茨城県', regionGroup: '北関東', collectionPriority: 4 },
  { prefecture: '栃木県', regionGroup: '北関東', collectionPriority: 5 },
  { prefecture: '群馬県', regionGroup: '北関東', collectionPriority: 6 },
];

export const DAILY_30_TARGET_INDUSTRIES = [
  '住宅会社',
  '工務店',
  'リフォーム会社',
  '注文住宅',
] as const;

export function buildDaily30QueriesForArea(area: Daily30AreaSpec, maxQueries = 4): string[] {
  const queries: string[] = [];
  for (const industry of DAILY_30_TARGET_INDUSTRIES) {
    queries.push(`${area.prefecture} ${industry}`);
    if (queries.length >= maxQueries) break;
  }
  return queries;
}

export function todayBatchId(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

/**
 * JST基準の YYYY-MM-DD 文字列。
 * - Cloud Scheduler は JST 9:00 実行のため、Daily30 の batchId は JST を正とする
 * - 既存 UTC batchId のデータはそのまま残る（後方互換）
 */
export function getJstDateString(d = new Date()): string {
  // 端末の locale / TZ に依存せず、UTC+9 の日付に変換して ISO を切る。
  const JST_OFFSET_MIN = 9 * 60;
  const utcMs = d.getTime();
  const jstMs = utcMs + JST_OFFSET_MIN * 60 * 1000;
  return new Date(jstMs).toISOString().slice(0, 10);
}

export function todayBatchIdJst(d = new Date()): string {
  return getJstDateString(d);
}

/** 明示 batchId があればそれを使い、なければ JST 当日 */
export function resolveDaily30BatchIdJst(explicit?: string | null, d = new Date()): string {
  const trimmed = explicit?.trim();
  return trimmed || todayBatchIdJst(d);
}

/** 翌日 JST の batchId（次回収集反映日のデフォルト） */
export function getTomorrowBatchIdJst(d = new Date()): string {
  return getJstDateString(new Date(d.getTime() + 24 * 60 * 60 * 1000));
}

/** 実行直前の二重ガード: 東京都など除外都道府県を取り除く */
export function filterDaily30ExecutionAreas(
  areas: readonly Daily30AreaSpec[]
): Daily30AreaSpec[] {
  return areas.filter((area) => !isDaily30PrefectureExcluded(area.prefecture));
}
