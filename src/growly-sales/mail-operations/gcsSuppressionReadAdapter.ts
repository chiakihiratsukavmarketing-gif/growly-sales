import type { MailSuppressionStoreDocument } from './suppressionTypes.js';
import type { MailSuppressionsDocument } from './gcsDocumentTypes.js';
import { SuppressionStoreUnavailableError } from './suppressionTypes.js';
import type { GcsJsonStoragePort } from './gcsJsonStoragePort.js';
import { createDefaultGcsJsonStoragePort } from './gcsJsonStoragePort.js';
import { parseMailSuppressionsDocument } from './gcsDocumentParser.js';
import { MAIL_OPS_SUPPRESSIONS_LOGICAL } from './mailOpsPaths.js';

export function gcsSuppressionsDocumentToStoreDocument(
  doc: MailSuppressionsDocument
): MailSuppressionStoreDocument {
  return {
    version: 1,
    updatedAt: doc.updatedAt,
    records: doc.records,
  };
}

export async function readGcsSuppressionStoreDocument(input: {
  storage?: GcsJsonStoragePort;
} = {}): Promise<MailSuppressionStoreDocument> {
  const storage = resolveGcsSuppressionReadStorage(input);
  try {
    const raw = await storage.readJson(MAIL_OPS_SUPPRESSIONS_LOGICAL);
    const parsed = parseMailSuppressionsDocument(raw);
    return gcsSuppressionsDocumentToStoreDocument(parsed);
  } catch (err) {
    if (err instanceof SuppressionStoreUnavailableError) throw err;
    throw new SuppressionStoreUnavailableError();
  }
}

let gcsSuppressionReadCache: MailSuppressionStoreDocument | null = null;
let gcsSuppressionReadStorageOverride: GcsJsonStoragePort | null = null;

export function setGcsSuppressionReadStoragePortForTests(
  storage: GcsJsonStoragePort | null
): void {
  gcsSuppressionReadStorageOverride = storage;
}

function resolveGcsSuppressionReadStorage(input?: {
  storage?: GcsJsonStoragePort;
}): GcsJsonStoragePort {
  if (input?.storage) return input.storage;
  if (gcsSuppressionReadStorageOverride) return gcsSuppressionReadStorageOverride;
  return createDefaultGcsJsonStoragePort();
}

export function getGcsSuppressionReadCache(): MailSuppressionStoreDocument | null {
  return gcsSuppressionReadCache;
}

export function setGcsSuppressionReadCacheForTests(
  doc: MailSuppressionStoreDocument | null
): void {
  gcsSuppressionReadCache = doc ? structuredClone(doc) : null;
}

export function clearGcsSuppressionReadCacheForTests(): void {
  gcsSuppressionReadCache = null;
}

export async function refreshGcsSuppressionReadCache(input: {
  storage?: GcsJsonStoragePort;
} = {}): Promise<MailSuppressionStoreDocument> {
  const doc = await readGcsSuppressionStoreDocument(input);
  gcsSuppressionReadCache = structuredClone(doc);
  return structuredClone(doc);
}
