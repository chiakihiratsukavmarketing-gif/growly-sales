import type { UnsubscribeTokenRecord, UnsubscribeTokensDocument } from './gcsDocumentTypes.js';
import { SuppressionStoreUnavailableError } from './suppressionTypes.js';
import type { UnsubscribeTokenStore } from './unsubscribeTokenStore.js';
import type { GcsJsonStoragePort } from './gcsJsonStoragePort.js';
import { createDefaultGcsJsonStoragePort } from './gcsJsonStoragePort.js';
import { withGenerationMatchRetry } from './withGenerationMatchRetry.js';
import { MAIL_OPS_TOKENS_LOGICAL } from './mailOpsPaths.js';
import { parseUnsubscribeTokensDocument, serializeUnsubscribeTokensDocument } from './gcsDocumentParser.js';

function isExpired(record: UnsubscribeTokenRecord, now: Date): boolean {
  const t = Date.parse(record.expiresAt);
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
    if (isExpired(found, this.now())) {
      return null;
    }
    return found;
  }

  async add(record: UnsubscribeTokenRecord): Promise<void> {
    assertRecordShape(record);
    const next: UnsubscribeTokenRecord = {
      ...record,
      tenantId: record.tenantId.trim(),
      tokenHash: record.tokenHash.trim(),
      normalizedEmail: record.normalizedEmail.trim().toLowerCase(),
      leadId: record.leadId?.trim() || undefined,
      companyId: record.companyId?.trim() || undefined,
      sendRecordId: record.sendRecordId?.trim() || undefined,
      usedAt: record.usedAt?.trim() || undefined,
    };

    await this.mutate(async (doc) => {
      const idx = doc.records.findIndex((r) => r.tokenHash === next.tokenHash);
      if (idx !== -1) {
        // idempotent add; keep existing
        return { doc, wrote: false };
      }
      doc.records.push(next);
      return { doc, wrote: true };
    });
  }

  async markUsed(input: { tokenHash: string; usedAt: string }): Promise<void> {
    const tokenHash = input.tokenHash.trim();
    const usedAt = input.usedAt.trim();
    if (!tokenHash || !usedAt) return;
    await this.mutate(async (doc) => {
      const idx = doc.records.findIndex((r) => r.tokenHash === tokenHash);
      if (idx === -1) return { doc, wrote: false };
      const current = doc.records[idx]!;
      assertRecordShape(current);
      if (current.usedAt) {
        return { doc, wrote: false };
      }
      doc.records[idx] = { ...current, usedAt };
      return { doc, wrote: true };
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

  private async mutate(
    mutate: (doc: UnsubscribeTokensDocument) => Promise<{ doc: UnsubscribeTokensDocument; wrote: boolean }>
  ): Promise<void> {
    await withGenerationMatchRetry({
      operation: async () => {
        const raw = await this.storage.readJson(MAIL_OPS_TOKENS_LOGICAL);
        const meta = await this.storage.getMetadata(MAIL_OPS_TOKENS_LOGICAL);
        const doc = parseUnsubscribeTokensDocument(raw);
        const mutated = await mutate(doc);
        const nextDoc: UnsubscribeTokensDocument = {
          ...mutated.doc,
          schemaVersion: 1,
          updatedAt: this.now().toISOString(),
        };
        const jsonText = serializeUnsubscribeTokensDocument(nextDoc);
        const generation = meta?.generation ?? null;
        if (generation) {
          await this.storage.writeIfGenerationMatch(MAIL_OPS_TOKENS_LOGICAL, jsonText, generation);
        } else {
          await this.storage.writeIfGenerationMatch(MAIL_OPS_TOKENS_LOGICAL, jsonText, '0');
        }

        const verifyRaw = await this.storage.readJson(MAIL_OPS_TOKENS_LOGICAL);
        if (!verifyRaw?.trim()) {
          throw new SuppressionStoreUnavailableError('配信停止トークン情報の保存確認に失敗しました');
        }
        parseUnsubscribeTokensDocument(verifyRaw);
      },
    });
  }
}

