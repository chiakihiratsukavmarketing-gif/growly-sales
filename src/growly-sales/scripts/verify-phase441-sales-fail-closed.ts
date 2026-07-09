/**
 * Phase 44.1 — sales pipeline fail-closed (in-memory / mock only).
 * No Gmail API, no GCS writes, no real email/token/URL output.
 */
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC_ROOT = join(process.cwd(), 'src/growly-sales');
const FIXTURE_NORMALIZED = 'info@fixture.co.jp';

function ok(message: string): void {
  console.log(`  ✅ ${message}`);
}

function section(title: string): void {
  console.log(`\n— ${title}`);
}

function buildSuppressionStoreFixture() {
  const now = new Date().toISOString();
  return {
    version: 1 as const,
    updatedAt: now,
    records: [
      {
        suppressionId: 'verify-fc-blocked-1',
        tenantId: 'want-reach',
        emailAddress: 'info@fixture.co.jp',
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

function minimalLead(email: string) {
  const now = new Date().toISOString();
  return {
    id: 'verify-fc-lead-1',
    companyName: 'Verify FC Fixture Co',
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
    emailSubject: '',
    emailBody: '',
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

function minimalCandidate(email: string) {
  return {
    externalCandidateId: 'verify-fc-candidate-1',
    sourceType: 'places' as const,
    companyName: 'Verify FC Fixture Co',
    area: '宮城',
    industry: '工務店',
    websiteUrl: 'https://fixture.verify',
    officialSiteUrl: 'https://fixture.verify',
    phoneNumber: null,
    address: null,
    googlePlaceId: null,
    sourceUrl: 'https://fixture.verify',
    sourceQuery: 'verify',
    category: '工務店',
    contactFormUrl: null,
    emailCandidates: [email],
    confidenceScore: 80,
    importStatus: 'approved' as const,
    riskLevel: 'low' as const,
    duplicateReason: '',
    duplicateKey: 'verify-fc',
    collectionStatus: 'approved' as const,
    leadApprovalStatus: 'approved' as const,
    generatedEmailSubject: null,
    generatedEmailBody: null,
    generatedCustomHook: null,
    generatedCustomHookReason: null,
    targetEmail: null,
    emailCandidateSourceUrls: [],
  };
}

async function verifySalesAssertNotSuppressedBlocked(): Promise<void> {
  const {
    assertNotSuppressed,
    SuppressionBlockedError,
    setSuppressionStoreOverrideForTests,
  } = await import('../mail-operations/index.js');

  setSuppressionStoreOverrideForTests(buildSuppressionStoreFixture());
  let threw = false;
  try {
    assertNotSuppressed({
      tenantId: 'want-reach',
      emailAddress: 'info@fixture.co.jp',
      operation: 'generate_sales_copy',
    });
  } catch (err) {
    threw = err instanceof SuppressionBlockedError;
  }
  setSuppressionStoreOverrideForTests(null);
  assert(threw, 'blocked email throws SuppressionBlockedError');
  ok('assertNotSuppressed blocks suppressed fixture email');
}

async function verifySalesStoreUnavailableFailClosed(): Promise<void> {
  const {
    assertNotSuppressed,
    SuppressionStoreUnavailableError,
    setSuppressionStoreUnavailableForTests,
    setSuppressionStoreOverrideForTests,
  } = await import('../mail-operations/index.js');

  setSuppressionStoreOverrideForTests({ version: 1, records: [], updatedAt: new Date().toISOString() });
  setSuppressionStoreUnavailableForTests(true);
  let threw = false;
  try {
    assertNotSuppressed({
      tenantId: 'want-reach',
      emailAddress: 'open@fixture.verify',
      operation: 'generate_sales_copy',
    });
  } catch (err) {
    threw = err instanceof SuppressionStoreUnavailableError;
  }
  setSuppressionStoreUnavailableForTests(false);
  setSuppressionStoreOverrideForTests(null);
  assert(threw, 'store unavailable fails closed');
  ok('store unavailable fails closed at assertNotSuppressed');
}

async function verifyDaily30CopyBlocked(): Promise<void> {
  const { generateDaily30SalesCopyForCandidate, SuppressionBlockedError } = await import(
    '../candidates/generateDaily30SalesCopy.js'
  );
  const { loadOfferProfile } = await import('../config/offerProfile.js');
  const { loadTargetProfile } = await import('../config/targetProfile.js');
  const { setSuppressionStoreOverrideForTests } = await import('../mail-operations/index.js');

  setSuppressionStoreOverrideForTests(buildSuppressionStoreFixture());
  const profiles = { offer: await loadOfferProfile(), target: await loadTargetProfile() };
  let threw = false;
  try {
    generateDaily30SalesCopyForCandidate(minimalCandidate('info@fixture.co.jp'), profiles);
  } catch (err) {
    threw = err instanceof SuppressionBlockedError;
  }
  setSuppressionStoreOverrideForTests(null);
  assert(threw, 'daily30 copy blocked');
  ok('generateDaily30SalesCopy fails closed for suppressed fixture');
}

async function verifyApplyFullGenerationBlocked(): Promise<void> {
  const { applyFullGenerationToLead } = await import('../generation/applyFullGeneration.js');
  const { loadOfferProfile } = await import('../config/offerProfile.js');
  const { loadTargetProfile } = await import('../config/targetProfile.js');
  const { SuppressionBlockedError, setSuppressionStoreOverrideForTests } = await import(
    '../mail-operations/index.js'
  );

  setSuppressionStoreOverrideForTests(buildSuppressionStoreFixture());
  const profiles = { offer: await loadOfferProfile(), target: await loadTargetProfile() };
  let threw = false;
  try {
    applyFullGenerationToLead(minimalLead('info@fixture.co.jp'), profiles);
  } catch (err) {
    threw = err instanceof SuppressionBlockedError;
  }
  setSuppressionStoreOverrideForTests(null);
  assert(threw, 'applyFullGeneration blocked');
  ok('applyFullGeneration fails closed for suppressed fixture');
}

async function verifyOutreachEligibilityBlocked(): Promise<void> {
  const { isInitialOutreachEligible } = await import('../outreach/outreachEligibility.js');
  const { setSuppressionStoreOverrideForTests } = await import('../mail-operations/index.js');

  setSuppressionStoreOverrideForTests(buildSuppressionStoreFixture());
  const eligible = isInitialOutreachEligible(minimalLead('info@fixture.co.jp') as never);
  setSuppressionStoreOverrideForTests(null);
  assert(!eligible, 'initial outreach not eligible when suppressed');
  ok('isInitialOutreachEligible false when suppressed');
}

async function verifyGmailDraftGateWired(): Promise<void> {
  const draftSrc = readFileSync(join(SRC_ROOT, 'workflow/createGmailDraftForLead.ts'), 'utf8');
  assert(draftSrc.includes('assertNotSuppressed'), 'gmail draft path uses assertNotSuppressed');
  assert(!draftSrc.includes('buildUnsubscribeEmailFooterCopy'), 'gmail draft has no footer insert');
  assert(!draftSrc.includes('generateUnsubscribeToken'), 'gmail draft has no live token generation');
  ok('gmail draft gate wired without live footer/token');
}

async function verifyGenerationPathsNoLiveToken(): Promise<void> {
  const paths = [
    'generation/applyFullGeneration.ts',
    'candidates/generateDaily30SalesCopy.ts',
    'workflow/createGmailDraftForLead.ts',
    'integrations/gmail/gmailDraftAdapter.ts',
  ];
  for (const rel of paths) {
    const src = readFileSync(join(SRC_ROOT, rel), 'utf8');
    assert(!src.includes('generateUnsubscribeToken'), `${rel} has no generateUnsubscribeToken`);
    assert(!src.includes('buildUnsubscribeEmailFooterCopy'), `${rel} has no footer auto insert`);
  }
  ok('generation/draft paths have no live token or footer auto insert');
}

async function verifyFollowUpSuppressed(): Promise<void> {
  const { isFollowUpSuppressed } = await import('../mail-operations/index.js');
  const { setSuppressionStoreOverrideForTests } = await import('../mail-operations/index.js');

  setSuppressionStoreOverrideForTests(buildSuppressionStoreFixture());
  const suppressed = isFollowUpSuppressed(minimalLead('info@fixture.co.jp') as never);
  setSuppressionStoreOverrideForTests(null);
  assert(suppressed, 'follow-up suppressed when on list');
  ok('isFollowUpSuppressed true for suppressed fixture');
}

async function main(): Promise<void> {
  console.log('Growly Sales — Verify Phase 44.1 sales fail-closed (in-memory)');
  console.log('============================================================');

  section('Suppression gates');
  await verifySalesAssertNotSuppressedBlocked();
  await verifySalesStoreUnavailableFailClosed();

  section('Pipeline entry points');
  await verifyDaily30CopyBlocked();
  await verifyApplyFullGenerationBlocked();
  await verifyOutreachEligibilityBlocked();
  await verifyFollowUpSuppressed();

  section('Live outreach guards');
  await verifyGmailDraftGateWired();
  await verifyGenerationPathsNoLiveToken();

  console.log('\nAll Phase 44.1 sales fail-closed verifications passed ✅');
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error('Verify fatal error:', message);
  process.exit(1);
});
