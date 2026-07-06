import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import {
  getEmailOpenEventsPath,
  getEmailSendTrackingPath,
} from '../config/paths.js';
import type {
  EmailOpenEvent,
  EmailOpenEventStore,
  EmailSendTracking,
  EmailSendTrackingStore,
  LeadOpenStats,
  ReferenceOpenRateMetrics,
} from './openTrackingTypes.js';
import {
  categorizeUserAgent,
  shortenUserAgent,
} from './openTrackingPrivacy.js';
import {
  applyOpenEventToTracking,
  buildOpenEventFromInput,
} from './openTrackingAggregator.js';
import {
  createMockOpenTrackingTokenRecord,
  hashOpenTrackingToken,
  type MockOpenTrackingTokenRecord,
} from './openTrackingToken.js';
import { normalizeEmailAddress } from './suppressionToken.js';
import type { Lead } from '../types/lead.js';
import type { ManualGmailSendPreview } from '../workflow/recordManualGmailSent.js';
import {
  assertMockOpenEventAllowed,
  buildLeadOpenStats,
  buildManualGmailSendRecordId,
  buildReferenceOpenRateMetrics,
} from './openTrackingPolicy.js';
import { checkNotSuppressed } from './suppressionPolicy.js';

const EMPTY_EVENT_STORE: EmailOpenEventStore = {
  version: 1,
  events: [],
  updatedAt: new Date().toISOString(),
};

const EMPTY_TRACKING_STORE: EmailSendTrackingStore = {
  version: 1,
  records: [],
  updatedAt: new Date().toISOString(),
};

let eventStoreOverride: EmailOpenEventStore | null = null;
let trackingStoreOverride: EmailSendTrackingStore | null = null;
const mockTokenRegistry = new Map<string, MockOpenTrackingTokenRecord>();

export function setOpenTrackingStoreOverrideForTests(input: {
  events?: EmailOpenEventStore | null;
  tracking?: EmailSendTrackingStore | null;
}): void {
  eventStoreOverride = input.events ?? null;
  trackingStoreOverride = input.tracking ?? null;
}

export function clearMockOpenTrackingTokenRegistryForTests(): void {
  mockTokenRegistry.clear();
}

async function ensureJsonFile(path: string, empty: object): Promise<void> {
  if (existsSync(path)) return;
  const dir = path.replace(/[/\\][^/\\]+$/, '');
  await mkdir(dir, { recursive: true });
  await writeFile(path, `${JSON.stringify(empty, null, 2)}\n`, 'utf-8');
}

export async function loadEmailOpenEventStore(): Promise<EmailOpenEventStore> {
  if (eventStoreOverride) return structuredClone(eventStoreOverride);
  await ensureJsonFile(getEmailOpenEventsPath(), EMPTY_EVENT_STORE);
  const raw = await readFile(getEmailOpenEventsPath(), 'utf-8');
  const parsed = JSON.parse(raw) as EmailOpenEventStore;
  if (!parsed.events || !Array.isArray(parsed.events)) return { ...EMPTY_EVENT_STORE };
  return parsed;
}

export function loadEmailOpenEventStoreSync(): EmailOpenEventStore {
  if (eventStoreOverride) return structuredClone(eventStoreOverride);
  const path = getEmailOpenEventsPath();
  if (!existsSync(path)) return { ...EMPTY_EVENT_STORE };
  const parsed = JSON.parse(readFileSync(path, 'utf-8')) as EmailOpenEventStore;
  if (!parsed.events || !Array.isArray(parsed.events)) return { ...EMPTY_EVENT_STORE };
  return parsed;
}

export async function loadEmailSendTrackingStore(): Promise<EmailSendTrackingStore> {
  if (trackingStoreOverride) return structuredClone(trackingStoreOverride);
  await ensureJsonFile(getEmailSendTrackingPath(), EMPTY_TRACKING_STORE);
  const raw = await readFile(getEmailSendTrackingPath(), 'utf-8');
  const parsed = JSON.parse(raw) as EmailSendTrackingStore;
  if (!parsed.records || !Array.isArray(parsed.records)) return { ...EMPTY_TRACKING_STORE };
  return parsed;
}

export function loadEmailSendTrackingStoreSync(): EmailSendTrackingStore {
  if (trackingStoreOverride) return structuredClone(trackingStoreOverride);
  const path = getEmailSendTrackingPath();
  if (!existsSync(path)) return { ...EMPTY_TRACKING_STORE };
  const parsed = JSON.parse(readFileSync(path, 'utf-8')) as EmailSendTrackingStore;
  if (!parsed.records || !Array.isArray(parsed.records)) return { ...EMPTY_TRACKING_STORE };
  return parsed;
}

async function saveEventStore(store: EmailOpenEventStore): Promise<void> {
  const next = { ...store, updatedAt: new Date().toISOString() };
  if (eventStoreOverride) {
    eventStoreOverride = structuredClone(next);
    return;
  }
  await ensureJsonFile(getEmailOpenEventsPath(), EMPTY_EVENT_STORE);
  await writeFile(getEmailOpenEventsPath(), `${JSON.stringify(next, null, 2)}\n`, 'utf-8');
}

async function saveTrackingStore(store: EmailSendTrackingStore): Promise<void> {
  const next = { ...store, updatedAt: new Date().toISOString() };
  if (trackingStoreOverride) {
    trackingStoreOverride = structuredClone(next);
    return;
  }
  await ensureJsonFile(getEmailSendTrackingPath(), EMPTY_TRACKING_STORE);
  await writeFile(getEmailSendTrackingPath(), `${JSON.stringify(next, null, 2)}\n`, 'utf-8');
}

