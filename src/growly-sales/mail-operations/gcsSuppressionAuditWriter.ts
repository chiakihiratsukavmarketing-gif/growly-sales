import { randomUUID } from 'node:crypto';
import type { GcsJsonStoragePort } from './gcsJsonStoragePort.js';
import { createDefaultGcsJsonStoragePort } from './gcsJsonStoragePort.js';
import type { SuppressionAuditEvent } from './gcsDocumentTypes.js';
import { buildMailOpsAuditObjectPath } from './mailOpsPaths.js';

export interface AuditWriteInput {
  tenantId: string;
  action: string;
  reason?: string;
  source: string;
  actorType: SuppressionAuditEvent['actorType'];
  suppressionId?: string;
  correlationId?: string;
  occurredAt?: string;
}

export interface AuditWriteResult {
  ok: boolean;
  correlationId: string;
  alertCandidate: boolean;
  objectPath?: string;
}

export interface GcsSuppressionAuditWriter {
  writeEvent(input: AuditWriteInput): Promise<AuditWriteResult>;
}

export function createGcsSuppressionAuditWriter(
  storage: GcsJsonStoragePort = createDefaultGcsJsonStoragePort()
): GcsSuppressionAuditWriter {
  return {
    async writeEvent(input: AuditWriteInput): Promise<AuditWriteResult> {
      const correlationId = input.correlationId?.trim() || randomUUID();
      const occurredAt = input.occurredAt ?? new Date().toISOString();
      const event: SuppressionAuditEvent = {
        schemaVersion: 1,
        tenantId: input.tenantId.trim(),
        action: input.action.trim(),
        ...(input.reason?.trim() ? { reason: input.reason.trim() } : {}),
        source: input.source.trim(),
        actorType: input.actorType,
        occurredAt,
        ...(input.suppressionId ? { suppressionId: input.suppressionId } : {}),
        correlationId,
      };
      const objectPath = buildMailOpsAuditObjectPath(correlationId, new Date(occurredAt));
      try {
        await storage.writeNewJsonAtPath(objectPath, `${JSON.stringify(event, null, 2)}\n`);
        return { ok: true, correlationId, alertCandidate: false, objectPath };
      } catch {
        return { ok: false, correlationId, alertCandidate: true };
      }
    },
  };
}
