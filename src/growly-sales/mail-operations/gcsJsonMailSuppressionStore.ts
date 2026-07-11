import { randomUUID } from 'node:crypto';
import type { MailSuppression, MailSuppressionStore } from './suppressionTypes.js';
import { SuppressionStoreUnavailableError } from './suppressionTypes.js';
import { findActiveSuppressionByEmail } from './suppressionStore.js';
import type { GcsJsonStoragePort } from './gcsJsonStoragePort.js';
import { createDefaultGcsJsonStoragePort } from './gcsJsonStoragePort.js';
import {
  parseMailSuppressionsDocument,
  serializeMailSuppressionsDocument,
} from './gcsDocumentParser.js';
import type { MailSuppressionsDocument } from './gcsDocumentTypes.js';
import { MAIL_OPS_SUPPRESSIONS_LOGICAL } from './mailOpsPaths.js';
import { buildMailOpsSuppressionBackupObjectPath } from './mailOpsPaths.js';
import { buildGcsObjectPath } from '../config/storageBackend.js';
import { withGenerationMatchRetry } from './withGenerationMatchRetry.js';
import type { SuppressionAuditEvent } from './gcsDocumentTypes.js';
import type { GcsSuppressionAuditWriter, AuditWriteResult } from './gcsSuppressionAuditWriter.js';
import { createGcsSuppressionAuditWriter } from './gcsSuppressionAuditWriter.js';
import { getDefaultMailOperationsTenantId } from './tenantResolver.js';
import type { SuppressionScope } from './suppressionTypes.js';

function auditActorTypeForSource(source: string): SuppressionAuditEvent['actorType'] {
  if (source === 'unsubscribe_link') return 'recipient';
  if (source === 'manual' || source === 'reply_opt_out') return 'human';
  return 'system';
}

function hydrateTenant(record: MailSuppression): MailSuppression {
  return {
    ...record,
    tenantId: record.tenantId?.trim() || getDefaultMailOperationsTenantId(),
    scope: record.scope ?? 'tenant',
  };
}

export interface GcsJsonMailSuppressionStoreOptions {
  storage?: GcsJsonStoragePort;
  auditWriter?: GcsSuppressionAuditWriter;
}

export class GcsJsonMailSuppressionStore implements MailSuppressionStore {
  private readonly storage: GcsJsonStoragePort;
  private readonly auditWriter: GcsSuppressionAuditWriter;

  constructor(options: GcsJsonMailSuppressionStoreOptions = {}) {
    this.storage = options.storage ?? createDefaultGcsJsonStoragePort();
    this.auditWriter = options.auditWriter ?? createGcsSuppressionAuditWriter(this.storage);
  }

