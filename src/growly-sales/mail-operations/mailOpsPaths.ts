import { getGcsPrefix } from '../config/storageBackend.js';

export const MAIL_OPS_SUPPRESSIONS_LOGICAL = 'mail-operations/mail-suppressions.json';
export const MAIL_OPS_TOKENS_LOGICAL = 'mail-operations/unsubscribe-tokens.json';

export function buildMailOpsSuppressionBackupObjectPath(
  generation: string,
  now: Date = new Date()
): string {
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  const prefix = getGcsPrefix();
  return `${prefix}/mail-operations/backups/mail-suppressions/${stamp}-${generation}.json`;
}

export function buildMailOpsAuditObjectPath(correlationId: string, now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  const safeId = correlationId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) || 'event';
  const prefix = getGcsPrefix();
  return `${prefix}/mail-operations/audit/${y}/${m}/${d}/${stamp}-${safeId}.json`;
}
