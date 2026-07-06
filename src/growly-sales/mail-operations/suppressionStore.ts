import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { getMailSuppressionsPath } from '../config/paths.js';
import type {
  MailSuppression,
  MailSuppressionSource,
  MailSuppressionStatus,
  MailSuppressionStore,
} from './suppressionTypes.js';
import {
  createMockUnsubscribeTokenRecord,
  hashUnsubscribeToken,
  normalizeEmailAddress,
  isMockTokenExpired,
  type MockUnsubscribeTokenRecord,
} from './suppressionToken.js';

const EMPTY_STORE: MailSuppressionStore = {
  version: 1,
  records: [],
  updatedAt: new Date().toISOString(),
};

let storeOverride: MailSuppressionStore | null = null;
const mockTokenRegistry = new Map<string, MockUnsubscribeTokenRecord>();

export function setSuppressionStoreOverrideForTests(store: MailSuppressionStore | null): void {
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

export async function loadMailSuppressionStore(): Promise<MailSuppressionStore> {
  if (storeOverride) return structuredClone(storeOverride);
  await ensureStoreFile();
  const raw = await readFile(getMailSuppressionsPath(), 'utf-8');
  const parsed = JSON.parse(raw) as MailSuppressionStore;
  if (!parsed.records || !Array.isArray(parsed.records)) {
    return { ...EMPTY_STORE };
  }
  return parsed;
}

export function loadMailSuppressionStoreSync(): MailSuppressionStore {
  if (storeOverride) return structuredClone(storeOverride);
  const path = getMailSuppressionsPath();
  if (!existsSync(path)) return { ...EMPTY_STORE };
  const raw = readFileSync(path, 'utf-8');
  const parsed = JSON.parse(raw) as MailSuppressionStore;
  if (!parsed.records || !Array.isArray(parsed.records)) {
    return { ...EMPTY_STORE };
  }
  return parsed;
}

async function saveStore(store: MailSuppressionStore): Promise<void> {
  const next: MailSuppressionStore = {
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
  store: MailSuppressionStore,
  emailAddress: string
): MailSuppression | null {
  const normalized = normalizeEmailAddress(emailAddress);
  if (!normalized) return null;
  const active = store.records.filter(
    (r) => r.normalizedEmail === normalized && !r.reactivatedAt
  );
  if (active.length === 0) return null;
  return active.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null;
}

export function findActiveSuppressionByLeadId(
  store: MailSuppressionStore,
  leadId: string
): MailSuppression | null {
  const active = store.records.filter((r) => r.leadId === leadId && !r.reactivatedAt);
  if (active.length === 0) return null;
  return active.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null;
}

export async function listMailSuppressions(): Promise<MailSuppression[]> {
  const store = await loadMailSuppressionStore();
  return [...store.records].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function addManualSuppression(input: {
  emailAddress: string;
  leadId?: string;
  companyId?: string;
  companyName?: string;
  reason: string;
  status?: MailSuppressionStatus;
}): Promise<MailSuppression> {
  const store = await loadMailSuppressionStore();
  const normalizedEmail = normalizeEmailAddress(input.emailAddress);
  const existing = findActiveSuppressionByEmail(store, input.emailAddress);
  if (existing) {
    return existing;
  }
  const now = new Date().toISOString();
  const record: MailSuppression = {
    suppressionId: randomUUID(),
    companyId: input.companyId,
    leadId: input.leadId,
    emailAddress: input.emailAddress.trim(),
    normalizedEmail,
    status: input.status ?? 'manually_blocked',
    reason: input.reason.trim() || '手動による配信禁止',
    source: 'manual',
    createdAt: now,
    updatedAt: now,
    unsubscribedAt: now,
  };
  store.records.push(record);
  await saveStore(store);
  return record;
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
  emailAddress: string;
  leadId?: string;
  companyId?: string;
  tokenHash: string;
}): Promise<{ record: MailSuppression; created: boolean }> {
  const store = await loadMailSuppressionStore();
  const normalizedEmail = normalizeEmailAddress(input.emailAddress);
  const existing = findActiveSuppressionByEmail(store, input.emailAddress);
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

export type MockUnsubscribeResult =
  | { ok: true; status: 'success'; alreadySuppressed: boolean; suppression: MailSuppression }
  | { ok: false; status: 'invalid_token' | 'expired_token'; message: string };

export async function confirmMockUnsubscribe(token: string): Promise<MockUnsubscribeResult> {
  const record = resolveMockUnsubscribeToken(token);
  if (!record) {
    return { ok: false, status: 'invalid_token', message: 'リンクが無効です' };
  }
  if (isMockTokenExpired(record)) {
    mockTokenRegistry.delete(record.tokenHash);
    return { ok: false, status: 'expired_token', message: 'リンクの有効期限が切れています' };
  }
  const { record: suppression, created } = await recordSuppressionFromUnsubscribe({
    emailAddress: record.emailAddress,
    leadId: record.leadId,
    companyId: record.companyId,
    tokenHash: record.tokenHash,
  });
  mockTokenRegistry.delete(record.tokenHash);
  return { ok: true, status: 'success', alreadySuppressed: !created, suppression };
}

export async function touchLastAttemptBlocked(suppressionId: string): Promise<void> {
  const store = await loadMailSuppressionStore();
  const idx = store.records.findIndex((r) => r.suppressionId === suppressionId);
  if (idx === -1) return;
  const now = new Date().toISOString();
  store.records[idx] = { ...store.records[idx], lastAttemptBlockedAt: now, updatedAt: now };
  await saveStore(store);
}
