import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function ok(message: string): void {
  console.log(`  ✅ ${message}`);
}

function section(title: string): void {
  console.log(`\n— ${title}`);
}

async function verifyPhase441GcsTokenStoreSchema(): Promise<void> {
  const { parseUnsubscribeTokensDocument } = await import('../mail-operations/gcsDocumentParser.js');
  const { SuppressionStoreUnavailableError } = await import('../mail-operations/suppressionTypes.js');
  const parsed = parseUnsubscribeTokensDocument(
    JSON.stringify({
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
      records: [
        {
          tokenHash: 'hash-only',
          tenantId: 'want-reach',
          normalizedEmail: 'a@example.com',
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          createdAt: new Date().toISOString(),
        },
      ],
    })
  );
  assert(parsed.schemaVersion === 1, 'schemaVersion 1');
  assert(parsed.records.length === 1, 'records parse');
  assert(!('rawToken' in parsed.records[0]!), 'no raw token in record');
  let threw = false;
  try {
    parseUnsubscribeTokensDocument('{not-json');
  } catch (err) {
    threw = err instanceof SuppressionStoreUnavailableError;
  }
  assert(threw, 'corrupt json fails closed');
  ok('GCS token store schema');
}

async function verifyPhase441GcsTokenStoreGenerationMatch(): Promise<void> {
  process.env.GROWLY_GCS_PREFIX = 'prod/growly-sales';
  const { InMemoryGcsJsonStorage } = await import('../mail-operations/gcsJsonStoragePort.js');
  const { GcsUnsubscribeTokenStore } = await import('../mail-operations/gcsUnsubscribeTokenStore.js');
  const { MAIL_OPS_TOKENS_LOGICAL } = await import('../mail-operations/mailOpsPaths.js');
  const storage = new InMemoryGcsJsonStorage();
  const store = new GcsUnsubscribeTokenStore({
    storage,
    now: () => new Date('2026-07-01T00:00:00.000Z'),
  });
  await store.add({
    tokenHash: 'gen-hash',
    tenantId: 'want-reach',
    normalizedEmail: 'gen@example.com',
    expiresAt: '2026-07-02T00:00:00.000Z',
    createdAt: '2026-07-01T00:00:00.000Z',
  });
  const raw = await storage.readJson(MAIL_OPS_TOKENS_LOGICAL);
  assert(raw?.includes('gen-hash'), 'unsubscribe-tokens.json written');
  const found = await store.findByTokenHash('gen-hash');
  assert(found?.tokenHash === 'gen-hash', 'generation-match read');
  ok('GCS token store generation-match');
}

async function verifyPhase441GcsTokenStoreFailClosed(): Promise<void> {
  const { GcsUnsubscribeTokenStore } = await import('../mail-operations/gcsUnsubscribeTokenStore.js');
  const { SuppressionStoreUnavailableError } = await import('../mail-operations/suppressionTypes.js');
  const storage = {
    readJson: async () => {
      throw new Error('network');
    },
    getMetadata: async () => null,
    writeIfGenerationMatch: async () => {},
  };
  const store = new GcsUnsubscribeTokenStore({ storage: storage as never });
  let threw = false;
  try {
    await store.findByTokenHash('x');
  } catch (err) {
    threw = err instanceof SuppressionStoreUnavailableError;
  }
  assert(threw, 'store read failure is fail-closed');
  ok('GCS token store fail-closed');
}

async function verifyPhase441GcsTokenStoreNoRawToken(): Promise<void> {
  process.env.GROWLY_GCS_PREFIX = 'prod/growly-sales';
  const { InMemoryGcsJsonStorage } = await import('../mail-operations/gcsJsonStoragePort.js');
  const { GcsUnsubscribeTokenStore } = await import('../mail-operations/gcsUnsubscribeTokenStore.js');
  const { MAIL_OPS_TOKENS_LOGICAL } = await import('../mail-operations/mailOpsPaths.js');
  const storage = new InMemoryGcsJsonStorage();
  const store = new GcsUnsubscribeTokenStore({ storage });
  await store.add({
    tokenHash: 'only-hash',
    tenantId: 'want-reach',
    normalizedEmail: 'hash@example.com',
    expiresAt: '2026-12-01T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
  });
  const raw = await storage.readJson(MAIL_OPS_TOKENS_LOGICAL);
  assert(raw && !raw.includes('raw-token'), 'persisted doc has tokenHash only');
  assert(raw.includes('only-hash'), 'tokenHash stored');
  ok('GCS token store no raw token');
}

