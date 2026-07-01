/** Phase 23: Daily 30 候補パイプライン状態 */

export type Daily30PipelineStatus =
  | 'collected'
  | 'email_found'
  | 'email_not_found'
  | 'duplicate'
  | 'excluded'
  | 'ready_for_copy'
  | 'needs_review'
  | 'ready_for_draft';

export const DAILY30_PIPELINE_STATUSES: readonly Daily30PipelineStatus[] = [
  'collected',
  'email_found',
  'email_not_found',
  'duplicate',
  'excluded',
  'ready_for_copy',
  'needs_review',
  'ready_for_draft',
];

export type Daily30HumanReviewStatus = 'pending' | 'approved' | 'rejected' | 'needs_revision';

export type Daily30GmailDraftStatus = 'none' | 'draft_created' | 'error';

export type Daily30SendStatus = 'not_sent' | 'manual_sent' | 'draft' | 'sent' | 'blocked';

export type Daily30RegionGroup = '宮城' | '福島' | '北関東';

/** Daily 30 主目標: メール取得済み（email_found）件数 */
export const DAILY_30_TARGET = 30;
export const DAILY_30_TARGET_EMAIL_FOUND = DAILY_30_TARGET;

/** 同一ドメインへの連続アクセス間隔（ms） */
export const DAILY_30_DOMAIN_DELAY_MS = 1500;

/** 1回の実行で収集する候補の上限（email_found 未達でも打ち切り） */
export const DAILY_30_MAX_COLLECTED_CANDIDATES = 120;

/** 1回の実行でメール確認する最大件数 */
export const DAILY_30_MAX_EMAIL_CHECKS = 120;

/** Places API 結果の上限（無制限呼び出し防止） */
export const DAILY_30_MAX_PLACES_RESULTS = 200;

/** 1回の収集実行の最大所要時間（ms） */
export const DAILY_30_MAX_DURATION_MS = 15 * 60 * 1000;
