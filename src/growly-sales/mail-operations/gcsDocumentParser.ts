import type { MailSuppression } from './suppressionTypes.js';
import { SuppressionStoreUnavailableError } from './suppressionTypes.js';
import type {
  LegacyMailSuppressionStoreDocument,
  MailSuppressionsDocument,
  UnsubscribeTokensDocument,
} from './gcsDocumentTypes.js';
import { getDefaultMailOperationsTenantId } from './tenantResolver.js';
import type { SuppressionScope } from './suppressionTypes.js';

const FORBIDDEN_DOCUMENT_KEYS = new Set([
  'token',
  'rawToken',
  'pepper',
  'UNSUBSCRIBE_TOKEN_PEPPER',
  'url',
  'unsubscribeUrl',
  'PUBLIC_BASE_URL',
]);

function assertNoForbiddenFields(value: unknown, path = 'root'): void {
  if (value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoForbiddenFields(item, `${path}[${index}]`));
    return;
  }
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_DOCUMENT_KEYS.has(key)) {
      throw new SuppressionStoreUnavailableError('配信禁止リストの形式が不正です');
    }
    assertNoForbiddenFields(nested, `${path}.${key}`);
  }
}

function hydrateLegacyRecord(record: MailSuppression): MailSuppression {
  const tenantId = record.tenantId?.trim() || getDefaultMailOperationsTenantId();
  const scope: SuppressionScope = record.scope ?? 'tenant';
  return { ...record, tenantId, scope };
}

function migrateRecords(records: unknown): MailSuppression[] {
  if (!Array.isArray(records)) {
    throw new SuppressionStoreUnavailableError('配信禁止リストの形式が不正です');
  }
  return records.map((item) => {
    if (!item || typeof item !== 'object') {
      throw new SuppressionStoreUnavailableError('配信禁止リストの形式が不正です');
    }
    return hydrateLegacyRecord(item as MailSuppression);
  });
}

export function parseMailSuppressionsDocument(raw: string | null): MailSuppressionsDocument {
  if (!raw?.trim()) {
    return {
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
      records: [],
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new SuppressionStoreUnavailableError('配信禁止リストの読み込みに失敗しました');
  }
  assertNoForbiddenFields(parsed);
  if (!parsed || typeof parsed !== 'object') {
    throw new SuppressionStoreUnavailableError('配信禁止リストの形式が不正です');
  }
  const obj = parsed as Record<string, unknown>;
  if (obj.schemaVersion === 1) {
    return {
      schemaVersion: 1,
      updatedAt: String(obj.updatedAt ?? new Date().toISOString()),
      records: migrateRecords(obj.records),
    };
  }
  if (obj.version === 1) {
    const legacy = obj as unknown as LegacyMailSuppressionStoreDocument;
    return {
      schemaVersion: 1,
      updatedAt: legacy.updatedAt ?? new Date().toISOString(),
      records: migrateRecords(legacy.records),
    };
  }
  throw new SuppressionStoreUnavailableError('配信禁止リストの schemaVersion が不明です');
}

export function serializeMailSuppressionsDocument(doc: MailSuppressionsDocument): string {
  const payload: MailSuppressionsDocument = {
    schemaVersion: 1,
    updatedAt: doc.updatedAt,
    records: doc.records.map(hydrateLegacyRecord),
  };
  return `${JSON.stringify(payload, null, 2)}\n`;
}

export function parseUnsubscribeTokensDocument(raw: string | null): UnsubscribeTokensDocument {
  if (!raw?.trim()) {
    return {
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
      records: [],
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new SuppressionStoreUnavailableError('配信停止トークン情報の読み込みに失敗しました');
  }
  assertNoForbiddenFields(parsed);
  if (!parsed || typeof parsed !== 'object') {
    throw new SuppressionStoreUnavailableError('配信停止トークン情報の形式が不正です');
  }
  const obj = parsed as Record<string, unknown>;
  if (obj.schemaVersion !== 1) {
    throw new SuppressionStoreUnavailableError('配信停止トークン情報の schemaVersion が不明です');
  }
  if (!Array.isArray(obj.records)) {
    throw new SuppressionStoreUnavailableError('配信停止トークン情報の形式が不正です');
  }
  const records = obj.records.map((item) => {
    if (!item || typeof item !== 'object') {
      throw new SuppressionStoreUnavailableError('配信停止トークン情報の形式が不正です');
    }
    const record = item as Record<string, unknown>;
    const tenantId = String(record.tenantId ?? '').trim();
    const tokenHash = String(record.tokenHash ?? '').trim();
    if (!tenantId || !tokenHash) {
      throw new SuppressionStoreUnavailableError('配信停止トークン情報の形式が不正です');
    }
    return {
      tokenHash,
      tenantId,
      leadId: record.leadId ? String(record.leadId) : undefined,
      companyId: record.companyId ? String(record.companyId) : undefined,
      normalizedEmail: String(record.normalizedEmail ?? '').trim(),
      expiresAt: String(record.expiresAt ?? ''),
      createdAt: String(record.createdAt ?? ''),
    };
  });
  return {
    schemaVersion: 1,
    updatedAt: String(obj.updatedAt ?? new Date().toISOString()),
    records,
  };
}
