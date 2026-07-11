/**
 * Phase 44.1 Step 16E — manual / reply_opt_out suppression GCS write path (in-memory).
 * No real GCS, no Gmail, no token/URL/full email output.
 */
import assert from 'node:assert';
import { serializeMailSuppressionsDocument } from '../mail-operations/gcsDocumentParser.js';
import { MAIL_OPS_SUPPRESSIONS_LOGICAL } from '../mail-operations/mailOpsPaths.js';
import { InMemoryGcsJsonStorage } from '../mail-operations/gcsJsonStoragePort.js';

const FIXTURE_DOMAIN = 'fixture.verify';
const FIXTURE_REPLY = `reply-stop@${FIXTURE_DOMAIN}`;

function ok(message: string): void {
  console.log(`  ✅ ${message}`);
}

function section(title: string): void {
  console.log(`\n— ${title}`);
}

function liveGcsEnv(): NodeJS.ProcessEnv {
  return {
    MAIL_OPS_MODE: 'live',
    GROWLY_STORAGE_BACKEND: 'gcs',
    GROWLY_GCS_BUCKET: 'verify-bucket',
    GROWLY_GCS_PREFIX: 'verify/prefix',
    UNSUBSCRIBE_TOKEN_PEPPER: 'verify-pepper-fixture',
    PUBLIC_BASE_URL: 'https://mailops.wantreach.jp',
  };
}

function emptyGcsDoc() {
  return {
    schemaVersion: 1 as const,
    updatedAt: new Date().toISOString(),
    records: [] as Array<Record<string, unknown>>,
  };
}

function restoreEnv(prevEnv: NodeJS.ProcessEnv, keysSet: Record<string, string>): void {
  for (const key of Object.keys(keysSet)) {
    if (!(key in prevEnv)) delete process.env[key];
  }
  Object.assign(process.env, prevEnv);
}

async function withLiveGcsHarness<T>(
  run: (ctx: { storage: InMemoryGcsJsonStorage }) => Promise<T>,
  seedDoc = emptyGcsDoc()
): Promise<T> {
  const prevEnv = { ...process.env };
  const env = liveGcsEnv();
  Object.assign(process.env, env);

  const storage = new InMemoryGcsJsonStorage();
  storage.seedLogical(MAIL_OPS_SUPPRESSIONS_LOGICAL, serializeMailSuppressionsDocument(seedDoc));

  const {
    setGcsSuppressionReadStoragePortForTests,
    clearGcsSuppressionReadCacheForTests,
    setSuppressionStoreOverrideForTests,
  } = await import('../mail-operations/index.js');

  setGcsSuppressionReadStoragePortForTests(storage);
  setSuppressionStoreOverrideForTests(null);
  clearGcsSuppressionReadCacheForTests();

  try {
    return await run({ storage });
  } finally {
    setGcsSuppressionReadStoragePortForTests(null);
    clearGcsSuppressionReadCacheForTests();
    setSuppressionStoreOverrideForTests(null);
    restoreEnv(prevEnv, env as Record<string, string>);
  }
}

async function verifyWriteSourceResolution(): Promise<void> {
  const { resolveSalesSuppressionWriteSource } = await import(
    '../mail-operations/salesSuppressionReadSource.js'
  );
  assert.strictEqual(
    resolveSalesSuppressionWriteSource({ MAIL_OPS_MODE: 'mock' } as NodeJS.ProcessEnv),
    'local'
  );
  assert.strictEqual(
    resolveSalesSuppressionWriteSource({
      MAIL_OPS_MODE: 'live',
      GROWLY_STORAGE_BACKEND: 'gcs',
      GROWLY_GCS_BUCKET: 'b',
      GROWLY_GCS_PREFIX: 'p',
    } as NodeJS.ProcessEnv),
    'gcs'
  );
  ok('resolveSalesSuppressionWriteSource mirrors read source');
}

async function verifyLocalManualWrite(): Promise<void> {
  const { setSuppressionStoreOverrideForTests, addManualSuppression } = await import(
    '../mail-operations/suppressionStore.js'
  );
  setSuppressionStoreOverrideForTests({ version: 1, records: [], updatedAt: new Date().toISOString() });
  const result = await addManualSuppression({
    tenantId: 'want-reach',
    emailAddress: `local-manual@${FIXTURE_DOMAIN}`,
    reason: 'verify local manual',
  });
  assert.strictEqual(result.writeSource, 'local');
  assert.strictEqual(result.created, true);
  assert.strictEqual(result.record.source, 'manual');
  setSuppressionStoreOverrideForTests(null);
  ok('local writeSource persists manual suppression');
}

