/**
 * Phase 44.1 Step 16D — unsubscribe footer on Gmail draft body (in-memory / static).
 * No Gmail API, no draft create, no send, no raw token/URL/full email output.
 */
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC_ROOT = join(process.cwd(), 'src/growly-sales');
const FIXTURE_BODY = '営業本文フィクスチャです。';
const FOOTER_MARKER = '配信停止：';
const FIXTURE_FOOTER = '合同会社Want Reachからのご案内です。\n\n配信停止：\nhttps://example.invalid/u/fixture-token';

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

function minimalLead() {
  const now = new Date().toISOString();
  return {
    id: 'verify-16d-lead-1',
    companyName: 'Verify 16D Fixture Co',
    area: '宮城',
    industry: '工務店',
    websiteUrl: 'https://fixture.verify',
    instagramUrl: null,
    emailCandidates: ['footer@fixture.verify'],
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
    emailSubject: 'verify subject',
    emailBody: FIXTURE_BODY,
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

async function verifyBuildGmailDraftMessageFooter(): Promise<void> {
  const { buildGmailDraftMessage } = await import(
    '../integrations/gmail/buildGmailDraftMessage.js'
  );
  const lead = minimalLead() as never;

  const without = buildGmailDraftMessage(lead);
  assert.strictEqual(without.body, FIXTURE_BODY, 'no options keeps body');
  assert(!without.body.includes(FOOTER_MARKER), 'default body has no footer marker');

  const withFooter = buildGmailDraftMessage(lead, {
    unsubscribeFooterText: FIXTURE_FOOTER,
  });
  assert.ok(withFooter.body.startsWith(FIXTURE_BODY));
  assert.ok(withFooter.body.includes(`\n\n${FOOTER_MARKER}`) || withFooter.body.includes(FOOTER_MARKER));
  assert.ok(withFooter.body.endsWith('fixture-token') || withFooter.body.includes(FIXTURE_FOOTER));
  assert.strictEqual(
    withFooter.body,
    `${FIXTURE_BODY}\n\n${FIXTURE_FOOTER}`,
    'footer appended after blank line'
  );
  assert.strictEqual((lead as { emailBody: string }).emailBody, FIXTURE_BODY, 'lead.emailBody unchanged');
  ok('buildGmailDraftMessage appends footerText; options-less body unchanged');
}

async function verifyFooterCopyAcceptsUnsubscribeUrl(): Promise<void> {
  const { buildUnsubscribeEmailFooterCopy, requireMailOperationsTenant } = await import(
    '../mail-operations/index.js'
  );
  const tenant = requireMailOperationsTenant('want-reach');
  const provided = 'https://example.invalid/u/provided-only';
  const footer = buildUnsubscribeEmailFooterCopy(tenant, { unsubscribeUrl: provided });
  assert.strictEqual(footer.unsubscribeUrl, provided);
  assert.ok(footer.fullText.includes(FOOTER_MARKER));
  assert.ok(footer.fullText.includes(provided));

  const placeholder = buildUnsubscribeEmailFooterCopy(tenant);
  assert.ok(
    placeholder.unsubscribeUrl.includes('%7Btoken%7D') ||
      placeholder.unsubscribeUrl.includes('{token}'),
    'default footer uses token placeholder'
  );
  ok('buildUnsubscribeEmailFooterCopy accepts unsubscribeUrl; placeholder default preserved');
}

async function verifyCreatePathWiring(): Promise<void> {
  const draftSrc = readFileSync(join(SRC_ROOT, 'workflow/createGmailDraftForLead.ts'), 'utf8');
  const createFnStart = draftSrc.indexOf('export async function createGmailDraftForLead');
  assert(createFnStart !== -1);
  const createFnSrc = draftSrc.slice(createFnStart);
  const previewFnStart = draftSrc.indexOf('export function buildGmailDraftPreviewForLead');
  const previewFnSrc = draftSrc.slice(previewFnStart, createFnStart);

  const eligibleIdx = createFnSrc.indexOf('assertEligibleForGmailDraftCreate(lead, offer)');
  const issueIdx = createFnSrc.indexOf('assertUnsubscribeTokenReadyForGmailDraft({ lead })');
  const footerIdx = createFnSrc.indexOf('buildUnsubscribeEmailFooterCopy');
  const buildIdx = createFnSrc.indexOf('buildGmailDraftMessage(lead,');
  const apiIdx = createFnSrc.indexOf('createVerifiedGmailDraft');

  assert(eligibleIdx !== -1 && issueIdx !== -1 && footerIdx !== -1 && buildIdx !== -1 && apiIdx !== -1);
  assert(eligibleIdx < issueIdx, 'eligibility before token gate');
  assert(issueIdx < footerIdx, 'token gate before footer');
  assert(footerIdx < buildIdx, 'footer before buildGmailDraftMessage');
  assert(buildIdx < apiIdx, 'build before Gmail API');
  assert(createFnSrc.includes('unsubscribeFooterText'), 'create passes footer text');
  assert(createFnSrc.includes('unsubscribeUrl: issued.unsubscribeUrl'), 'uses issued URL only');
  assert(!createFnSrc.includes('rawToken'), 'rawToken not passed to message builder');

  assert(!previewFnSrc.includes('buildUnsubscribeEmailFooterCopy'), 'preview has no footer');
  assert(
    previewFnSrc.includes('buildGmailDraftMessage(lead)'),
    'preview builds message without footer options'
  );
  ok('create path: token → footer → build → API; preview has no footer');
}

async function verifyGenerationPathsNoFooter(): Promise<void> {
  const paths = [
    'generation/applyFullGeneration.ts',
    'candidates/generateDaily30SalesCopy.ts',
    'integrations/gmail/gmailDraftAdapter.ts',
  ];
  for (const rel of paths) {
    const src = readFileSync(join(SRC_ROOT, rel), 'utf8');
    assert(!src.includes('buildUnsubscribeEmailFooterCopy'), `${rel} has no footer`);
    assert(!src.includes('unsubscribeFooterText'), `${rel} has no footer option`);
  }
  ok('generation / adapter paths have no footer insert');
}

async function verifyNoSendApis(): Promise<void> {
  const paths = [
    'workflow/createGmailDraftForLead.ts',
    'integrations/gmail/buildGmailDraftMessage.ts',
    'integrations/gmail/gmailDraftAdapter.ts',
  ];
  for (const rel of paths) {
    const src = readFileSync(join(SRC_ROOT, rel), 'utf8');
    assert(!src.includes('users.drafts.send'), `${rel} has no drafts.send`);
    assert(!src.includes('users.messages.send'), `${rel} has no messages.send`);
  }
  ok('no send API strings in draft path');
}

function assertStdoutClean(): void {
  const combined = stdoutChunks.join('\n');
  assert(!combined.includes('footer@fixture.verify'), 'stdout must not contain full fixture email');
  assert(
    !/https:\/\/mailops\.wantreach\.jp\/u\/[A-Za-z0-9_-]{20,}/.test(combined),
    'stdout must not contain live unsubscribe URL'
  );
  ok('verify stdout has no raw token / full live URL / full email');
}

async function main(): Promise<void> {
  originalLog('Growly Sales — Verify Phase 44.1 Step 16D unsubscribe footer');
  originalLog('==============================================================');

  section('Message builder');
  await verifyBuildGmailDraftMessageFooter();
  await verifyFooterCopyAcceptsUnsubscribeUrl();

  section('Wiring');
  await verifyCreatePathWiring();
  await verifyGenerationPathsNoFooter();
  await verifyNoSendApis();

  section('Safety');
  assertStdoutClean();

  originalLog('\nAll Phase 44.1 Step 16D verifications passed ✅');
}

main().catch((err) => {
  originalLog('Verify fatal error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
