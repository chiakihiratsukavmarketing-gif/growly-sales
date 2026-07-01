/**
 * Daily 30 / ダッシュボード数値の定義（Phase 38.4）
 * 詳細: docs/GROWLY_SALES_DAILY30_METRICS.md
 */
export const DAILY30_METRIC_DEFINITIONS = {
  emailFoundAtCollection:
    'GCS cloud-run state の emailFound（収集 run 時点）。Lead化承認・除外後も減らない。',
  leadApprovalPendingCount:
    '当日 batch の pipelineStatus=email_found かつ未取り込み かつ human excluded でない候補。',
  leadApprovalApprovedCount:
    'importStatus=approved_for_lead かつ human excluded でない候補。',
  copyGeneratedCount:
    'copyGeneratedAt がある候補（human excluded でない）。',
  draftImportPendingCount:
    'pipelineStatus=ready_for_draft かつ importStatus=approved_for_lead かつ未import かつ excluded でない。',
  humanExcludedCount:
    'pipelineStatus=excluded / importStatus=excluded / humanReviewStatus=rejected / excludedAt / excludedBy=human のいずれか。',
  totalCollectedAtCollection:
    'GCS state の totalCollected（収集 run 時点）。除外後も減らない。',
  gmailDraftCandidateCount: 'leads.json 内の Gmail 下書き候補タブ対象 Lead 数。',
  manualSentCount: 'sendStatus=manual_sent の Lead のみ（draft 作成済み not_sent は含めない）。',
  initialEmailSentCount: 'sendStatus=sent の Lead（旧自動送信記録）。',
} as const;
