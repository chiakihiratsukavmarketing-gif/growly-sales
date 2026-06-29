/** MIME修正バッチ完了後は空。必要時のみ会社名を追加 */
export const GMAIL_DRAFT_HALTED_COMPANIES = [] as const;

export function isGmailDraftCreateHalted(companyName: string): boolean {
  return (GMAIL_DRAFT_HALTED_COMPANIES as readonly string[]).includes(companyName);
}

export function getGmailDraftHaltReason(companyName: string): string | null {
  if (!isGmailDraftCreateHalted(companyName)) return null;
  return 'MIME From/Reply-To 修正中のため下書き作成を一時停止';
}
