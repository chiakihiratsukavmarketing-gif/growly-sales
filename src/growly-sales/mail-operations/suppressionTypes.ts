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

export interface MailSuppression {
  suppressionId: string;
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

export interface MailSuppressionStore {
  version: 1;
  records: MailSuppression[];
  updatedAt: string;
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
