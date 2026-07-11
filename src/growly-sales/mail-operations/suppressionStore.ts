import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { getMailSuppressionsPath } from '../config/paths.js';
import type {
  MailSuppression,
  MailSuppressionSource,
  MailSuppressionStatus,
  MailSuppressionStoreDocument,
  SuppressionScope,
} from './suppressionTypes.js';
import {
  createMockUnsubscribeTokenRecord,
  hashUnsubscribeToken,
  normalizeEmailAddress,
  isMockTokenExpired,
  type MockUnsubscribeTokenRecord,
} from './suppressionToken.js';
import { getDefaultMailOperationsTenantId } from './tenantResolver.js';
import { SuppressionStoreUnavailableError } from './suppressionTypes.js';
import {
  isSalesSuppressionGcsReadEnabled,
  resolveSalesSuppressionWriteSource,
  type SalesSuppressionWriteSource,
} from './salesSuppressionReadSource.js';
import {
  getGcsSuppressionReadCache,
  readGcsSuppressionStoreDocument,
  refreshGcsSuppressionReadCache,
  resolveSalesSuppressionGcsStoragePort,
} from './gcsSuppressionReadAdapter.js';
import { buildManualSuppressionRecord } from './buildManualSuppressionRecord.js';
import { createMailSuppressionStore } from './createMailSuppressionStore.js';
import { loadMailOpsRuntimeConfig } from './config/mailOpsRuntimeConfig.js';
import { validateMailOpsLiveReadiness } from './validateMailOpsLiveReadiness.js';

const EMPTY_STORE: MailSuppressionStoreDocument = {
  version: 1,
  records: [],
  updatedAt: new Date().toISOString(),
};

let storeOverride: MailSuppressionStoreDocument | null = null;
let forceSuppressionStoreUnavailableForTests = false;
let forceSuppressionStoreSaveFailureForTests = false;
const mockTokenRegistry = new Map<string, MockUnsubscribeTokenRecord>();

export function setSuppressionStoreUnavailableForTests(value: boolean): void {
  forceSuppressionStoreUnavailableForTests = value;
}

export function setSuppressionStoreSaveFailureForTests(value: boolean): void {
  forceSuppressionStoreSaveFailureForTests = value;
}

export function setSuppressionStoreOverrideForTests(store: MailSuppressionStoreDocument | null): void {
  storeOverride = store;
}

export function clearMockUnsubscribeTokenRegistryForTests(): void {
  mockTokenRegistry.clear();
}

export function getMockUnsubscribeTokenRegistrySize(): number {
  return mockTokenRegistry.size;
}

async function ensureStoreFile(): Promise<void> {
  const path = getMailSuppressionsPath();
  if (existsSync(path)) return;
  const dir = path.replace(/[/\\][^/\\]+$/, '');
  await mkdir(dir, { recursive: true });
  await writeFile(path, `${JSON.stringify(EMPTY_STORE, null, 2)}\n`, 'utf-8');
}

function hydrateSuppressionRecord(
  record: MailSuppression
): MailSuppression {
  const tenantId = record.tenantId?.trim() || getDefaultMailOperationsTenantId();
  const scope: SuppressionScope = record.scope ?? 'tenant';
  return { ...record, tenantId, scope };
}

function hydrateStore(doc: MailSuppressionStoreDocument): MailSuppressionStoreDocument {
  return {
    ...doc,
    records: (doc.records ?? []).map(hydrateSuppressionRecord),
  };
}

function loadLocalMailSuppressionStoreSync(): MailSuppressionStoreDocument {
  const path = getMailSuppressionsPath();
  if (!existsSync(path)) return { ...EMPTY_STORE };
  const raw = readFileSync(path, 'utf-8');
  const parsed = JSON.parse(raw) as MailSuppressionStoreDocument;
  if (!parsed.records || !Array.isArray(parsed.records)) {
    return { ...EMPTY_STORE };
  }
  return hydrateStore(parsed);
}

