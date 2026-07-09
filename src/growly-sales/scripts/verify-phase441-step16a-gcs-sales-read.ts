/**
 * Phase 44.1 Step 16A — GCS suppression read integration for sales pipeline.
 * In-memory only. No GCS writes, no Gmail, no token/URL/email output.
 */
import assert from 'node:assert';
import { serializeMailSuppressionsDocument } from '../mail-operations/gcsDocumentParser.js';
import { MAIL_OPS_SUPPRESSIONS_LOGICAL } from '../mail-operations/mailOpsPaths.js';
import { InMemoryGcsJsonStorage } from '../mail-operations/gcsJsonStoragePort.js';

const FIXTURE_NORMALIZED = 'blocked@fixture.verify';

function ok(message: string): void {
  console.log(`  ✅ ${message}`);
}

function section(title: string): void {
  console.log(`\n— ${title}`);
}

function buildGcsSuppressionFixture() {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1 as const,
    updatedAt: now,
    records: [
      {
        suppressionId: 'verify-16a-blocked-1',
        tenantId: 'want-reach',
        scope: 'tenant' as const,
        emailAddress: 'blocked@fixture.verify',
        normalizedEmail: FIXTURE_NORMALIZED,
        status: 'unsubscribed' as const,
        reason: '配信停止リンクからの停止',
        source: 'unsubscribe_link' as const,
        createdAt: now,
        updatedAt: now,
      },
    ],
  };
}

function liveGcsEnv(): NodeJS.ProcessEnv {
  return {
    MAIL_OPS_MODE: 'live',
    GROWLY_STORAGE_BACKEND: 'gcs',
    GROWLY_GCS_BUCKET: 'verify-bucket',
    GROWLY_GCS_PREFIX: 'verify/prefix',
  };
}

async function verifyReadSourceResolution(): Promise<void> {
  const { resolveSalesSuppressionReadSource } = await import(
    '../mail-operations/salesSuppressionReadSource.js'
  );

  assert.strictEqual(
    resolveSalesSuppressionReadSource({ MAIL_OPS_MODE: 'mock' } as NodeJS.ProcessEnv),
    'local'
  );
  assert.strictEqual(
    resolveSalesSuppressionReadSource({
      MAIL_OPS_MODE: 'live',
      GROWLY_STORAGE_BACKEND: 'local',
    } as NodeJS.ProcessEnv),
    'local'
  );
  assert.strictEqual(
    resolveSalesSuppressionReadSource({
      MAIL_OPS_MODE: 'live',
      GROWLY_STORAGE_BACKEND: 'gcs',
      GROWLY_GCS_BUCKET: 'b',
      GROWLY_GCS_PREFIX: 'p',
    } as NodeJS.ProcessEnv),
    'gcs'
  );
  ok('resolveSalesSuppressionReadSource: local default, gcs when live+gcs env');
}

