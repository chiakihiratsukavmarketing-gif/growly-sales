import type { UnsubscribeTokenRecord, UnsubscribeTokensDocument } from './gcsDocumentTypes.js';
import type { GcsJsonStoragePort } from './gcsJsonStoragePort.js';
import { createDefaultGcsJsonStoragePort } from './gcsJsonStoragePort.js';
import { parseUnsubscribeTokensDocument, serializeUnsubscribeTokensDocument } from './gcsDocumentParser.js';
import { MAIL_OPS_TOKENS_LOGICAL } from './mailOpsPaths.js';
import type { UnsubscribeTokenStore } from './unsubscribeTokenStore.js';
import { SuppressionStoreUnavailableError } from './suppressionTypes.js';
import { withGenerationMatchRetry } from './withGenerationMatchRetry.js';

function isExpired(expiresAt: string, now: Date): boolean {
  const t = Date.parse(expiresAt);
  return Number.isNaN(t) || t < now.getTime();
}

function assertRecordShape(record: UnsubscribeTokenRecord): void {
  const tenantId = record.tenantId?.trim();
  const tokenHash = record.tokenHash?.trim();
  const normalizedEmail = record.normalizedEmail?.trim();
  if (!tenantId || !tokenHash || !normalizedEmail) {
    throw new SuppressionStoreUnavailableError('配信停止トークン情報の形式が不正です');
  }
  if (!record.expiresAt || Number.isNaN(Date.parse(record.expiresAt))) {
    throw new SuppressionStoreUnavailableError('配信停止トークン情報の形式が不正です');
  }
}

export interface GcsUnsubscribeTokenStoreOptions {
  storage?: GcsJsonStoragePort;
  now?: () => Date;
}

export class GcsUnsubscribeTokenStore implements UnsubscribeTokenStore {
  private readonly storage: GcsJsonStoragePort;
  private readonly now: () => Date;

  constructor(options: GcsUnsubscribeTokenStoreOptions = {}) {
    this.storage = options.storage ?? createDefaultGcsJsonStoragePort();
    this.now = options.now ?? (() => new Date());
  }

  async findByTokenHash(tokenHash: string): Promise<UnsubscribeTokenRecord | null> {
    const trimmed = tokenHash.trim();
    if (!trimmed) return null;
    const doc = await this.readDocument();
    const found = doc.records.find((r) => r.tokenHash === trimmed) ?? null;
    if (!found) return null;
    assertRecordShape(found);
    if (isExpired(found.expiresAt, this.now())) return null;
    return found;
  }

  async add(record: UnsubscribeTokenRecord): Promise<void> {
    const next: UnsubscribeTokenRecord = {
      ...record,
      tenantId: String(record.tenantId ?? '').trim(),
      tokenHash: String(record.tokenHash ?? '').trim(),
      normalizedEmail: String(record.normalizedEmail ?? '').trim().toLowerCase(),
      leadId: record.leadId?.trim() || undefined,
      companyId: record.companyId?.trim() || undefined,
      sendRecordId: record.sendRecordId?.trim() || undefined,
      expiresAt: String(record.expiresAt ?? ''),
      createdAt: String(record.createdAt ?? ''),
      usedAt: record.usedAt?.trim() || undefined,
    };
    assertRecordShape(next);

    await this.mutate(async (doc) => {
      const idx = doc.records.findIndex((r) => r.tokenHash === next.tokenHash);
      if (idx !== -1) return doc; // idempotent add
      doc.records.push(next);
      return doc;
    });
  }

  async markUsed(input: { tokenHash: string; usedAt: string }): Promise<void> {
    const tokenHash = input.tokenHash.trim();
    const usedAt = input.usedAt.trim();
    if (!tokenHash || !usedAt) return;

    await this.mutate(async (doc) => {
      const idx = doc.records.findIndex((r) => r.tokenHash === tokenHash);
      if (idx === -1) return doc;
      const current = doc.records[idx]!;
      assertRecordShape(current);
      if (current.usedAt) return doc; // idempotent
      doc.records[idx] = { ...current, usedAt };
      return doc;
    });
  }

  private async readDocument(): Promise<UnsubscribeTokensDocument> {
    try {
      const raw = await this.storage.readJson(MAIL_OPS_TOKENS_LOGICAL);
      return parseUnsubscribeTokensDocument(raw);
    } catch (err) {
      if (err instanceof SuppressionStoreUnavailableError) throw err;
      throw new SuppressionStoreUnavailableError();
    }
  }

  private async mutate(mutate: (doc: UnsubscribeTokensDocument) => Promise<UnsubscribeTokensDocument>): Promise<void> {
    await withGenerationMatchRetry({
      operation: async () => {
        const raw = await this.storage.readJson(MAIL_OPS_TOKENS_LOGICAL);
        const meta = await this.storage.getMetadata(MAIL_OPS_TOKENS_LOGICAL);
        const doc = parseUnsubscribeTokensDocument(raw);
        const mutated = await mutate(doc);
        const nextDoc: UnsubscribeTokensDocument = {
          ...mutated,
          schemaVersion: 1,
          updatedAt: this.now().toISOString(),
        };
        const jsonText = serializeUnsubscribeTokensDocument(nextDoc);
        await this.storage.writeIfGenerationMatch(
          MAIL_OPS_TOKENS_LOGICAL,
          jsonText,
          meta?.generation ?? '0'
        );

        const verifyRaw = await this.storage.readJson(MAIL_OPS_TOKENS_LOGICAL);
        if (!verifyRaw?.trim()) {
          throw new SuppressionStoreUnavailableError('配信停止トークン情報の保存確認に失敗しました');
        }
        parseUnsubscribeTokensDocument(verifyRaw);
      },
    });
  }
}

