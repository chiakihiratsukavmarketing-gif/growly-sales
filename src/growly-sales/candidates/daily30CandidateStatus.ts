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

export const DAILY_30_TARGET = 30;

/** 同一ドメインへの連続アクセス間隔（ms） */
export const DAILY_30_DOMAIN_DELAY_MS = 1500;

/** 1回の実行でメール確認する最大件数 */
export const DAILY_30_MAX_EMAIL_CHECKS = 30;