async function withLiveGcsHarness<T>(
  run: (ctx: { storage: InMemoryGcsJsonStorage; env: NodeJS.ProcessEnv }) => Promise<T>
): Promise<T> {
  const env = liveGcsEnv();
  const prevEnv = { ...process.env };
  // Important: Object.assign cannot remove keys, so restore must explicitly clean up keys we set.
  Object.assign(process.env, env);

  const storage = new InMemoryGcsJsonStorage();
  storage.seedLogical(
    MAIL_OPS_SUPPRESSIONS_LOGICAL,
    serializeMailSuppressionsDocument(buildGcsSuppressionFixture())
  );

  const {
    setGcsSuppressionReadStoragePortForTests,
    clearGcsSuppressionReadCacheForTests,
    setSuppressionStoreOverrideForTests,
  } = await import('../mail-operations/index.js');

  setGcsSuppressionReadStoragePortForTests(storage);
  setSuppressionStoreOverrideForTests(null);
  clearGcsSuppressionReadCacheForTests();

  try {
    return await run({ storage, env });
  } finally {
    setGcsSuppressionReadStoragePortForTests(null);
    clearGcsSuppressionReadCacheForTests();
    setSuppressionStoreOverrideForTests(null);
    for (const key of Object.keys(env)) {
      if (!(key in prevEnv)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, prevEnv);
  }
}

async function verifyAsyncGcsReadPopulatesPipelineStore(): Promise<void> {
  await withLiveGcsHarness(async () => {
    const { loadMailSuppressionStore } = await import('../mail-operations/index.js');
    const store = await loadMailSuppressionStore();
    assert.strictEqual(store.version, 1);
    assert.strictEqual(store.records.length, 1);
    assert.strictEqual(store.records[0]?.normalizedEmail, FIXTURE_NORMALIZED);
    ok('loadMailSuppressionStore reads GCS canonical (async)');
  });
}

async function verifySyncFailsClosedWithoutCache(): Promise<void> {
  await withLiveGcsHarness(async () => {
    const { loadMailSuppressionStoreSync, SuppressionStoreUnavailableError } = await import(
      '../mail-operations/index.js'
    );
    let threw = false;
    try {
      loadMailSuppressionStoreSync();
    } catch (err) {
      threw = err instanceof SuppressionStoreUnavailableError;
    }
    assert(threw, 'sync without warmed cache fails closed');
    ok('loadMailSuppressionStoreSync fails closed when GCS cache not warmed');
  });
}

async function verifySyncUsesWarmedCache(): Promise<void> {
  await withLiveGcsHarness(async () => {
    const { loadMailSuppressionStore, loadMailSuppressionStoreSync } = await import(
      '../mail-operations/index.js'
    );
    await loadMailSuppressionStore();
    const store = loadMailSuppressionStoreSync();
    assert.strictEqual(store.records[0]?.normalizedEmail, FIXTURE_NORMALIZED);
    ok('loadMailSuppressionStoreSync uses warmed GCS read cache');
  });
}

async function verifyAssertNotSuppressedUsesGcsRead(): Promise<void> {
  await withLiveGcsHarness(async () => {
    const {
      loadMailSuppressionStore,
      assertNotSuppressed,
      SuppressionBlockedError,
    } = await import('../mail-operations/index.js');

    await loadMailSuppressionStore();
    let threw = false;
    try {
      assertNotSuppressed({
        tenantId: 'want-reach',
        emailAddress: 'blocked@fixture.verify',
        operation: 'generate_sales_copy',
      });
    } catch (err) {
      threw = err instanceof SuppressionBlockedError;
    }
    assert(threw, 'GCS-backed suppression blocks assertNotSuppressed');
    ok('assertNotSuppressed blocks email from GCS canonical read path');
  });
}

async function verifyGcsReadFailureFailsClosed(): Promise<void> {
  await withLiveGcsHarness(async () => {
    const { loadMailSuppressionStore, SuppressionStoreUnavailableError } = await import(
      '../mail-operations/index.js'
    );
    const { setGcsSuppressionReadStoragePortForTests } = await import(
      '../mail-operations/gcsSuppressionReadAdapter.js'
    );
    const failingStorage = new InMemoryGcsJsonStorage();
    failingStorage.seedLogical(MAIL_OPS_SUPPRESSIONS_LOGICAL, '{ invalid json');

    setGcsSuppressionReadStoragePortForTests(failingStorage);

    let threw = false;
    try {
      await loadMailSuppressionStore();
    } catch (err) {
      threw = err instanceof SuppressionStoreUnavailableError;
    }
    assert(threw, 'unreadable GCS object fails closed');
    ok('GCS read failure fails closed for sales pipeline');
  });
}

async function verifyMockModeUnchanged(): Promise<void> {
  const prevEnv = { ...process.env };
  // Ensure previous live env does not leak into this section.
  delete process.env.GROWLY_STORAGE_BACKEND;
  delete process.env.GROWLY_GCS_BUCKET;
  delete process.env.GROWLY_GCS_PREFIX;
  process.env.MAIL_OPS_MODE = 'mock';
  const {
    setGcsSuppressionReadStoragePortForTests,
    clearGcsSuppressionReadCacheForTests,
    setSuppressionStoreOverrideForTests,
    loadMailSuppressionStoreSync,
  } = await import('../mail-operations/index.js');

  setGcsSuppressionReadStoragePortForTests(null);
  clearGcsSuppressionReadCacheForTests();
  setSuppressionStoreOverrideForTests({ version: 1, records: [], updatedAt: new Date().toISOString() });

  try {
    const store = loadMailSuppressionStoreSync();
    assert.ok(Array.isArray(store.records), 'store.records should be array');
    ok('mock/local default loadMailSuppressionStoreSync unchanged');
  } finally {
    setSuppressionStoreOverrideForTests(null);
    for (const key of ['MAIL_OPS_MODE', 'GROWLY_STORAGE_BACKEND', 'GROWLY_GCS_BUCKET', 'GROWLY_GCS_PREFIX']) {
      if (!(key in prevEnv)) delete process.env[key];
    }
    Object.assign(process.env, prevEnv);
  }
}

async function main(): Promise<void> {
  console.log('Growly Sales — Verify Phase 44.1 Step 16A GCS sales read');
  console.log('==========================================================');

  section('Read source resolution');
  await verifyReadSourceResolution();

  section('GCS canonical read (in-memory)');
  await verifyAsyncGcsReadPopulatesPipelineStore();
  await verifySyncFailsClosedWithoutCache();
  await verifySyncUsesWarmedCache();
  await verifyAssertNotSuppressedUsesGcsRead();
  await verifyGcsReadFailureFailsClosed();

  section('Default behavior');
  await verifyMockModeUnchanged();

  console.log('\nAll Phase 44.1 Step 16A verifications passed ✅');
}

main().catch((err) => {
  console.error('Verify fatal error:', err);
  process.exit(1);
});
