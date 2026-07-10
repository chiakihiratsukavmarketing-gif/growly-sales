/**
 * Phase 44.1 Step 16B — sales pipeline unsubscribe token issue (in-memory).
 * No Gmail, no real GCS, no raw token/URL/full email output.
 */
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildGcsObjectPath } from '../config/storageBackend.js';
import { MAIL_OPS_TOKENS_LOGICAL } from '../mail-operations/mailOpsPaths.js';
import type { GcsJsonStoragePort } from '../mail-operations/gcsJsonStoragePort.js';
import { InMemoryGcsJsonStorage } from '../mail-operations/gcsJsonStoragePort.js';

const SRC_ROOT = join(process.cwd(), 'src/growly-sales');
const FIXTURE_EMAIL = 'token-issue@fixture.verify';
const FIXTURE_TENANT = 'want-reach';
const FORBIDDEN_KEYS = ['token', 'rawToken', 'url', 'unsubscribeUrl'] as const;

const stdoutChunks: string[] = [];
const originalLog = console.log.bind(console);
console.log = (...args: unknown[]) => {
  stdoutChunks.push(args.map((a) => String(a)).join(' '));
  originalLog(...args);
};

function ok(message: string): void {
  originalLog(`  ✅ ${message}`);
}

function section(title: string): void {
  originalLog(`\n— ${title}`);
}

function liveGcsIssueEnv(): NodeJS.ProcessEnv {
  return {
    MAIL_OPS_MODE: 'live',
    GROWLY_STORAGE_BACKEND: 'gcs',
    GROWLY_GCS_BUCKET: 'verify-bucket',
    GROWLY_GCS_PREFIX: 'verify/prefix',
    UNSUBSCRIBE_TOKEN_PEPPER: 'verify-pepper-fixture',
    PUBLIC_BASE_URL: 'https://mailops.wantreach.jp',
  };
}

function restoreEnv(prevEnv: NodeJS.ProcessEnv, keysSet: Record<string, string>): void {
  for (const key of Object.keys(keysSet)) {
    if (!(key in prevEnv)) delete process.env[key];
  }
  Object.assign(process.env, prevEnv);
}

async function withLiveIssueHarness<T>(
  run: (ctx: { storage: InMemoryGcsJsonStorage }) => Promise<T>,
  envPatch: Record<string, string | undefined> = liveGcsIssueEnv()
): Promise<T> {
  const prevEnv = { ...process.env };
  const env = { ...liveGcsIssueEnv(), ...envPatch };
  Object.assign(process.env, env);

  const storage = new InMemoryGcsJsonStorage();
  const {
    setUnsubscribeTokenIssueStoragePortForTests,
    setUnsubscribeTokenPepperForTests,
    clearMockUnsubscribeTokenRegistryForTests,
  } = await import('../mail-operations/index.js');

  setUnsubscribeTokenIssueStoragePortForTests(storage);
  setUnsubscribeTokenPepperForTests(undefined);

  try {
    return await run({ storage });
  } finally {
    setUnsubscribeTokenIssueStoragePortForTests(null);
    setUnsubscribeTokenPepperForTests(undefined);
    clearMockUnsubscribeTokenRegistryForTests();
    restoreEnv(prevEnv, env as Record<string, string>);
  }
}

function tokenObjectPath(): string {
  return buildGcsObjectPath(MAIL_OPS_TOKENS_LOGICAL);
}

async function readTokenRecordCountAsync(storage: InMemoryGcsJsonStorage): Promise<number> {
  const raw = await storage.readJsonAtPath(tokenObjectPath());
  if (!raw?.trim()) return 0;
  const parsed = JSON.parse(raw) as { records?: unknown[] };
  return Array.isArray(parsed.records) ? parsed.records.length : 0;
}

function assertNoForbiddenKeysInJson(jsonText: string): void {
  const lower = jsonText.toLowerCase();
  for (const key of FORBIDDEN_KEYS) {
    assert(!lower.includes(`"${key}"`), `forbidden key in GCS JSON: ${key}`);
  }
}