async function verifyGcsManualWriteAndBlock(): Promise<void> {
  await withLiveGcsHarness(async () => {
    const {
      addManualSuppression,
      loadMailSuppressionStore,
      assertNotSuppressed,
      SuppressionBlockedError,
    } = await import('../mail-operations/index.js');

    const result = await addManualSuppression({
      tenantId: 'want-reach',
      emailAddress: FIXTURE_REPLY,
      reason: 'verify gcs manual',
    });
    assert.strictEqual(result.writeSource, 'gcs');
    assert.strictEqual(result.created, true);

    const store = await loadMailSuppressionStore();
    assert.strictEqual(store.records.length, 1);
    assert.strictEqual(store.records[0]?.source, 'manual');

    let threw = false;
    try {
      assertNotSuppressed({
        tenantId: 'want-reach',
        emailAddress: FIXTURE_REPLY,
        operation: 'generate_sales_copy',
      });
    } catch (err) {
      threw = err instanceof SuppressionBlockedError;
    }
    assert(threw, 'assertNotSuppressed blocks after gcs write');

    ok('GCS in-memory manual write blocks generation gate');
  });
}

async function verifyReplyOptOutIdempotent(): Promise<void> {
  await withLiveGcsHarness(async () => {
    const { addSuppressionFromReplyOptOut } = await import('../mail-operations/suppressionStore.js');
    const first = await addSuppressionFromReplyOptOut({
      tenantId: 'want-reach',
      emailAddress: FIXTURE_REPLY,
      leadId: 'lead-verify-16e',
      reason: '返信による停止希望',
    });
    assert.strictEqual(first.created, true);
    assert.strictEqual(first.record.source, 'reply_opt_out');

    const second = await addSuppressionFromReplyOptOut({
      tenantId: 'want-reach',
      emailAddress: FIXTURE_REPLY,
      leadId: 'lead-verify-16e',
      reason: '返信による停止希望',
    });
    assert.strictEqual(second.created, false);
    ok('reply_opt_out GCS write is idempotent for active email');
  });
}

async function verifyReplyRegisterWorkflow(): Promise<void> {
  const { setSuppressionStoreOverrideForTests, addSuppressionFromReplyOptOut } = await import(
    '../mail-operations/suppressionStore.js'
  );
  setSuppressionStoreOverrideForTests({ version: 1, records: [], updatedAt: new Date().toISOString() });

  const result = await addSuppressionFromReplyOptOut({
    tenantId: 'want-reach',
    emailAddress: `workflow@${FIXTURE_DOMAIN}`,
    leadId: 'lead-wf-16e',
    reason: '返信による停止希望',
  });
  assert.strictEqual(result.record.leadId, 'lead-wf-16e');
  assert.strictEqual(result.record.source, 'reply_opt_out');
  setSuppressionStoreOverrideForTests(null);
  ok('addSuppressionFromReplyOptOut sets leadId and reply_opt_out source');
}

async function verifyStaticUiAndApi(): Promise<void> {
  const { readFile } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const root = join(process.cwd(), 'src/growly-sales');
  const uiServer = await readFile(join(root, 'server/uiServer.ts'), 'utf-8');
  const replyView = await readFile(join(root, 'ui/ReplyManagementView.tsx'), 'utf-8');
  const commApi = await readFile(join(root, 'ui/communicationApi.ts'), 'utf-8');

  assert(uiServer.includes('register-suppression-from-reply'), 'uiServer route exists');
  assert(uiServer.includes('SUPPRESSION_REPLY_OPT_OUT'), 'confirm token gate');
  assert(replyView.includes('配信禁止に登録'), 'reply UI button');
  assert(replyView.includes('ReplySuppressionConfirmDialog'), 'confirm dialog wired');
  assert(commApi.includes('registerSuppressionFromReplyApi'), 'communication API client');
  ok('static UI/API wiring for reply suppression registration');
}

async function main(): Promise<void> {
  console.log('Phase 44.1 Step 16E — manual/reply suppression write (in-memory)\n');
  section('Write source');
  await verifyWriteSourceResolution();
  section('Local manual write');
  await verifyLocalManualWrite();
  section('GCS in-memory manual write + gates');
  await verifyGcsManualWriteAndBlock();
  section('reply_opt_out idempotent');
  await verifyReplyOptOutIdempotent();
  section('Reply workflow');
  await verifyReplyRegisterWorkflow();
  section('Static UI/API');
  await verifyStaticUiAndApi();
  console.log('\nStep 16E verify passed ✅');
}

main().catch((err) => {
  console.error('Step 16E verify failed:', err);
  process.exit(1);
});
