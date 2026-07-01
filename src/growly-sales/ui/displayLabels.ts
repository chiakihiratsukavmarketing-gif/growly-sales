/** ユーザー向け日本語ラベル（内部 enum 名は表示しない） */

export function replyStatusLabel(value: string | null | undefined): string {
  switch (value) {
    case 'none':
      return '未確認';
    case 'no_reply':
      return '返信なし';
    case 'replied':
      return '返信あり';
    case 'interested':
      return '興味あり';
    case 'requested_report':
      return '診断希望';
    case 'declined':
      return '辞退';
    case 'bounced':
      return 'バウンス';
    case 'follow_up_needed':
      return 'フォロー必要';
    default:
      return value?.trim() ? '要確認' : '未確認';
  }
}

export function sendStatusLabel(value: string | null | undefined): string {
  switch (value) {
    case 'not_sent':
      return '未送信';
    case 'sent':
    case 'manual_sent':
      return '送信済み';
    case 'draft':
      return '下書きあり';
    case 'blocked':
      return '送信不可';
    default:
      return '未送信';
  }
}

export function humanReviewLabel(value: string | null | undefined): string {
  switch (value) {
    case 'approved':
      return '承認済み';
    case 'pending':
      return '承認待ち';
    case 'rejected':
      return '却下';
    case 'needs_revision':
      return '修正依頼';
    default:
      return '未確認';
  }
}

export function nextActionLabel(value: string | null | undefined): string {
  if (!value?.trim()) return '—';
  if (value === 'フォローアップ') return '再連絡';
  if (value === '対象外') return '対応不要';
  if (value.includes('診断')) return '診断レポート対応';
  return value;
}

export function isDevApiErrorMessage(message: string): boolean {
  return (
    message.includes('/api/') ||
    message.includes('API:') ||
    message.includes('パス:') ||
    message.includes('leads.json') ||
    message.includes('is not defined') ||
    message.includes('Not found') ||
    message.includes('gcloud auth') ||
    message.includes('GROWLY_GCS') ||
    message.includes('storage.objectUser') ||
    message.includes('GCS から')
  );
}

export function toUserFacingError(message: string): string {
  if (isDevApiErrorMessage(message)) {
    return 'データの読み込みに失敗しました。再読み込みしてください。';
  }
  return message;
}
