/**
 * Phase 44.1 Step 16C — CREATE_DRAFTS token gate (in-memory).
 * No Gmail API, no footer insert, no raw token/URL/full email output.
 */
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildGcsObjectPath } from '../config/storageBackend.js';
import { MAIL_OPS_TOKENS_LOGICAL } from '../mail-operations/mailOpsPaths.js';
import type { GcsJsonStoragePort } from '../mail-operations/gcsJsonStoragePort.js';
import { InMemoryGcsJsonStorage } from '../mail-operations/gcsJsonStoragePort.js';

const SRC_ROOT = join(process.cwd(), 'src/growly-sales');
const FIXTURE_EMAIL = 'token-gate@fixture.verify';
const FIXTURE_TENANT = 'want-reach';

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

function liveGcsIssueEnv(): Record<string, string> {
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

function minimalLead(email: string) {
  const now = new Date().toISOString();
  return {
    id: 'verify-16c-lead-1',
    companyName: 'Verify 16C Fixture Co',
    area: '宮城',
    industry: '工務店',
    websiteUrl: 'https://fixture.verify',
    instagramUrl: null,
    emailCandidates: [email],
    emailCandidateSourceUrls: [],
    emailCandidateConfidence: 'high' as const,
    emailContactType: 'info' as const,
    contactPathType: 'email' as const,
    contactPathConfidence: 'high' as const,
    contactFormUrl: null,
    recruitUrl: null,
    caseStudyUrl: null,
    companyProfileUrl: null,
    sourceUrls: [],
    leadScore: 'B' as const,
    salesAngle: '',
    companyAnalysis: '',
    customHook: '',
    hookSourceType: '',
    hookSourceUrl: null,
    customHookReason: '',
    emailSubject: 'verify',
    emailBody: 'verify body',
    sendStatus: 'unsent' as const,
    replyStatus: 'none' as const,
    dealStatus: 'none' as const,
    doNotContact: false,
    riskLevel: 'low' as const,
    collectionStatus: 'approved' as const,
    createdAt: now,
    updatedAt: now,
  };
}

function buildSuppressionStoreFixture() {
  const now = new Date().toISOString();
  return {
    version: 1 as const,
    updatedAt: now,
    records: [
      {
        suppressionId: 'verify-16c-blocked-1',
        tenantId: FIXTURE_TENANT,
        emailAddress: FIXTURE_EMAIL,
        normalizedEmail: FIXTURE_EMAIL,
        status: 'unsubscribed' as const,
        reason: '配信停止リンクからの停止',
        source: 'unsubscribe_link' as const,
        createdAt: now,
        updatedAt: now,
      },
    ],
  };
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

async function withLiveIssueHarness<T>(
  run: (ctx: { storage: InMemoryGcsJsonStorage }) => Promise<T>,
  envPatch: Record<string, string | undefined> = {}
): Promise<T> {
  const prevEnv = { ...process.env };
  const env = { ...liveGcsIssueEnv(), ...envPatch };
  Object.assign(process.env, env);

  const storage = new InMemoryGcsJsonStorage();
  const {
    setUnsubscribeTokenIssueStoragePortForTests,
    setUnsubscribeTokenPepperForTests,
    clearMockUnsubscribeTokenRegistryForTests,
    setSuppressionStoreOverrideForTests,
  } = await import('../mail-operations/index.js');

  setUnsubscribeTokenIssueStoragePortForTests(storage);
  setUnsubscribeTokenPepperForTests(undefined);
  setSuppressionStoreOverrideForTests(null);

  try {
    return await run({ storage });
  } finally {
    setUnsubscribeTokenIssueStoragePortForTests(null);
    setUnsubscribeTokenPepperForTests(undefined);
    clearMockUnsubscribeTokenRegistryForTests();
    setSuppressionStoreOverrideForTests(null);
    restoreEnv(prevEnv, env as Record<string, string>);
  }
}

async function verifyStaticWiring(): Promise<void> {
  const draftSrc = readFileSync(join(SRC_ROOT, 'workflow/createGmailDraftForLead.ts'), 'utf8');
  assert(
    draftSrc.includes('assertUnsubscribeTokenReadyForGmailDraft'),
    'create path wires token issue gate'
  );
  assert(
    draftSrc.includes('assertUnsubscribeTokenReadinessForGmailDraft'),
    'preview path wires readiness-only gate'
  );

  const createFnStart = draftSrc.indexOf('export async function createGmailDraftForLead');
  assert(createFnStart !== -1, 'createGmailDraftForLead found');
  const createFnSrc = draftSrc.slice(createFnStart);
  const eligibleIdx = createFnSrc.indexOf('assertEligibleForGmailDraftCreate(lead, offer)');
  const issueIdx = createFnSrc.indexOf('assertUnsubscribeTokenReadyForGmailDraft({ lead })');
  const buildIdx = createFnSrc.indexOf('buildGmailDraftMessage(lead)');
  const apiIdx = createFnSrc.indexOf('createVerifiedGmailDraft');
  assert(eligibleIdx !== -1 && issueIdx !== -1 && buildIdx !== -1 && apiIdx !== -1);
  assert(eligibleIdx < issueIdx, 'suppression/eligibility before token gate');
  assert(issueIdx < buildIdx, 'token gate before buildGmailDraftMessage');
  assert(issueIdx < apiIdx, 'token gate before Gmail API');
  assert(!draftSrc.includes('buildUnsubscribeEmailFooterCopy'), 'no footer insert');
  assert(!draftSrc.includes('generateUnsubscribeToken'), 'no direct generateUnsubscribeToken');

  for (const rel of [
    'integrations/gmail/buildGmailDraftMessage.ts',
    'integrations/gmail/gmailDraftAdapter.ts',
  ]) {
    const src = readFileSync(join(SRC_ROOT, rel), 'utf8');
    assert(!src.includes('buildUnsubscribeEmailFooterCopy'), `${rel} has no footer`);
    assert(!src.includes('assertUnsubscribeTokenReadyForGmailDraft'), `${rel} has no gate`);
  }
  ok('createGmailDraftForLead gates wired before Gmail API; footer unused');
}

async function verifyMockGateSuccess(): Promise<void> {
  const prevEnv = { ...process.env };
  process.env.MAIL_OPS_MODE = 'mock';
  delete process.env.GROWLY_STORAGE_BACKEND;

  const {
    assertUnsubscribeTokenReadyForGmailDraft,
    assertUnsubscribeTokenReadinessForGmailDraft,
    clearMockUnsubscribeTokenRegistryForTests,
  } = await import('../mail-operations/index.js');

  try {
    assertUnsubscribeTokenReadinessForGmailDraft({
      lead: minimalLead(FIXTURE_EMAIL) as never,
    });
    const issued = await assertUnsubscribeTokenReadyForGmailDraft({
      lead: minimalLead(FIXTURE_EMAIL) as never,
    });
    assert.ok(issued.tokenHash.length > 10);
    assert.ok(issued.rawToken.length > 10);
    ok('mock default token gate succeeds (issue + readiness)');
  } finally {
    clearMockUnsubscribeTokenRegistryForTests();
    restoreEnv(prevEnv, { MAIL_OPS_MODE: 'mock' });
  }
}

async function verifyPepperMissingFailClosed(): Promise<void> {
  await withLiveIssueHarness(async () => {
    const {
      assertUnsubscribeTokenReadyForGmailDraft,
      MailOpsConfigurationError,
      UnsubscribeTokenIssueError,
      setUnsubscribeTokenPepperForTests,
    } = await import('../mail-operations/index.js');

    delete process.env.UNSUBSCRIBE_TOKEN_PEPPER;
    setUnsubscribeTokenPepperForTests(null);

    let threw = false;
    try {
      await assertUnsubscribeTokenReadyForGmailDraft({
        lead: minimalLead(FIXTURE_EMAIL) as never,
      });
    } catch (err) {
      threw =
        err instanceof MailOpsConfigurationError || err instanceof UnsubscribeTokenIssueError;
    }
    assert(threw, 'pepper missing fails closed');
    ok('live-gcs pepper missing fails closed');
  });
}

async function verifyUrlPrerequisiteFailClosedBeforeWrite(): Promise<void> {
  await withLiveIssueHarness(
    async ({ storage }) => {
      const { assertUnsubscribeTokenReadyForGmailDraft, UnsubscribeTokenIssueError } =
        await import('../mail-operations/index.js');
      const before = await readTokenRecordCountAsync(storage);
      let threw = false;
      try {
        await assertUnsubscribeTokenReadyForGmailDraft({
          lead: minimalLead(FIXTURE_EMAIL) as never,
        });
      } catch (err) {
        threw = err instanceof UnsubscribeTokenIssueError;
      }
      const after = await readTokenRecordCountAsync(storage);
      assert(threw, 'URL prerequisite missing fails closed');
      assert.strictEqual(after, before, 'no GCS token write');
      ok('URL prerequisite failure fails closed before GCS write');
    },
    { PUBLIC_BASE_URL: undefined }
  );
}

async function verifyGcsAddFailureFailClosed(): Promise<void> {
  await withLiveIssueHarness(async () => {
    const { assertUnsubscribeTokenReadyForGmailDraft, setUnsubscribeTokenIssueStoragePortForTests } =
      await import('../mail-operations/index.js');
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
      await assertUnsubscribeTokenReadyForGmailDraft({
        lead: minimalLead(FIXTURE_EMAIL) as never,
      });
    } catch {
      threw = true;
    }
    assert(threw, 'GCS add failure fails closed');
    ok('GCS add failure fails closed');
  });
}

async function verifySuppressionPriorityOverTokenGate(): Promise<void> {
  const {
    assertNotSuppressed,
    assertUnsubscribeTokenReadyForGmailDraft,
    SuppressionBlockedError,
    SuppressionStoreUnavailableError,
    setSuppressionStoreOverrideForTests,
    setSuppressionStoreUnavailableForTests,
    clearMockUnsubscribeTokenRegistryForTests,
  } = await import('../mail-operations/index.js');

  const lead = minimalLead(FIXTURE_EMAIL);

  setSuppressionStoreOverrideForTests(buildSuppressionStoreFixture());
  let blockedFirst = false;
  try {
    assertNotSuppressed({
      tenantId: FIXTURE_TENANT,
      lead: lead as never,
      leadId: lead.id,
      emailAddress: FIXTURE_EMAIL,
      operation: 'create_gmail_draft',
    });
  } catch (err) {
    blockedFirst = err instanceof SuppressionBlockedError;
  }
  assert(blockedFirst, 'suppression blocked before token issue');

  let tokenNotReachedBecauseSuppressed = true;
  try {
    // Same order as createGmailDraftForLead: assertNotSuppressed then token gate.
    // After blocked, we never call token gate in production; here we confirm priority contract.
    assertNotSuppressed({
      tenantId: FIXTURE_TENANT,
      lead: lead as never,
      leadId: lead.id,
      emailAddress: FIXTURE_EMAIL,
      operation: 'create_gmail_draft',
    });
    await assertUnsubscribeTokenReadyForGmailDraft({ lead: lead as never });
    tokenNotReachedBecauseSuppressed = false;
  } catch (err) {
    tokenNotReachedBecauseSuppressed = err instanceof SuppressionBlockedError;
  }
  setSuppressionStoreOverrideForTests(null);
  assert(tokenNotReachedBecauseSuppressed, 'suppression blocks before token gate');

  setSuppressionStoreOverrideForTests({
    version: 1,
    records: [],
    updatedAt: new Date().toISOString(),
  });
  setSuppressionStoreUnavailableForTests(true);
  let storeUnavailableFirst = false;
  try {
    assertNotSuppressed({
      tenantId: FIXTURE_TENANT,
      lead: minimalLead('open@fixture.verify') as never,
      leadId: 'verify-16c-open',
      emailAddress: 'open@fixture.verify',
      operation: 'create_gmail_draft',
    });
  } catch (err) {
    storeUnavailableFirst = err instanceof SuppressionStoreUnavailableError;
  }
  setSuppressionStoreUnavailableForTests(false);
  setSuppressionStoreOverrideForTests(null);
  clearMockUnsubscribeTokenRegistryForTests();
  assert(storeUnavailableFirst, 'store unavailable fail-closed before token gate');
  ok('suppression blocked / store unavailable take priority over token gate');
}

async function verifyPreviewReadinessNoWrite(): Promise<void> {
  await withLiveIssueHarness(async ({ storage }) => {
    const { assertUnsubscribeTokenReadinessForGmailDraft } = await import(
      '../mail-operations/index.js'
    );
    const before = await readTokenRecordCountAsync(storage);
    assertUnsubscribeTokenReadinessForGmailDraft({
      lead: minimalLead(FIXTURE_EMAIL) as never,
    });
    const after = await readTokenRecordCountAsync(storage);
    assert.strictEqual(after, before, 'preview readiness must not write tokens');
    ok('preview readiness does not write GCS tokens');
  });
}

function assertStdoutClean(): void {
  const combined = stdoutChunks.join('\n');
  assert(!combined.includes(FIXTURE_EMAIL), 'stdout must not contain full fixture email');
  assert(
    !/https:\/\/mailops\.wantreach\.jp\/u\/[A-Za-z0-9_-]{20,}/.test(combined),
    'stdout must not contain full unsubscribe URL'
  );
  ok('verify stdout has no raw token / full URL / full email');
}

async function main(): Promise<void> {
  originalLog('Growly Sales — Verify Phase 44.1 Step 16C draft token gate');
  originalLog('============================================================');

  section('Static wiring');
  await verifyStaticWiring();

  section('Mock / readiness');
  await verifyMockGateSuccess();
  await verifyPreviewReadinessNoWrite();

  section('Fail-closed');
  await verifyPepperMissingFailClosed();
  await verifyUrlPrerequisiteFailClosedBeforeWrite();
  await verifyGcsAddFailureFailClosed();

  section('Priority');
  await verifySuppressionPriorityOverTokenGate();

  section('Safety');
  assertStdoutClean();

  originalLog('\nAll Phase 44.1 Step 16C verifications passed ✅');
}

main().catch((err) => {
  originalLog('Verify fatal error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