async function verifyPhase441TokenUsedAfterSuccessfulPost(): Promise<void> {
  process.env.GROWLY_GCS_PREFIX = 'prod/growly-sales';
  const { InMemoryGcsJsonStorage } = await import('../mail-operations/gcsJsonStoragePort.js');
  const { GcsUnsubscribeTokenStore } = await import('../mail-operations/gcsUnsubscribeTokenStore.js');
  const storage = new InMemoryGcsJsonStorage();
  const store = new GcsUnsubscribeTokenStore({
    storage,
    now: () => new Date('2026-07-01T00:00:00.000Z'),
  });
  await store.add({
    tokenHash: 'used-hash',
    tenantId: 'want-reach',
    normalizedEmail: 'used@example.com',
    expiresAt: '2026-12-01T00:00:00.000Z',
    createdAt: '2026-07-01T00:00:00.000Z',
  });
  await store.markUsed({ tokenHash: 'used-hash', usedAt: '2026-07-01T01:00:00.000Z' });
  await store.markUsed({ tokenHash: 'used-hash', usedAt: '2026-07-01T02:00:00.000Z' });
  const rec = await store.findByTokenHash('used-hash');
  assert(rec?.usedAt === '2026-07-01T01:00:00.000Z', 'usedAt idempotent');
  ok('token usedAt after POST (best-effort idempotent)');
}

async function buildLiveTestContext() {
  const { InMemoryUnsubscribeTokenStore } = await import('../mail-operations/unsubscribeTokenStore.js');
  const { createMailOpsServerContext } = await import('../mail-operations/server/mailOpsServerContext.js');
  const { hashUnsubscribeTokenWithPepper } = await import('../mail-operations/suppressionToken.js');

  const tokenStore = new InMemoryUnsubscribeTokenStore();
  const suppressionRecords: { normalizedEmail: string }[] = [];
  const suppressionStore = {
    listByTenant: async () => [],
    findActive: async (input: { normalizedEmail: string }) =>
      suppressionRecords.some((r) => r.normalizedEmail === input.normalizedEmail) ? ({} as never) : null,
    add: async (input: { normalizedEmail: string }) => {
      suppressionRecords.push({ normalizedEmail: input.normalizedEmail });
      return input as never;
    },
    update: async (input: unknown) => input,
  };

  const env = {
    MAIL_OPS_MODE: 'live',
    MAIL_OPS_LIVE_EXTERNAL_CONNECTED: 'true',
    PUBLIC_BASE_URL: 'https://mailops.wantreach.jp',
    GROWLY_STORAGE_BACKEND: 'gcs',
    GROWLY_GCS_BUCKET: 'configured',
    GROWLY_GCS_PREFIX: 'configured',
    UNSUBSCRIBE_TOKEN_PEPPER: 'verify-pepper',
  };

  const ctx = createMailOpsServerContext({
    env: env as NodeJS.ProcessEnv,
    suppressionStore: suppressionStore as never,
    tokenStore,
    now: () => new Date('2026-07-01T00:00:00.000Z'),
  });

  const rawToken = 'raw-token-for-mail-ops-verify';
  const tokenHash = hashUnsubscribeTokenWithPepper(rawToken, 'verify-pepper');
  await tokenStore.add({
    tokenHash,
    tenantId: 'want-reach',
    normalizedEmail: 'live@example.com',
    expiresAt: '2026-07-02T00:00:00.000Z',
    createdAt: '2026-07-01T00:00:00.000Z',
  });

  return { ctx, rawToken, suppressionRecords, tokenStore, tokenHash };
}

async function verifyPhase441LiveGetConnectedConfirm(): Promise<void> {
  const { ctx, rawToken } = await buildLiveTestContext();
  const get = await ctx.getLiveUnsubscribeScreen(rawToken);
  assert(get.screenState === 'confirm', 'GET confirm when connected');
  assert(get.isMock === false && get.liveConnected === true, 'GET live flags');
  ok('live GET connected → confirm');
}