async function verifyIssueSourceResolution(): Promise<void> {
  const { resolveSalesUnsubscribeTokenIssueSource } = await import(
    '../mail-operations/salesUnsubscribeTokenIssueSource.js'
  );

  assert.strictEqual(
    resolveSalesUnsubscribeTokenIssueSource({ MAIL_OPS_MODE: 'mock' } as NodeJS.ProcessEnv),
    'mock'
  );
  assert.strictEqual(
    resolveSalesUnsubscribeTokenIssueSource({
      MAIL_OPS_MODE: 'live',
      GROWLY_STORAGE_BACKEND: 'local',
    } as NodeJS.ProcessEnv),
    'mock'
  );
  assert.strictEqual(
    resolveSalesUnsubscribeTokenIssueSource({
      MAIL_OPS_MODE: 'live',
      GROWLY_STORAGE_BACKEND: 'gcs',
      GROWLY_GCS_BUCKET: 'b',
      GROWLY_GCS_PREFIX: 'p',
      UNSUBSCRIBE_TOKEN_PEPPER: 'pepper',
      PUBLIC_BASE_URL: 'https://mailops.wantreach.jp',
    } as NodeJS.ProcessEnv),
    'live-gcs'
  );
  ok('resolveSalesUnsubscribeTokenIssueSource: mock default, live-gcs when live+gcs+pepper+url env');
}

async function verifyMockDefaultIssue(): Promise<void> {
  const prevEnv = { ...process.env };
  process.env.MAIL_OPS_MODE = 'mock';
  delete process.env.GROWLY_STORAGE_BACKEND;
  delete process.env.UNSUBSCRIBE_TOKEN_PEPPER;

  const {
    issueUnsubscribeTokenForOutreach,
    clearMockUnsubscribeTokenRegistryForTests,
  } = await import('../mail-operations/index.js');

  try {
    const issued = await issueUnsubscribeTokenForOutreach({
      tenantId: FIXTURE_TENANT,
      emailAddress: FIXTURE_EMAIL,
      leadId: 'verify-16b-mock-lead',
    });
    assert.ok(issued.rawToken.length > 20);
    assert.ok(issued.unsubscribeUrl.startsWith('/api/mock/unsubscribe/'));
    assert.ok(issued.tokenHash.length > 10);
    assert.strictEqual(issued.normalizedEmail, FIXTURE_EMAIL);
    ok('mock default issueUnsubscribeTokenForOutreach unchanged path');
  } finally {
    clearMockUnsubscribeTokenRegistryForTests();
    restoreEnv(prevEnv, { MAIL_OPS_MODE: 'mock' });
  }
}

async function verifyLiveGcsTokenHashOnly(): Promise<void> {
  await withLiveIssueHarness(async ({ storage }) => {
    const { issueUnsubscribeTokenForOutreach } = await import('../mail-operations/index.js');
    const issued = await issueUnsubscribeTokenForOutreach({
      tenantId: FIXTURE_TENANT,
      emailAddress: FIXTURE_EMAIL,
      leadId: 'verify-16b-live-lead',
      sendRecordId: 'verify-16b-send',
    });

    assert.ok(issued.tokenHash.length > 20);
    assert.ok(issued.rawToken.length > 20);
    assert.ok(issued.unsubscribeUrl.includes('/u/'));

    const raw = await storage.readJsonAtPath(tokenObjectPath());
    assert.ok(raw?.trim());
    assertNoForbiddenKeysInJson(raw!);
    const doc = JSON.parse(raw!) as { records: Array<{ tokenHash: string }> };
    assert.strictEqual(doc.records.length, 1);
    assert.strictEqual(doc.records[0]?.tokenHash, issued.tokenHash);
    ok('live-gcs issue stores tokenHash only in in-memory GCS');
  });
}

async function verifyPepperMissingFailClosed(): Promise<void> {
  await withLiveIssueHarness(async () => {
    const {
      issueUnsubscribeTokenForOutreach,
      MailOpsConfigurationError,
      UnsubscribeTokenIssueError,
    } = await import('../mail-operations/index.js');
    const { setUnsubscribeTokenPepperForTests } = await import(
      '../mail-operations/resolveUnsubscribeTokenPepper.js'
    );

    delete process.env.UNSUBSCRIBE_TOKEN_PEPPER;
    setUnsubscribeTokenPepperForTests(null);

    let threw = false;
    try {
      await issueUnsubscribeTokenForOutreach({
        tenantId: FIXTURE_TENANT,
        emailAddress: FIXTURE_EMAIL,
      });
    } catch (err) {
      threw =
        err instanceof MailOpsConfigurationError || err instanceof UnsubscribeTokenIssueError;
    }
    assert(threw, 'pepper missing fails closed');
    ok('pepper missing fails closed in live-gcs path');
  });
}

async function verifyUrlPrerequisiteFailClosedBeforeGcsWrite(): Promise<void> {
  await withLiveIssueHarness(
    async ({ storage }) => {
      const { issueUnsubscribeTokenForOutreach, UnsubscribeTokenIssueError } = await import(
        '../mail-operations/index.js'
      );

      const before = await readTokenRecordCountAsync(storage);
      let threw = false;
      try {
        await issueUnsubscribeTokenForOutreach({
          tenantId: FIXTURE_TENANT,
          emailAddress: FIXTURE_EMAIL,
        });
      } catch (err) {
        threw = err instanceof UnsubscribeTokenIssueError;
      }
      const after = await readTokenRecordCountAsync(storage);
      assert(threw, 'URL prerequisite missing fails closed');
      assert.strictEqual(after, before, 'no GCS token write before URL readiness');
      ok('URL prerequisite failure fails closed before GCS write');
    },
    { PUBLIC_BASE_URL: undefined }
  );
}