  async listByTenant(tenantId: string): Promise<MailSuppression[]> {
    const doc = await this.readDocument();
    const scoped = doc.records.filter((r) => {
      const record = hydrateTenant(r);
      return record.scope === 'platform' || record.tenantId === tenantId.trim();
    });
    return [...scoped].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async findActive(input: {
    tenantId: string;
    normalizedEmail: string;
  }): Promise<MailSuppression | null> {
    const doc = await this.readDocument();
    const legacyShape = { version: 1 as const, records: doc.records, updatedAt: doc.updatedAt };
    return findActiveSuppressionByEmail(legacyShape, input);
  }

  async add(input: MailSuppression): Promise<MailSuppression> {
    const record = hydrateTenant(input);
    return this.mutateDocument(async (doc) => {
      const existing = findActiveSuppressionByEmail(
        { version: 1, records: doc.records, updatedAt: doc.updatedAt },
        { tenantId: record.tenantId!, normalizedEmail: record.normalizedEmail }
      );
      if (existing) {
        return { doc, result: existing, auditAction: null };
      }
      doc.records.push(record);
      return {
        doc,
        result: record,
        auditAction: {
          tenantId: record.tenantId!,
          action: 'suppression_added',
          reason: record.reason,
          source: record.source,
          suppressionId: record.suppressionId,
          actorType: auditActorTypeForSource(record.source),
        },
      };
    });
  }

  async update(input: MailSuppression): Promise<MailSuppression> {
    const record = hydrateTenant(input);
    return this.mutateDocument(async (doc) => {
      const idx = doc.records.findIndex((r) => r.suppressionId === record.suppressionId);
      if (idx === -1) {
        throw new SuppressionStoreUnavailableError('配信禁止レコードが見つかりません');
      }
      doc.records[idx] = record;
      return {
        doc,
        result: record,
        auditAction: {
          tenantId: record.tenantId!,
          action: 'suppression_updated',
          reason: record.reason,
          source: record.source,
          suppressionId: record.suppressionId,
        },
      };
    });
  }

  async addFromUnsubscribe(input: {
    tenantId: string;
    emailAddress: string;
    leadId?: string;
    companyId?: string;
    tokenHash: string;
    scope?: SuppressionScope;
  }): Promise<{ record: MailSuppression; created: boolean }> {
    const tenantId = input.tenantId.trim();
    const normalizedEmail = input.emailAddress.trim().toLowerCase();
    const scope: SuppressionScope = input.scope ?? 'tenant';
    const now = new Date().toISOString();
    let createdFlag = false;

    const record = await this.mutateDocument(async (doc) => {
      const existing = findActiveSuppressionByEmail(
        { version: 1, records: doc.records, updatedAt: doc.updatedAt },
        { tenantId, normalizedEmail }
      );
      if (existing) {
        const idx = doc.records.findIndex((r) => r.suppressionId === existing.suppressionId);
        doc.records[idx] = { ...existing, updatedAt: now };
        createdFlag = false;
        return {
          doc,
          result: doc.records[idx],
          auditAction: {
            tenantId,
            action: 'unsubscribe_idempotent',
            source: 'unsubscribe_link',
            suppressionId: existing.suppressionId,
          },
        };
      }
      const created: MailSuppression = {
        suppressionId: randomUUID(),
        tenantId,
        scope,
        companyId: input.companyId,
        leadId: input.leadId,
        emailAddress: input.emailAddress.trim(),
        normalizedEmail,
        status: 'unsubscribed',
        reason: '配信停止リンクからの停止',
        source: 'unsubscribe_link',
        tokenHash: input.tokenHash,
        unsubscribedAt: now,
        createdAt: now,
        updatedAt: now,
      };
      doc.records.push(created);
      createdFlag = true;
      return {
        doc,
        result: created,
        auditAction: {
          tenantId,
          action: 'unsubscribe_completed',
          source: 'unsubscribe_link',
          suppressionId: created.suppressionId,
        },
      };
    });

    return { record, created: createdFlag };
  }

  private async readDocument(): Promise<MailSuppressionsDocument> {
    try {
      const raw = await this.storage.readJson(MAIL_OPS_SUPPRESSIONS_LOGICAL);
      return parseMailSuppressionsDocument(raw);
    } catch (err) {
      if (err instanceof SuppressionStoreUnavailableError) throw err;
      throw new SuppressionStoreUnavailableError();
    }
  }

  private async mutateDocument<T extends MailSuppression>(
    mutate: (doc: MailSuppressionsDocument) => Promise<{
      doc: MailSuppressionsDocument;
      result: T;
      created?: boolean;
      auditAction: {
        tenantId: string;
        action: string;
        reason?: string;
        source: string;
        suppressionId?: string;
        actorType?: SuppressionAuditEvent['actorType'];
      } | null;
    }>
  ): Promise<T> {
    let auditResult: AuditWriteResult | null = null;
    const result = await withGenerationMatchRetry({
      operation: async () => {
        const raw = await this.storage.readJson(MAIL_OPS_SUPPRESSIONS_LOGICAL);
        const meta = await this.storage.getMetadata(MAIL_OPS_SUPPRESSIONS_LOGICAL);
        const doc = parseMailSuppressionsDocument(raw);
        const mutated = await mutate(doc);
        const nextDoc: MailSuppressionsDocument = {
          ...mutated.doc,
          schemaVersion: 1,
          updatedAt: new Date().toISOString(),
        };
        const jsonText = serializeMailSuppressionsDocument(nextDoc);
        const sourcePath = buildGcsObjectPath(MAIL_OPS_SUPPRESSIONS_LOGICAL);

        if (meta?.generation) {
          const backupPath = buildMailOpsSuppressionBackupObjectPath(meta.generation);
          try {
            await this.storage.copyObject(sourcePath, backupPath);
          } catch {
            throw new SuppressionStoreUnavailableError('配信禁止リストのバックアップに失敗しました');
          }
          await this.storage.writeIfGenerationMatch(
            MAIL_OPS_SUPPRESSIONS_LOGICAL,
            jsonText,
            meta.generation
          );
        } else {
          await this.storage.writeIfGenerationMatch(MAIL_OPS_SUPPRESSIONS_LOGICAL, jsonText, '0');
        }

        const verifyRaw = await this.storage.readJson(MAIL_OPS_SUPPRESSIONS_LOGICAL);
        if (!verifyRaw?.trim()) {
          throw new SuppressionStoreUnavailableError('配信禁止リストの保存確認に失敗しました');
        }
        parseMailSuppressionsDocument(verifyRaw);

        if (mutated.auditAction) {
          auditResult = await this.auditWriter.writeEvent({
            tenantId: mutated.auditAction.tenantId,
            action: mutated.auditAction.action,
            reason: mutated.auditAction.reason,
            source: mutated.auditAction.source,
            actorType: mutated.auditAction.actorType ?? auditActorTypeForSource(mutated.auditAction.source),
            suppressionId: mutated.auditAction.suppressionId,
          });
        }

        return mutated.result;
      },
    });
    if (auditResult && !auditResult.ok) {
      console.warn('[mail-ops] audit write failed; suppression persisted');
    }
    return result;
  }
}
