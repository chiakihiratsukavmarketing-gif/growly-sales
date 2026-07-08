import type { UnsubscribeTokenRecord } from './gcsDocumentTypes.js';

export interface UnsubscribeTokenStore {
  findByTokenHash(tokenHash: string): Promise<UnsubscribeTokenRecord | null>;
  add(record: UnsubscribeTokenRecord): Promise<void>;
  markUsed(input: { tokenHash: string; usedAt: string }): Promise<void>;
}

export class InMemoryUnsubscribeTokenStore implements UnsubscribeTokenStore {
  private readonly records = new Map<string, UnsubscribeTokenRecord>();

  async findByTokenHash(tokenHash: string): Promise<UnsubscribeTokenRecord | null> {
    return this.records.get(tokenHash) ?? null;
  }

  async add(record: UnsubscribeTokenRecord): Promise<void> {
    this.records.set(record.tokenHash, structuredClone(record));
  }

  async markUsed(input: { tokenHash: string; usedAt: string }): Promise<void> {
    const existing = this.records.get(input.tokenHash);
    if (!existing) return;
    if (existing.usedAt) return;
    this.records.set(input.tokenHash, { ...existing, usedAt: input.usedAt });
  }
}

