import type { MailSuppression } from './suppressionTypes.js';

/** GCS 正本 — mail-operations/mail-suppressions.json */
export interface MailSuppressionsDocument {
  schemaVersion: 1;
  updatedAt: string;
  records: MailSuppression[];
}

export interface UnsubscribeTokenRecord {
  tokenHash: string;
  tenantId: string;
  leadId?: string;
  companyId?: string;
  normalizedEmail: string;
  expiresAt: string;
  createdAt: string;
}

/** GCS 正本 — mail-operations/unsubscribe-tokens.json */
export interface UnsubscribeTokensDocument {
  schemaVersion: 1;
  updatedAt: string;
  records: UnsubscribeTokenRecord[];
}

export interface SuppressionAuditEvent {
  schemaVersion: 1;
  tenantId: string;
  action: string;
  reason?: string;
  source: string;
  actorType: 'recipient' | 'system' | 'human';
  occurredAt: string;
  suppressionId?: string;
  correlationId: string;
}

export interface ParsedGcsDocument<T> {
  document: T;
  generation: string | null;
}

/** ローカル runtime 互換（version フィールド） */
export interface LegacyMailSuppressionStoreDocument {
  version: 1;
  updatedAt: string;
  records: MailSuppression[];
}
