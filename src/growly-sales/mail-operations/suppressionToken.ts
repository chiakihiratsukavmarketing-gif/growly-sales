import { createHash, randomBytes } from 'node:crypto';

const MOCK_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface MockUnsubscribeTokenRecord {
  tokenHash: string;
  leadId?: string;
  companyId?: string;
  emailAddress: string;
  normalizedEmail: string;
  expiresAt: string;
  createdAt: string;
}

export function normalizeEmailAddress(emailAddress: string): string {
  return emailAddress.trim().toLowerCase();
}

export function hashUnsubscribeToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function generateUnsubscribeToken(): string {
  return randomBytes(32).toString('base64url');
}

export function createMockUnsubscribeTokenRecord(input: {
  leadId?: string;
  companyId?: string;
  emailAddress: string;
  ttlMs?: number;
}): { token: string; record: MockUnsubscribeTokenRecord } {
  const token = generateUnsubscribeToken();
  const now = Date.now();
  const ttl = input.ttlMs ?? MOCK_TOKEN_TTL_MS;
  const normalizedEmail = normalizeEmailAddress(input.emailAddress);
  return {
    token,
    record: {
      tokenHash: hashUnsubscribeToken(token),
      leadId: input.leadId,
      companyId: input.companyId,
      emailAddress: input.emailAddress.trim(),
      normalizedEmail,
      expiresAt: new Date(now + ttl).toISOString(),
      createdAt: new Date(now).toISOString(),
    },
  };
}

export function isMockTokenExpired(record: MockUnsubscribeTokenRecord, now = Date.now()): boolean {
  const expires = Date.parse(record.expiresAt);
  return Number.isNaN(expires) || expires < now;
}