export function findTrackingByLeadId(
  store: EmailSendTrackingStore,
  leadId: string
): EmailSendTracking | null {
  const sendRecordId = buildManualGmailSendRecordId(leadId);
  return (
    store.records.find((r) => r.leadId === leadId) ??
    store.records.find((r) => r.sendRecordId === sendRecordId) ??
    null
  );
}

export function findTrackingByTokenHash(
  store: EmailSendTrackingStore,
  tokenHash: string
): EmailSendTracking | null {
  return store.records.find((r) => r.tokenHash === tokenHash) ?? null;
}

export async function createMockSendTrackingForManualGmailSend(
  lead: Lead,
  preview: ManualGmailSendPreview,
  sentAt: string
): Promise<{ tracking: EmailSendTracking | null; mockToken: string }> {
  const suppressed = checkNotSuppressed({
    emailAddress: preview.to,
    leadId: lead.id,
    lead,
    operation: 'create_gmail_draft',
  });
  if (!suppressed.allowed) {
    return { tracking: null, mockToken: '' };
  }

  const store = await loadEmailSendTrackingStore();
  const sendRecordId = buildManualGmailSendRecordId(lead.id);
  const existing = store.records.find((r) => r.sendRecordId === sendRecordId);
  if (existing) {
    return { tracking: existing, mockToken: '' };
  }

  const trackingId = randomUUID();
  const { token, record } = createMockOpenTrackingTokenRecord({
    trackingId,
    sendRecordId,
    leadId: lead.id,
  });
  mockTokenRegistry.set(token, record);

  const now = sentAt;
  const tracking: EmailSendTracking = {
    trackingId,
    sendRecordId,
    companyId: lead.companyName,
    leadId: lead.id,
    normalizedEmail: normalizeEmailAddress(preview.to),
    tokenHash: record.tokenHash,
    status: 'mock',
    sentAt: now,
    openCount: 0,
    uniqueOpenCount: 0,
    rawEventCount: 0,
    privacyProxySuspected: false,
    createdAt: now,
    updatedAt: now,
  };

  await saveTrackingStore({
    ...store,
    records: [...store.records, tracking],
  });

  return { tracking, mockToken: token };
}

export async function recordMockOpenEvent(input: {
  token?: string;
  tokenHash?: string;
  userAgent?: string;
  receivedAt?: string;
}): Promise<{ event: EmailOpenEvent; tracking: EmailSendTracking }> {
  assertMockOpenEventAllowed();

  const token = input.token?.trim();
  const tokenHash = token ? hashOpenTrackingToken(token) : input.tokenHash?.trim();
  if (!tokenHash) {
    throw new Error('token または tokenHash が必要です');
  }

  const trackingStore = await loadEmailSendTrackingStore();
  const tracking = findTrackingByTokenHash(trackingStore, tokenHash);
  if (!tracking) {
    throw new Error('該当する送信記録のトラッキングが見つかりません');
  }
  if (tracking.status === 'tracking_disabled') {
    throw new Error('この送信は開封計測が無効です');
  }

  const receivedAt = input.receivedAt ?? new Date().toISOString();
  const userAgent = shortenUserAgent(input.userAgent ?? 'mock-ui-agent');
  const userAgentCategory = categorizeUserAgent(userAgent);

  const event = buildOpenEventFromInput({
    eventId: randomUUID(),
    tracking,
    receivedAt,
    userAgent,
    userAgentCategory,
  });

  const eventStore = await loadEmailOpenEventStore();
  await saveEventStore({
    ...eventStore,
    events: [...eventStore.events, event],
  });

  const updatedTracking = applyOpenEventToTracking(tracking, event);
  const nextRecords = trackingStore.records.map((r) =>
    r.trackingId === updatedTracking.trackingId ? updatedTracking : r
  );
  await saveTrackingStore({ ...trackingStore, records: nextRecords });

  return { event, tracking: updatedTracking };
}

export async function getLeadOpenStats(leadId: string): Promise<LeadOpenStats> {
  const store = await loadEmailSendTrackingStore();
  const tracking = findTrackingByLeadId(store, leadId);
  return buildLeadOpenStats(tracking, leadId);
}

export async function getOpenStatsForLeadIds(leadIds: string[]): Promise<LeadOpenStats[]> {
  const store = await loadEmailSendTrackingStore();
  return leadIds.map((leadId) =>
    buildLeadOpenStats(findTrackingByLeadId(store, leadId), leadId)
  );
}

export async function getReferenceOpenRateMetrics(): Promise<ReferenceOpenRateMetrics> {
  const store = await loadEmailSendTrackingStore();
  return buildReferenceOpenRateMetrics(store.records);
}

export function getReferenceOpenRateMetricsSync(): ReferenceOpenRateMetrics {
  const store = loadEmailSendTrackingStoreSync();
  return buildReferenceOpenRateMetrics(store.records);
}

export function registerMockOpenTrackingTokenForTests(
  token: string,
  record: MockOpenTrackingTokenRecord
): void {
  mockTokenRegistry.set(token, record);
}

export function resolveMockOpenTrackingToken(token: string): MockOpenTrackingTokenRecord | null {
  return mockTokenRegistry.get(token) ?? null;
}
