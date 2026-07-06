import { createHash, randomBytes } from 'node:crypto';

export interface MockOpenTrackingTokenRecord {
  tokenHash: string;
  trackingId: string;
  sendRecordId: string;
  leadId?: string;
  createdAt: string;
}

export function hashOpenTrackingToken(token: string): string {
  const pepper = process.env.OPEN_TRACKING_TOKEN_PEPPER?.trim() ?? '';
  return createHash('sha256').update(`${pepper}${token}`, 'utf8').digest('hex');
}

export function generateOpenTrackingToken(): string {
  return randomBytes(32).toString('base64url');
}

export function createMockOpenTrackingTokenRecord(input: {
  trackingId: string;
  sendRecordId: string;
  leadId?: string;
}): { token: string; record: MockOpenTrackingTokenRecord } {
  const token = generateOpenTrackingToken();
  return {
    token,
    record: {
      tokenHash: hashOpenTrackingToken(token),
      trackingId: input.trackingId,
      sendRecordId: input.sendRecordId,
      leadId: input.leadId,
      createdAt: new Date().toISOString(),
    },
  };
}