async function verifyGcsAddFailureFailClosed(): Promise<void> {
  await withLiveIssueHarness(async () => {
    const { issueUnsubscribeTokenForOutreach } = await import('../mail-operations/index.js');
    const { setUnsubscribeTokenIssueStoragePortForTests } = await import(
      '../mail-operations/issueUnsubscribeTokenForOutreach.js'
    );

    const base = new InMemoryGcsJsonStorage();
    const failingStorage: GcsJsonStoragePort = {
      readJson: (logical) => base.readJson(logical),
      getMetadata: (logical) => base.getMetadata(logical),
      writeIfGenerationMatch: async () => {
        throw new Error('simulated gcs write failure');
      },
      copyObject: (a, b) => base.copyObject(a, b),
      writeNewJsonAtPath: (p, t) => base.writeNewJsonAtPath(p, t),
      readJsonAtPath: (p) => base.readJsonAtPath(p),
      getMetadataAtPath: (p) => base.getMetadataAtPath(p),
    };
    setUnsubscribeTokenIssueStoragePortForTests(failingStorage);

    let threw = false;
    try {
      await issueUnsubscribeTokenForOutreach({
        tenantId: FIXTURE_TENANT,
        emailAddress: FIXTURE_EMAIL,
      });
    } catch {
      threw = true;
    }
    assert(threw, 'GCS add failure fails closed');
    ok('GCS add failure fails closed');
  });
}

async function verifyGmailDraftNotWired(): Promise<void> {
  // Step 16B contract: issuer module exists; create path wiring is 16C/16D.
  // Generation paths must still not issue tokens or insert footers.
  const paths = [
    'candidates/generateDaily30SalesCopy.ts',
    'generation/applyFullGeneration.ts',
    'integrations/gmail/gmailDraftAdapter.ts',
  ];
  for (const rel of paths) {
    const src = readFileSync(join(SRC_ROOT, rel), 'utf8');
    assert(!src.includes('issueUnsubscribeTokenForOutreach'), `${rel} has no issuer import`);
    assert(!src.includes('buildUnsubscribeEmailFooterCopy'), `${rel} has no footer auto insert`);
  }
  ok('generation / adapter paths have no issuer or footer wiring');
}

function assertStdoutHasNoSensitiveOutput(issuedRawToken?: string): void {
  const combined = stdoutChunks.join('\n');
  assert(!combined.includes(FIXTURE_EMAIL), 'stdout must not contain full fixture email');
  if (issuedRawToken) {
    assert(!combined.includes(issuedRawToken), 'stdout must not contain raw token');
    assert(!combined.includes(encodeURIComponent(issuedRawToken)), 'stdout must not contain encoded raw token');
  }
  assert(!/https:\/\/mailops\.wantreach\.jp\/u\/[A-Za-z0-9_-]{20,}/.test(combined), 'stdout must not contain full unsubscribe URL');
}

async function main(): Promise<void> {
  originalLog('Growly Sales — Verify Phase 44.1 Step 16B unsubscribe token issue');
  originalLog('====================================================================');

  let capturedRawToken: string | undefined;

  section('Issue source');
  await verifyIssueSourceResolution();

  section('Mock default');
  await verifyMockDefaultIssue();

  section('Live-gcs in-memory');
  await withLiveIssueHarness(async () => {
    const { issueUnsubscribeTokenForOutreach } = await import('../mail-operations/index.js');
    const issued = await issueUnsubscribeTokenForOutreach({
      tenantId: FIXTURE_TENANT,
      emailAddress: FIXTURE_EMAIL,
      leadId: 'verify-16b-capture',
    });
    capturedRawToken = issued.rawToken;
  });
  await verifyLiveGcsTokenHashOnly();

  section('Fail-closed');
  await verifyPepperMissingFailClosed();
  await verifyUrlPrerequisiteFailClosedBeforeGcsWrite();
  await verifyGcsAddFailureFailClosed();

  section('Boundaries');
  await verifyGmailDraftNotWired();
  assertStdoutHasNoSensitiveOutput(capturedRawToken);
  ok('verify stdout has no raw token / full URL / full email');

  originalLog('\nAll Phase 44.1 Step 16B verifications passed ✅');
}

main().catch((err) => {
  originalLog('Verify fatal error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
