/** Daily 30 / 候補収集 UI 向けステータスラベル（日本語統一） */

export function pipelineStatusLabel(status: string): string {
  switch (status) {
    case 'email_found':
      return 'メール取得済';
    case 'email_not_found':
      return 'メールなし';
    case 'ready_for_copy':
      return '営業文待ち';
    case 'ready_for_draft':
      return '下書き待ち';
    case 'needs_review':
      return '要確認';
    case 'excluded':
      return '除外';
    case 'duplicate':
      return '重複';
    case 'collected':
      return '収集済';
    default:
      return status || '—';
  }
}

export function importStatusLabel(status: string): string {
  switch (status) {
    case 'approved_for_lead':
      return 'Lead承認済';
    case 'imported':
      return '取り込み済';
    case 'preview':
      return '未承認';
    case 'duplicate':
      return '重複';
    case 'skipped':
      return 'スキップ';
    default:
      return status || '—';
  }
}

export function cloudRunStatusLabel(status: string): string {
  switch (status) {
    case 'success':
      return '成功';
    case 'partial_success':
      return '部分達成';
    case 'failed':
      return '失敗';
    case 'skipped':
      return 'スキップ';
    case 'blocked':
      return 'ブロック';
    case 'not_run':
      return '未実行';
    default:
      return status;
  }
}

export function pipelineStatusVariant(status: string): string {
  switch (status) {
    case 'email_found':
      return 'status-ok';
    case 'ready_for_draft':
    case 'ready_for_copy':
      return 'status-ready';
    case 'needs_review':
      return 'status-warn';
    case 'excluded':
    case 'duplicate':
      return 'status-muted';
    case 'email_not_found':
      return 'status-neutral';
    default:
      return 'status-neutral';
  }
}
