import type { Daily30RegionGroup } from './daily30CandidateStatus.js';

export interface Daily30AreaSpec {
  prefecture: string;
  regionGroup: Daily30RegionGroup;
  collectionPriority: number;
}

/** エリア拡大順: 宮城 → 福島 → 北関東（茨城 → 栃木 → 群馬） */
export const DAILY_30_AREA_EXPANSION: readonly Daily30AreaSpec[] = [
  { prefecture: '宮城県', regionGroup: '宮城', collectionPriority: 1 },
  { prefecture: '福島県', regionGroup: '福島', collectionPriority: 2 },
  { prefecture: '茨城県', regionGroup: '北関東', collectionPriority: 3 },
  { prefecture: '栃木県', regionGroup: '北関東', collectionPriority: 4 },
  { prefecture: '群馬県', regionGroup: '北関東', collectionPriority: 5 },
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
