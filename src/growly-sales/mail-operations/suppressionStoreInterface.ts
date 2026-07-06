import type { MailSuppression, MailSuppressionStore } from './suppressionTypes.js';
import {
  findActiveSuppressionByEmail,
  listMailSuppressions,
  loadMailSuppressionStore,
  loadMailSuppressionStoreSync,
  persistMailSuppressionStoreDocument,
} from './suppressionStore.js';
import { getDefaultMailOperationsTenantId } from './tenantResolver.js';

function hydrateTenant(record: MailSuppression): MailSuppression {
  return {
    ...record,
    tenantId: record.tenantId?.trim() || getDefaultMailOperationsTenantId(),
    scope: record.scope ?? 'tenant',
  };
}

export class LocalJsonMailSuppressionStore implements MailSuppressionStore {
  async listByTenant(tenantId: string): Promise<MailSuppression[]> {
    return listMailSuppressions(tenantId);
  }

  async findActive(input: {
    tenantId: string;
    normalizedEmail: string;
  }): Promise<MailSuppression | null> {
    const store = loadMailSuppressionStoreSync();
    return findActiveSuppressionByEmail(store, input);
  }

  async add(input: MailSuppression): Promise<MailSuppression> {
    const store = await loadMailSuppressionStore();
    const record = hydrateTenant(input);
    store.records.push(record);
    await persistMailSuppressionStoreDocument(store);
    return record;
  }

  async update(input: MailSuppression): Promise<MailSuppression> {
    const store = await loadMailSuppressionStore();
    const idx = store.records.findIndex((r) => r.suppressionId === input.suppressionId);
    if (idx === -1) throw new Error('suppression not found');
    const record = hydrateTenant(input);
    store.records[idx] = record;
    await persistMailSuppressionStoreDocument(store);
    return record;
  }
}

/** GCS JSON 実装のプレースホルダ（live 書き込みは Phase 44.1 では未開始） */
export class GcsJsonMailSuppressionStore implements MailSuppressionStore {
  async listByTenant(_tenantId: string): Promise<MailSuppression[]> {
    throw new Error('GcsJsonMailSuppressionStore is not enabled (mock/local only)');
  }

  async findActive(_input: { tenantId: string; normalizedEmail: string }): Promise<MailSuppression | null> {
    throw new Error('GcsJsonMailSuppressionStore is not enabled (mock/local only)');
  }

  async add(_input: MailSuppression): Promise<MailSuppression> {
    throw new Error('GcsJsonMailSuppressionStore is not enabled (mock/local only)');
  }

  async update(_input: MailSuppression): Promise<MailSuppression> {
    throw new Error('GcsJsonMailSuppressionStore is not enabled (mock/local only)');
  }
}
