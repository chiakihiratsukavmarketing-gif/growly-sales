/** Daily 30 候補を人間が除外する際の理由候補 */
export const DAILY_30_EXCLUDE_REASONS = [
  '既存Lead重複',
  'メール不正',
  '対象外業種',
  '公式サイト不明',
  '送信対象外',
  'その他',
] as const;

export type Daily30ExcludeReason = (typeof DAILY_30_EXCLUDE_REASONS)[number];

export const DAILY_30_EXCLUDE_DEFAULT_REASON: Daily30ExcludeReason = '既存Lead重複';
