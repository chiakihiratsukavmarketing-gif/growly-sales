export class UnsubscribeTokenIssueError extends Error {
  constructor(message = '配信停止トークンの発行に失敗しました') {
    super(message);
    this.name = 'UnsubscribeTokenIssueError';
  }
}

export interface IssueUnsubscribeTokenForOutreachInput {
  tenantId: string;
  emailAddress: string;
  leadId?: string;
  companyId?: string;
  sendRecordId?: string;
  ttlMs?: number;
}

export interface IssuedUnsubscribeTokenForOutreach {
  tenantId: string;
  normalizedEmail: string;
  tokenHash: string;
  expiresAt: string;
  createdAt: string;
  /** メモリ上のみ — ログ・永続化禁止 */
  rawToken: string;
  /** メモリ上のみ — ログ・永続化禁止 */
  unsubscribeUrl: string;
}

/** Step 15 dry-run / live 発行の既定 TTL */
export const DEFAULT_UNSUBSCRIBE_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
