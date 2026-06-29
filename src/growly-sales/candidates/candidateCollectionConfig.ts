/** Phase 21: 30件候補収集の目標・制限 */

export const CANDIDATE_COLLECTION_TARGET = 30;

export const CANDIDATE_FETCH_MAX_QUERIES = 8;

export const CANDIDATE_MAX_RESULTS_PER_QUERY = 5;

export const CANDIDATE_TARGET_AREAS = [
  '宮城県',
  '仙台市',
] as const;

export const CANDIDATE_TARGET_CATEGORIES = [
  '住宅会社',
  '工務店',
  'リフォーム会社',
  '注文住宅',
] as const;

export const CANDIDATE_TARGET_SIGNALS = [
  '採用ページあり',
  '施工事例あり',
] as const;

export const FETCH_CANDIDATES_PROMPT =
  '続行するには FETCH_CANDIDATES と入力してください。';
