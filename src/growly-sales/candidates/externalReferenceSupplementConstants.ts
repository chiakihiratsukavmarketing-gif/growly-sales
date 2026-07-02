/** Phase 41.4: Daily 30 外部参照補完モード（UI / server 共通） */
export type ExternalReferenceSupplementMode =
  | 'not_applicable'
  | 'skipped_not_approved'
  | 'dry_run_only'
  | 'low_frequency_allowed'
  | 'blocked'
  | 'manual_only';

export const EXTERNAL_REFERENCE_SUPPLEMENT_WARNING_LABELS: Record<string, string> = {
  external_reference_not_applicable: '外部参照補完は対象外（Google Places / 公式サイト検索）',
  external_reference_human_approval_required: '人間承認が必要です',
  external_reference_dry_run_only: 'dry-run のみ（実アクセスなし）',
  external_reference_blocked: 'ポリシーによりブロック',
  external_reference_network_access_not_performed: 'ネットワークアクセスは行いませんでした',
  external_reference_manual_candidates_available: '手動URL候補が利用可能です',
  external_reference_no_approved_adapter: '承認済み adapter がありません',
  external_reference_email_from_official_site_only: 'メールは公式サイトのみ',
  external_reference_target_already_reached: 'メール取得目標に到達済みのため補完不要',
  external_reference_implementation_pending: 'adapter 実装 pending（ネットワークなし）',
  email_from_external_listing_forbidden: '外部掲載サイトからメール取得禁止',
  official_site_email_only: 'メール取得は公式サイトのみ',
};
