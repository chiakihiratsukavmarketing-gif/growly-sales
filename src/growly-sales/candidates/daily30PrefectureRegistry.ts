/**
 * Daily 30 都道府県レジストリ（全国展開・漏れ防止）。
 *
 * - 東京都は対象外（必須）
 * - 順序は運用上の探索キュー順（要件の全国順序案に合わせる）
 * - 将来の areaStrategy 切替や auto_continue のキューに使用する想定
 */
export const DAILY_30_EXCLUDED_PREFECTURES = ['東京都'] as const;

/** 全国探索順（46都道府県 / 東京都を除外） */
export const DAILY_30_NATIONWIDE_PREFECTURES_ORDERED: readonly string[] = [
  '宮城県',
  '福島県',
  '山形県',
  '茨城県',
  '栃木県',
  '群馬県',
  '新潟県',
  '長野県',
  '山梨県',
  '静岡県',
  '北海道',
  '岩手県',
  '秋田県',
  '青森県',
  '千葉県',
  '埼玉県',
  '神奈川県',
  '愛知県',
  '岐阜県',
  '三重県',
  '石川県',
  '富山県',
  '福井県',
  '滋賀県',
  '京都府',
  '奈良県',
  '和歌山県',
  '大阪府',
  '兵庫県',
  '岡山県',
  '広島県',
  '山口県',
  '鳥取県',
  '島根県',
  '香川県',
  '徳島県',
  '愛媛県',
  '高知県',
  '福岡県',
  '佐賀県',
  '長崎県',
  '熊本県',
  '大分県',
  '宮崎県',
  '鹿児島県',
  '沖縄県',
];

export function isDaily30PrefectureExcluded(prefecture: string): boolean {
  return DAILY_30_EXCLUDED_PREFECTURES.includes(prefecture as (typeof DAILY_30_EXCLUDED_PREFECTURES)[number]);
}