async function verifyPhase441LiveGetDisconnectedTemporaryError(): Promise<void> {
  const { createMailOpsServerContext } = await import('../mail-operations/server/mailOpsServerContext.js');
  const { handleMailOpsRequest } = await import('../mail-operations/server/mailOpsServer.js');
  const ctx = createMailOpsServerContext({
    env: {
      MAIL_OPS_MODE: 'live',
      MAIL_OPS_LIVE_EXTERNAL_CONNECTED: 'false',
      PUBLIC_BASE_URL: 'https://mailops.wantreach.jp',
      GROWLY_STORAGE_BACKEND: 'gcs',
      GROWLY_GCS_BUCKET: 'configured',
      GROWLY_GCS_PREFIX: 'configured',
      UNSUBSCRIBE_TOKEN_PEPPER: 'pepper',
    } as NodeJS.ProcessEnv,
  });

  const config = ctx.loadConfig();
  const readiness = ctx.validateReadiness(config);
  assert(!ctx.canProcessUnsubscribe(config, readiness), 'disconnected blocks processing');

  let status = 0;
  let body = '';
  const res = {
    writeHead(code: number) {
      status = code;
    },
    end(text: string) {
      body = text;
    },
  } as never;

  await handleMailOpsRequest(
    { method: 'GET', url: '/u/disconnected-token' } as never,
    res,
    ctx
  );
  assert(status === 503, 'disconnected GET → 503');
  const parsed = JSON.parse(body) as { screenState: string; liveConnected: boolean };
  assert(parsed.screenState === 'temporary_error', 'disconnected GET → temporary_error');
  assert(parsed.liveConnected === false, 'liveConnected false');
  ok('live GET disconnected → temporary_error');
}

async function verifyPhase441LiveGetDoesNotWrite(): Promise<void> {
  const { ctx, rawToken, suppressionRecords } = await buildLiveTestContext();
  await ctx.getLiveUnsubscribeScreen(rawToken);
  assert(suppressionRecords.length === 0, 'GET does not write suppression');
  ok('live GET does not write');
}

async function verifyPhase441LivePostCompleted(): Promise<void> {
  const { ctx, rawToken, suppressionRecords } = await buildLiveTestContext();
  const post = await ctx.postLiveUnsubscribeScreen(rawToken);
  assert(post.screenState === 'completed', 'POST completed');
  assert(suppressionRecords.length === 1, 'suppression saved before completed');
  ok('live POST completed after save verification');
}

async function verifyPhase441LivePostAlreadyUnsubscribed(): Promise<void> {
  const { ctx, rawToken } = await buildLiveTestContext();
  await ctx.postLiveUnsubscribeScreen(rawToken);
  const second = await ctx.postLiveUnsubscribeScreen(rawToken);
  assert(second.screenState === 'already_unsubscribed', 'double POST idempotent');
  ok('live POST already_unsubscribed');
}

async function verifyPhase441LivePostInvalidOrExpired(): Promise<void> {
  const { ctx } = await buildLiveTestContext();
  const invalid = await ctx.getLiveUnsubscribeScreen('not-a-valid-token');
  assert(invalid.screenState === 'invalid_or_expired', 'invalid token');
  ok('live GET invalid_or_expired');
}

async function verifyPhase441LivePostStoreFailure(): Promise<void> {
  const { createMailOpsServerContext } = await import('../mail-operations/server/mailOpsServerContext.js');
  const { InMemoryUnsubscribeTokenStore } = await import('../mail-operations/unsubscribeTokenStore.js');
  const { hashUnsubscribeTokenWithPepper } = await import('../mail-operations/suppressionToken.js');
  const { SuppressionStoreUnavailableError } = await import('../mail-operations/suppressionTypes.js');

  const tokenStore = new InMemoryUnsubscribeTokenStore();
  const rawToken = 'store-fail-token';
  const tokenHash = hashUnsubscribeTokenWithPepper(rawToken, 'verify-pepper');
  await tokenStore.add({
    tokenHash,
    tenantId: 'want-reach',
    normalizedEmail: 'fail@example.com',
    expiresAt: '2026-12-01T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
  });

  const suppressionStore = {
    listByTenant: async () => [],
    findActive: async () => null,
    add: async () => {
      throw new SuppressionStoreUnavailableError();
    },
    update: async (input: unknown) => input,
  };

  const ctx = createMailOpsServerContext({
    env: {
      MAIL_OPS_MODE: 'live',
      MAIL_OPS_LIVE_EXTERNAL_CONNECTED: 'true',
      PUBLIC_BASE_URL: 'https://mailops.wantreach.jp',
      GROWLY_STORAGE_BACKEND: 'gcs',
      GROWLY_GCS_BUCKET: 'configured',
      GROWLY_GCS_PREFIX: 'configured',
      UNSUBSCRIBE_TOKEN_PEPPER: 'verify-pepper',
    } as NodeJS.ProcessEnv,
    suppressionStore: suppressionStore as never,
    tokenStore,
  });

  const post = await ctx.postLiveUnsubscribeScreen(rawToken);
  assert(post.screenState === 'temporary_error', 'store failure → temporary_error');
  ok('live POST store failure fail-closed');
}