async function loadLocalMailSuppressionStore(): Promise<MailSuppressionStoreDocument> {
  await ensureStoreFile();
  const raw = await readFile(getMailSuppressionsPath(), 'utf-8');
  const parsed = JSON.parse(raw) as MailSuppressionStoreDocument;
  if (!parsed.records || !Array.isArray(parsed.records)) {
    return { ...EMPTY_STORE };
  }
  return hydrateStore(parsed);
}

export async function loadMailSuppressionStore(): Promise<MailSuppressionStoreDocument> {
  if (forceSuppressionStoreUnavailableForTests) {
    throw new SuppressionStoreUnavailableError();
  }
  if (storeOverride) return structuredClone(storeOverride);
  try {
    if (isSalesSuppressionGcsReadEnabled()) {
      return await refreshGcsSuppressionReadCache();
    }
    return await loadLocalMailSuppressionStore();
  } catch (err) {
    if (err instanceof SuppressionStoreUnavailableError) throw err;
    throw new SuppressionStoreUnavailableError();
  }
}

export function loadMailSuppressionStoreSync(): MailSuppressionStoreDocument {
  if (forceSuppressionStoreUnavailableForTests) {
    throw new SuppressionStoreUnavailableError();
  }
  if (storeOverride) return structuredClone(storeOverride);
  try {
    if (isSalesSuppressionGcsReadEnabled()) {
      const cached = getGcsSuppressionReadCache();
      if (!cached) {
        throw new SuppressionStoreUnavailableError();
      }
      return structuredClone(cached);
    }
    return loadLocalMailSuppressionStoreSync();
  } catch (err) {
    if (err instanceof SuppressionStoreUnavailableError) throw err;
    throw new SuppressionStoreUnavailableError();
  }
}

export async function refreshSalesSuppressionReadCache(): Promise<MailSuppressionStoreDocument> {
  if (!isSalesSuppressionGcsReadEnabled()) {
    return loadMailSuppressionStore();
  }
  return refreshGcsSuppressionReadCache();
}

export async function readSalesSuppressionStoreDocument(): Promise<MailSuppressionStoreDocument> {
  if (forceSuppressionStoreUnavailableForTests) {
    throw new SuppressionStoreUnavailableError();
  }
  if (storeOverride) return structuredClone(storeOverride);
  if (isSalesSuppressionGcsReadEnabled()) {
    return readGcsSuppressionStoreDocument();
  }
  return loadLocalMailSuppressionStore();
}

export async function persistMailSuppressionStoreDocument(
  store: MailSuppressionStoreDocument
): Promise<void> {
  await saveStore(store);
}

async function saveStore(store: MailSuppressionStoreDocument): Promise<void> {
  if (forceSuppressionStoreSaveFailureForTests) {
    throw new SuppressionStoreUnavailableError('配信禁止リストへの保存に失敗しました');
  }
  const next: MailSuppressionStoreDocument = {
    ...store,
    updatedAt: new Date().toISOString(),
  };
  if (storeOverride) {
    storeOverride = structuredClone(next);
    return;
  }
  await ensureStoreFile();
  await writeFile(getMailSuppressionsPath(), `${JSON.stringify(next, null, 2)}\n`, 'utf-8');
}

export function findActiveSuppressionByEmail(
  store: MailSuppressionStoreDocument,
  input: { tenantId: string; normalizedEmail: string }
): MailSuppression | null {
  const tenantId = input.tenantId.trim();
  const normalized = input.normalizedEmail.trim();
  if (!tenantId || !normalized) return null;

  const active = store.records.filter((r) => {
    const record = hydrateSuppressionRecord(r);
    if (record.reactivatedAt) return false;
    if (record.scope === 'platform') {
      return record.normalizedEmail === normalized;
    }
    return record.tenantId === tenantId && record.normalizedEmail === normalized;
  });
  if (active.length === 0) return null;
  return active.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null;
}

export function findActiveSuppressionByLeadId(
  store: MailSuppressionStoreDocument,
  input: { tenantId: string; leadId: string }
): MailSuppression | null {
  const tenantId = input.tenantId.trim();
  const leadId = input.leadId.trim();
  if (!tenantId || !leadId) return null;
  const active = store.records.filter((r) => {
    const record = hydrateSuppressionRecord(r);
    return record.tenantId === tenantId && record.leadId === leadId && !record.reactivatedAt;
  });
  if (active.length === 0) return null;
  return active.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null;
}

