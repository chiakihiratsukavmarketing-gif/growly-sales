import type { TargetProfile } from '../config/targetProfile.js';

const PHASE17_SEED_AREAS = ['宮城県', '仙台市'] as const;
const PHASE17_SEED_INDUSTRIES = ['工務店', '注文住宅', 'リフォーム会社', '住宅会社'] as const;

function uniqueQueries(queries: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const q of queries) {
    const trimmed = q.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

/**
 * targetProfile に基づき、外部API検索用クエリを生成する。
 * 大量収集を避けるため、件数は意図的に限定する。
 */
export function buildLeadSearchQueries(profile: TargetProfile, maxQueries = 12): string[] {
  const areas = uniqueQueries([...PHASE17_SEED_AREAS, ...profile.defaultAreas]);
  const industries = uniqueQueries([...PHASE17_SEED_INDUSTRIES, ...profile.industries]);

  const generated: string[] = [];

  for (const area of areas) {
    for (const industry of industries) {
      generated.push(`${area} ${industry}`);
      if (generated.length >= maxQueries) {
        return uniqueQueries([...profile.searchKeywords, ...generated]).slice(0, maxQueries);
      }
    }
  }

  return uniqueQueries([...profile.searchKeywords, ...generated]).slice(0, maxQueries);
}

export function describeSearchQueryPlan(profile: TargetProfile): {
  queries: string[];
  maxResultsPerQuery: number;
  note: string;
} {
  return {
    queries: buildLeadSearchQueries(profile),
    maxResultsPerQuery: 5,
    note: '外部APIは営業候補取得のみ。送信・Lead自動化とは無関係。Google Maps画面スクレイピングは行いません。',
  };
}