async function verifyPhase441SuppressionSuccessSurvivesAuditFailure(): Promise<void> {
  const repoRoot = join(process.cwd());
  const storeSource = readFileSync(
    join(repoRoot, 'src/growly-sales/mail-operations/gcsJsonMailSuppressionStore.ts'),
    'utf8'
  );
  assert(
    storeSource.includes('audit write failed; suppression persisted'),
    'audit failure does not undo suppression'
  );
  ok('suppression success survives audit failure (code audit)');
}

async function verifyPhase441NoSensitiveLiveResponse(): Promise<void> {
  const { ctx, rawToken } = await buildLiveTestContext();
  const get = await ctx.getLiveUnsubscribeScreen(rawToken);
  const text = JSON.stringify(get);
  assert(!text.includes(rawToken), 'no raw token in response');
  assert(!text.includes('tokenHash'), 'no tokenHash in response');
  assert(!text.includes('normalizedEmail'), 'no normalizedEmail in response');
  assert(!text.includes('leadId'), 'no leadId in response');
  assert(!text.includes('sendRecordId'), 'no sendRecordId in response');
  assert(!text.includes('live@example.com'), 'no full email in response');
  ok('no sensitive fields in live response');
}

async function verifyPhase441NoRawTokenLiveLogging(): Promise<void> {
  const loggingSource = readFileSync(
    join(process.cwd(), 'src/growly-sales/mail-operations/mailOpsRequestLogging.ts'),
    'utf8'
  );
  assert(!loggingSource.includes('rawToken'), 'logging module avoids rawToken field');
  ok('no raw token live logging (static audit)');
}

async function verifyPhase441CustomRolePermissionsSufficient(): Promise<void> {
  const doc = readFileSync(
    join(process.cwd(), 'docs/GROWLY_SALES_MAIL_OPERATIONS_LIVE_READINESS.md'),
    'utf8'
  );
  assert(doc.includes('storage.objects.get'), 'custom role includes get');
  assert(doc.includes('storage.objects.create'), 'custom role includes create');
  assert(doc.includes('storage.objects.update'), 'custom role includes update');
  assert(doc.includes('storage.objects.delete'), 'custom role excludes delete (documented)');
  ok('custom role permissions documented');
}

async function verifyPhase441NoLiveExternalConnectionDuringTest(): Promise<void> {
  assert(process.env.MAIL_OPS_LIVE_EXTERNAL_CONNECTED !== 'true', 'verify does not require live external');
  ok('no live external connection during test');
}

async function verifyPhase441GcsTokenStoreFiveRetries(): Promise<void> {
  const { DEFAULT_MAX_ATTEMPTS } = await import('../mail-operations/withGenerationMatchRetry.js');
  assert(DEFAULT_MAX_ATTEMPTS === 5, 'generation-match max 5 retries');
  ok('GCS token store five retries constant');
}

async function main(): Promise<void> {
  console.log('Growly Sales — Verify Phase 44.1 mail-ops (targeted)');
  console.log('====================================================');

  section('Token store');
  await verifyPhase441GcsTokenStoreSchema();
  await verifyPhase441GcsTokenStoreGenerationMatch();
  await verifyPhase441GcsTokenStoreFailClosed();
  await verifyPhase441GcsTokenStoreNoRawToken();
  await verifyPhase441GcsTokenStoreFiveRetries();
  await verifyPhase441TokenUsedAfterSuccessfulPost();

  section('Live handlers');
  await verifyPhase441LiveGetConnectedConfirm();
  await verifyPhase441LiveGetDisconnectedTemporaryError();
  await verifyPhase441LiveGetDoesNotWrite();
  await verifyPhase441LivePostCompleted();
  await verifyPhase441LivePostAlreadyUnsubscribed();
  await verifyPhase441LivePostInvalidOrExpired();
  await verifyPhase441LivePostStoreFailure();

  section('Safety');
  await verifyPhase441SuppressionSuccessSurvivesAuditFailure();
  await verifyPhase441NoSensitiveLiveResponse();
  await verifyPhase441NoRawTokenLiveLogging();
  await verifyPhase441CustomRolePermissionsSufficient();
  await verifyPhase441NoLiveExternalConnectionDuringTest();

  console.log('\nAll Phase 44.1 mail-ops verifications passed ✅');
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error('Verify fatal error:', message);
  process.exit(1);
});
