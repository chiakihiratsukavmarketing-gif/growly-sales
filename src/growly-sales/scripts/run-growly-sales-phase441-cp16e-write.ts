/**
 * CP-16E-write — register exactly 1 test suppression on GCS canonical store.
 * No Gmail, no draft, no send, no token writes. Masked output only.
 */
import { ensureProjectEnvLoaded } from '../config/env.js';
import { maskEmailForDisplay } from '../mail-operations/emailDisplayPrivacy.js';
import { createDefaultGcsJsonStoragePort } from '../mail-operations/gcsJsonStoragePort.js';
import { parseMailSuppressionsDocument } from '../mail-operations/gcsDocumentParser.js';
import { MAIL_OPS_SUPPRESSIONS_LOGICAL } from '../mail-operations/mailOpsPaths.js';
import { buildGcsObjectPath } from '../config/storageBackend.js';
import {
  addSuppressionFromReplyOptOut,
  refreshSalesSuppressionReadCache,
} from '../mail-operations/suppressionStore.js';
import {
  assertNotSuppressed,
  SuppressionBlockedError,
  resolveSalesSuppressionWriteSource,
} from '../mail-operations/index.js';
import { isMailOpsLiveExternallyConnected } from '../mail-operations/config/mailOpsRuntimeConfig.js';

const DEFAULT_TEST_EMAIL = 'cp16e-write@fixture.verify';
const TEST_LEAD_ID = 'cp16e-write-verify-lead';

function resolveTestEmail(): string {
  const dedicated = process.env.CP16E_TEST_EMAIL?.trim();
  if (dedicated) return dedicated;
  return DEFAULT_TEST_EMAIL;
}

function safeLog(payload: Record<string, unknown>): void {
  console.log(JSON.stringify(payload));
}

function countActiveSuppressions(
  doc: ReturnType<typeof parseMailSuppressionsDocument>
): number {
  return doc.records.filter((r) => !r.reactivatedAt).length;
}

async function readSuppressionSnapshot(): Promise<{
  activeCount: number;
  totalRecords: number;
  generation: string | null;
}> {
  const storage = createDefaultGcsJsonStoragePort();
  const [raw, meta] = await Promise.all([
    storage.readJson(MAIL_OPS_SUPPRESSIONS_LOGICAL),
    storage.getMetadata(MAIL_OPS_SUPPRESSIONS_LOGICAL),
  ]);
  const doc = parseMailSuppressionsDocument(raw);
  return {
    activeCount: countActiveSuppressions(doc),
    totalRecords: doc.records.length,
    generation: meta?.generation ?? null,
  };
}

async function listRecentBackupCount(storage: ReturnType<typeof createDefaultGcsJsonStoragePort>): Promise<number> {
  const prefix = buildGcsObjectPath('mail-operations/backups/mail-suppressions/');
  const client = await import('@google-cloud/storage').then((m) => new m.Storage());
  const bucket = process.env.GROWLY_GCS_BUCKET?.trim();
  if (!bucket) return 0;
  const [files] = await client.bucket(bucket).getFiles({ prefix, maxResults: 100 });
  return files.length;
}

async function main(): Promise<void> {
  ensureProjectEnvLoaded();

  process.env.MAIL_OPS_MODE = process.env.MAIL_OPS_MODE?.trim() || 'live';
  process.env.GROWLY_STORAGE_BACKEND = process.env.GROWLY_STORAGE_BACKEND?.trim() || 'gcs';
  process.env.GROWLY_GCS_BUCKET = process.env.GROWLY_GCS_BUCKET?.trim() || 'growly-sales-daily30';
  process.env.GROWLY_GCS_PREFIX = process.env.GROWLY_GCS_PREFIX?.trim() || 'prod/growly-sales';
  process.env.PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL?.trim() || 'https://mailops.wantreach.jp';

  if (!process.env.UNSUBSCRIBE_TOKEN_PEPPER?.trim()) {
    safeLog({ phase: 'cp-16e-write', ok: false, error: 'missing_unsubscribe_token_pepper' });
    process.exit(1);
  }

  const writeSource = resolveSalesSuppressionWriteSource();
  if (writeSource !== 'gcs') {
    safeLog({ phase: 'cp-16e-write', ok: false, error: 'write_source_not_gcs', writeSource });
    process.exit(1);
  }

  const testEmail = resolveTestEmail();
  const maskedEmail = maskEmailForDisplay(testEmail);

  const before = await readSuppressionSnapshot();
  const storage = createDefaultGcsJsonStoragePort();
  const backupsBefore = await listRecentBackupCount(storage);

  const first = await addSuppressionFromReplyOptOut({
    tenantId: 'want-reach',
    emailAddress: testEmail,
    leadId: TEST_LEAD_ID,
    reason: 'CP-16E-write verify (返信による停止希望)',
  });

  const afterFirst = await readSuppressionSnapshot();
  const backupsAfterFirst = await listRecentBackupCount(storage);

  const cacheDoc = await refreshSalesSuppressionReadCache();
  const cacheHasTest = cacheDoc.records.some(
    (r) => !r.reactivatedAt && r.leadId === TEST_LEAD_ID
  );

  let blocked = false;
  try {
    assertNotSuppressed({
      tenantId: 'want-reach',
      emailAddress: testEmail,
      leadId: TEST_LEAD_ID,
      operation: 'generate_sales_copy',
    });
  } catch (err) {
    blocked = err instanceof SuppressionBlockedError;
  }

  const second = await addSuppressionFromReplyOptOut({
    tenantId: 'want-reach',
    emailAddress: testEmail,
    leadId: TEST_LEAD_ID,
    reason: 'CP-16E-write verify idempotent retry',
  });

  const afterSecond = await readSuppressionSnapshot();

  safeLog({
    phase: 'cp-16e-write',
    ok: blocked && cacheHasTest,
    liveConnected: isMailOpsLiveExternallyConnected(),
    writeSource: first.writeSource,
    maskedEmail,
    suppressionId: first.record.suppressionId,
    source: first.record.source,
    firstCreated: first.created,
    secondCreated: second.created,
    activeCountBefore: before.activeCount,
    activeCountAfterFirst: afterFirst.activeCount,
    activeCountAfterSecond: afterSecond.activeCount,
    totalRecordsBefore: before.totalRecords,
    totalRecordsAfter: afterSecond.totalRecords,
    generationBefore: before.generation,
    generationAfterFirst: afterFirst.generation,
    generationAfterSecond: afterSecond.generation,
    generationChanged: before.generation !== afterFirst.generation,
    backupObjectsBefore: backupsBefore,
    backupObjectsAfterFirst: backupsAfterFirst,
    backupCreated: backupsAfterFirst > backupsBefore,
    readCacheRefreshed: cacheHasTest,
    assertNotSuppressedBlocked: blocked,
    idempotentOnRetry: second.created === false,
    createDraftsExecuted: false,
    gmailDraftCreated: false,
    sendExecuted: false,
    tokensModified: false,
  });

  if (!blocked || !cacheHasTest) {
    process.exit(1);
  }
}

main().catch((err) => {
  safeLog({
    phase: 'cp-16e-write',
    ok: false,
    error: err instanceof Error ? err.name : 'unknown_error',
  });
  process.exit(1);
});