export async function listMailSuppressions(tenantId: string): Promise<MailSuppression[]> {
  const store = await loadMailSuppressionStore();
  const scoped = store.records.filter((r) => {
    const record = hydrateSuppressionRecord(r);
    return record.scope === 'platform' || record.tenantId === tenantId;
  });
  return [...scoped].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export interface ManualSuppressionInput {
  tenantId: string;
  emailAddress: string;
  leadId?: string;
  companyId?: string;
  companyName?: string;
  reason: string;
  status?: MailSuppressionStatus;
  source?: MailSuppressionSource;
  scope?: SuppressionScope;
}

export interface ManualSuppressionResult {
  record: MailSuppression;
  created: boolean;
  writeSource: SalesSuppressionWriteSource;
}

async function persistManualSuppressionToLocal(
  record: MailSuppression
): Promise<{ record: MailSuppression; created: boolean }> {
  const store = storeOverride
    ? structuredClone(storeOverride)
    : await loadLocalMailSuppressionStore();
  const tenantId = record.tenantId?.trim() || getDefaultMailOperationsTenantId();
  const existing = findActiveSuppressionByEmail(store, {
    tenantId,
    normalizedEmail: record.normalizedEmail,
  });
  if (existing) {
    return { record: existing, created: false };
  }
  store.records.push(record);
  await saveStore(store);
  return { record, created: true };
}

async function persistManualSuppressionToGcs(
  record: MailSuppression
): Promise<{ record: MailSuppression; created: boolean }> {
  const config = loadMailOpsRuntimeConfig();
  const readiness = validateMailOpsLiveReadiness({ ...config, mode: 'live' });
  if (!readiness.ready) {
    throw new SuppressionStoreUnavailableError();
  }
  const storage = resolveSalesSuppressionGcsStoragePort();
  const store = createMailSuppressionStore({
    mode: 'live',
    gcsStorage: storage,
    env: process.env,
    config: { ...config, mode: 'live' },
  });
  const tenantId = record.tenantId?.trim() || getDefaultMailOperationsTenantId();
  const existing = await store.findActive({
    tenantId,
    normalizedEmail: record.normalizedEmail,
  });
  const saved = await store.add(record);
  await refreshGcsSuppressionReadCache({ storage });
  return { record: saved, created: !existing };
}

export async function addManualSuppression(input: ManualSuppressionInput): Promise<ManualSuppressionResult> {
  const writeSource = resolveSalesSuppressionWriteSource();
  const record = buildManualSuppressionRecord({
    ...input,
    source: input.source ?? 'manual',
    status: input.status ?? 'manually_blocked',
  });

  if (writeSource === 'gcs') {
    const { record: saved, created } = await persistManualSuppressionToGcs(record);
    return { record: saved, created, writeSource: 'gcs' };
  }

  const { record: saved, created } = await persistManualSuppressionToLocal(record);
  return { record: saved, created, writeSource: 'local' };
}

export async function addSuppressionFromReplyOptOut(
  input: Omit<ManualSuppressionInput, 'source' | 'status'> & { leadId: string }
): Promise<ManualSuppressionResult> {
  return addManualSuppression({
    ...input,
    source: 'reply_opt_out',
    status: 'manually_blocked',
    reason: input.reason.trim() || '返信による停止希望',
  });
}

export async function reactivateSuppression(input: {
  suppressionId: string;
  reactivationMemo: string;
}): Promise<MailSuppression | null> {
  const store = await loadMailSuppressionStore();
  const idx = store.records.findIndex((r) => r.suppressionId === input.suppressionId);
  if (idx === -1) return null;
  const now = new Date().toISOString();
  const updated: MailSuppression = {
    ...store.records[idx],
    reactivatedAt: now,
    reactivatedBy: 'human',
    reactivationMemo: input.reactivationMemo.trim(),
    updatedAt: now,
  };
  store.records[idx] = updated;
  await saveStore(store);
  return updated;
}

export async function recordSuppressionFromUnsubscribe(input: {
  tenantId: string;
  emailAddress: string;
  leadId?: string;
  companyId?: string;
  tokenHash: string;
  scope?: SuppressionScope;
}): Promise<{ record: MailSuppression; created: boolean }> {
  const store = await loadMailSuppressionStore();
  const tenantId = input.tenantId.trim();
  const normalizedEmail = normalizeEmailAddress(input.emailAddress);
  const scope: SuppressionScope = input.scope ?? 'tenant';
  const existing = findActiveSuppressionByEmail(store, { tenantId, normalizedEmail });
  const now = new Date().toISOString();
  if (existing) {
    const idx = store.records.findIndex((r) => r.suppressionId === existing.suppressionId);
    store.records[idx] = {
      ...existing,
      updatedAt: now,
      lastAttemptBlockedAt: existing.lastAttemptBlockedAt,
    };
    await saveStore(store);
    return { record: store.records[idx], created: false };
  }
  const record: MailSuppression = {
    suppressionId: randomUUID(),
    tenantId,
    scope,
    companyId: input.companyId,
    leadId: input.leadId,
    emailAddress: input.emailAddress.trim(),
    normalizedEmail,
    status: 'unsubscribed',
    reason: '本人による配信停止',
    source: 'unsubscribe_link',
    tokenHash: input.tokenHash,
    unsubscribedAt: now,
    createdAt: now,
    updatedAt: now,
  };
  store.records.push(record);
  await saveStore(store);
  return { record, created: true };
}

export function registerMockUnsubscribeToken(input: {
  tenantId: string;
  leadId?: string;
  companyId?: string;
  emailAddress: string;
  ttlMs?: number;
}): { token: string; previewPath: string } {
  const { token, record } = createMockUnsubscribeTokenRecord(input);
  mockTokenRegistry.set(record.tokenHash, record);
  return {
    token,
    previewPath: `/api/mock/unsubscribe/${encodeURIComponent(token)}`,
  };
}

export function resolveMockUnsubscribeToken(token: string): MockUnsubscribeTokenRecord | null {
  const hash = hashUnsubscribeToken(token);
  return mockTokenRegistry.get(hash) ?? null;
}

export function consumeMockUnsubscribeToken(token: string): void {
  const hash = hashUnsubscribeToken(token);
  mockTokenRegistry.delete(hash);
}

export type MockUnsubscribeResult =
  | { ok: true; status: 'success'; alreadySuppressed: boolean; suppression: MailSuppression }
  | { ok: false; status: 'invalid_token' | 'expired_token'; message: string };

/** @deprecated Use postMockUnsubscribeScreen for screen-shaped responses. */
export async function confirmMockUnsubscribe(token: string): Promise<MockUnsubscribeResult> {
  const record = resolveMockUnsubscribeToken(token);
  if (!record) {
    return { ok: false, status: 'invalid_token', message: 'リンクが無効です' };
  }
  if (isMockTokenExpired(record)) {
    mockTokenRegistry.delete(record.tokenHash);
    return { ok: false, status: 'expired_token', message: 'リンクの有効期限が切れています' };
  }
  try {
    const { record: suppression, created } = await recordSuppressionFromUnsubscribe({
      tenantId: record.tenantId,
      emailAddress: record.emailAddress,
      leadId: record.leadId,
      companyId: record.companyId,
      tokenHash: record.tokenHash,
    });
    consumeMockUnsubscribeToken(token);
    return { ok: true, status: 'success', alreadySuppressed: !created, suppression };
  } catch (err) {
    if (err instanceof SuppressionStoreUnavailableError) {
      throw err;
    }
    throw new SuppressionStoreUnavailableError();
  }
}

export async function touchLastAttemptBlocked(suppressionId: string): Promise<void> {
  const store = await loadMailSuppressionStore();
  const idx = store.records.findIndex((r) => r.suppressionId === suppressionId);
  if (idx === -1) return;
  const now = new Date().toISOString();
  store.records[idx] = { ...store.records[idx], lastAttemptBlockedAt: now, updatedAt: now };
  await saveStore(store);
}
