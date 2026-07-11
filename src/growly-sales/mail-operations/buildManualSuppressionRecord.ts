import { randomUUID } from 'node:crypto';
import type {
  MailSuppression,
  MailSuppressionSource,
  MailSuppressionStatus,
  SuppressionScope,
} from './suppressionTypes.js';
import { normalizeEmailAddress } from './suppressionToken.js';
import { getDefaultMailOperationsTenantId } from './tenantResolver.js';

export interface BuildManualSuppressionRecordInput {
  tenantId: string;
  emailAddress: string;
  leadId?: string;
  companyId?: string;
  companyName?: string;
  reason: string;
  status?: MailSuppressionStatus;
  source?: MailSuppressionSource;
  scope?: SuppressionScope;
}

export function buildManualSuppressionRecord(
  input: BuildManualSuppressionRecordInput
): MailSuppression {
  const tenantId = input.tenantId.trim() || getDefaultMailOperationsTenantId();
  const normalizedEmail = normalizeEmailAddress(input.emailAddress);
  const scope: SuppressionScope = input.scope ?? 'tenant';
  const now = new Date().toISOString();
  const source: MailSuppressionSource = input.source ?? 'manual';
  const status: MailSuppressionStatus = input.status ?? 'manually_blocked';

  return {
    suppressionId: randomUUID(),
    tenantId,
    scope,
    companyId: input.companyId,
    leadId: input.leadId,
    emailAddress: input.emailAddress.trim(),
    normalizedEmail,
    status,
    reason: input.reason.trim() || (source === 'reply_opt_out' ? '返信による停止希望' : '手動による配信禁止'),
    source,
    unsubscribedAt: now,
    createdAt: now,
    updatedAt: now,
  };
}
