export type MailSuppressionStatus =
  | 'unsubscribed'
  | 'manually_blocked'
  | 'invalid_address'
  | 'complaint'
  | 'legal_block';

export type MailSuppressionSource =
  | 'unsubscribe_link'
  | 'manual'
  | 'bounce'
  | 'complaint'
  | 'import'
  | 'legacy_do_not_contact';

export type SuppressionOperation =
  | 'generate_sales_copy'
  | 'select_draft_candidate'
  | 'create_gmail_draft'
  | 'follow_up'
  | 'resend';

export type SuppressionScope = 'tenant' | 'platform';

export interface MailSuppression {
  suppressionId: string;
  /** SaaS 向け境界（現時点は default tenant のみ） */
  tenantId?: string;
  scope?: SuppressionScope;
  companyId?: string;
  leadId?: string;
  emailAddress: string;
  normalizedEmail: string;
  status: MailSuppressionStatus;
  reason?: string;
  source: MailSuppressionSource;
  tokenHash?: string;
  unsubscribedAt?: string;
  createdAt: string;
  updatedAt: string;
  lastAttemptBlockedAt?: string;
  reactivatedAt?: string | null;
  reactivatedBy?: 'human' | null;
  reactivationMemo?: string | null;
}

/** JSON ドキュメント（runtime） */
export interface MailSuppressionStoreDocument {
  version: 1;
  records: MailSuppression[];
  updatedAt: string;
}

/** 交換可能な suppression store（将来: GCS/DB） */
export interface MailSuppressionStore {
  listByTenant(tenantId: string): Promise<MailSuppression[]>;
  findActive(input: { tenantId: string; normalizedEmail: string }): Promise<MailSuppression | null>;
  add(input: MailSuppression): Promise<MailSuppression>;
  update(input: MailSuppression): Promise<MailSuppression>;
}

export type SuppressionCheckResult =
  | { allowed: true }
  | {
      allowed: false;
      suppression: MailSuppression;
      blockedReason: string;
      legacySource?: 'mail_suppression' | 'do_not_contact' | 'send_status_blocked';
    };

export const ACTIVE_SUPPRESSION_STATUSES: readonly MailSuppressionStatus[] = [
  'unsubscribed',
  'manually_blocked',
  'invalid_address',
  'complaint',
  'legal_block',
];

export function isActiveSuppressionStatus(status: MailSuppressionStatus): boolean {
  return (ACTIVE_SUPPRESSION_STATUSES as readonly string[]).includes(status);
}

export class SuppressionStoreUnavailableError extends Error {
  constructor(message = '配信禁止リストを確認できませんでした') {
    super(message);
    this.name = 'SuppressionStoreUnavailableError';
  }
}
