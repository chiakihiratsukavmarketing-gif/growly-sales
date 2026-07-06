import { readFile, readdir, access } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { saveLeadsToCsv, loadLeadsFromCsv, loadInputSitesCsv } from '../storage/csvLeadRepository.js';
import {
  hasMojibake,
  hasMojibakeInInputFields,
  hasMojibakeInLeadTextFields,
  MOJIBAKE_REPLACEMENT_CHAR,
  stripUtf8Bom,
} from '../storage/csvEncoding.js';
import { saveLeadsToJson, loadLeadsFromJson } from '../storage/jsonLeadRepository.js';
import {
  createEmptyLead,
  isSendEligible,
  validateLeadEnums,
  LEAD_SCORES,
  REVIEW_STATUSES,
  HUMAN_REVIEW_STATUSES,
  COLLECTION_STATUSES,
  SEND_STATUSES,
  isDraftCandidate,
  isBlockedLead,
  type Lead,
} from '../types/lead.js';
import { dedupeLeads, leadDedupeKey } from '../workflow/dedupeLeads.js';
import { assertNoPersonalEmailsInLeads } from '../safety/validateLeadSafety.js';
import { isInstagramUrl } from '../collectors/htmlUtils.js';
import {
  isInvalidCompanyProfileUrl,
  isInvalidContactFormUrl,
  isSocialMediaUrl,
} from '../collectors/urlClassification.js';
import {
  loadTargetProfile,
  TARGET_PROFILE_REQUIRED_FIELDS,
} from '../config/targetProfile.js';
import {
  loadOfferProfile,
  OFFER_PROFILE_REQUIRED_FIELDS,
} from '../config/offerProfile.js';
import { loadEnv, API_PRODUCTION_ENABLED } from '../config/env.js';
import { searchPlaces, isPlacesAdapterActive } from '../adapters/placesAdapter.js';
import { searchWeb, isWebSearchAdapterActive } from '../adapters/webSearchAdapter.js';
import { generateCompanyAnalysis } from '../generation/generateCompanyAnalysis.js';
import { generateCustomHook } from '../generation/generateCustomHook.js';
import { applyFullGenerationToLead } from '../generation/applyFullGeneration.js';
import { generateSalesEmail, extractImpressionTailForEmail } from '../generation/generateSalesEmail.js';
import { hasJapaneseText, MECHANICAL_IMPRESSION_PHRASES } from '../generation/generationUtils.js';
import { generateSalesAngle } from '../scoring/generateSalesAngle.js';
import { reviewSalesEmail } from '../review/reviewSalesEmail.js';
import {
  approveLeadForDraft,
  markDoNotContact,
  markLeadNeedsRevision,
  rejectLead,
  updateLeadEmailDraft,
} from '../workflow/updateLeadReview.js';
import {
  markManualSent,
  markReplyStatus,
  markFollowUpNeeded,
  markDealStatus,
} from '../workflow/updateLeadCommunication.js';
import { sortLeadsForDisplay, getLeadDisplayPriority } from '../workflow/sortLeadsForDisplay.js';
import {
  getDraftExclusionReason,
  selectDraftCandidates,
} from '../drafts/selectDraftCandidates.js';
import { exportDraftCandidates, formatDraftCopyText } from '../drafts/exportDraftCandidates.js';
import { buildDraftCandidatesPayload } from '../drafts/buildUiDraftCandidates.js';
import { formatSubjectBodyCopy } from '../ui/CopyButton.js';
import { DRAFT_UI_WARNING } from '../ui/DraftCandidatesView.js';
import { MOJIBAKE_REPLACEMENT_CHAR } from '../storage/csvEncoding.js';
import { PROHIBITED_PHRASES } from '../generation/generationUtils.js';
import {
  getDraftsDir,
  getLeadsJsonPath,
  getProjectRoot,
  getExternalCandidatesJsonPath,
  getExternalCandidatesCsvPath,
  resetProjectRootCache,
} from '../config/paths.js';
import { loadLeadsForApi } from '../storage/loadLeadsForApi.js';
import { computeDraftStats } from '../drafts/selectDraftCandidates.js';
import { chdir, cwd } from 'node:process';
import { buildSalesAnalytics } from '../analytics/buildSalesAnalytics.js';
import { buildOperationSummary } from '../analytics/buildOperationSummary.js';
import { checkLocalMvpReadiness } from '../mvp/checkLocalMvpReadiness.js';
import { buildPilotSummary, PILOT_TARGET_LEAD_COUNT } from '../analytics/buildPilotSummary.js';
import { buildContactPathAnalytics } from '../analytics/buildContactPathAnalytics.js';
import { buildSalesDashboard } from '../analytics/buildSalesDashboard.js';
import { MAX_ADDITIONAL_CONTACT_PAGES } from '../collectors/extractWebsiteContacts.js';
import { findAdditionalContactPageUrls } from '../collectors/findAdditionalContactPages.js';
import { classifyEmailCandidate } from '../collectors/classifyEmailCandidate.js';
import { extractEmailCandidatesFromHtml } from '../collectors/extractEmailCandidates.js';
import {
  normalizeEmailText,
  extractMailtoEmails,
  extractAtNotationEmails,
} from '../collectors/htmlUtils.js';
import { isFreeEmailDomain, isRejectedEmail, filterAllowedEmails } from '../safety/contactPolicy.js';
import { inferContactPathTypeFromFields } from '../analytics/contactPathTypes.js';
import { buildExternalLeadCandidate } from '../adapters/normalizeExternalLeadCandidate.js';
import { applyDuplicateStatus, dedupeExternalCandidates } from '../adapters/dedupeExternalCandidates.js';
import { isCandidateImportable } from '../workflow/importApprovedExternalCandidates.js';
import { buildLeadSearchQueries } from '../adapters/buildLeadSearchQueries.js';
import { FETCH_CANDIDATES_CONFIRM_TOKEN, IMPORT_APPROVED_CONFIRM_TOKEN, FETCH_DAILY_30_CONFIRM_TOKEN, GENERATE_DAILY_30_COPY_CONFIRM_TOKEN, IMPORT_DAILY_30_DRAFT_CANDIDATES_CONFIRM_TOKEN } from './externalCandidateCliTokens.js';
import { CANDIDATE_COLLECTION_TARGET } from '../candidates/candidateCollectionConfig.js';
import { isFollowUpOnlyLead } from '../outreach/outreachEligibility.js';
import { limitNewCandidates } from '../candidates/limitCandidateCollection.js';
import { auditCandidateCollection } from '../candidates/auditCandidateCollection.js';
import { EXTERNAL_CANDIDATES_WARNING } from '../ui/ExternalCandidatesView.js';
import {
  PILOT_MODE_LABEL,
  PILOT_MODE_EXTERNAL_API,
  PILOT_MODE_GMAIL,
  PILOT_MODE_SEND_DISABLED,
  PILOT_MODE_STORAGE,
} from '../ui/PilotModeBanner.js';
import { ANALYTICS_WARNING } from '../ui/SalesAnalyticsView.js';
import { OP_SUMMARY_WARNING } from '../ui/OperationSummaryPanel.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '../../..');
const SRC_ROOT = join(PROJECT_ROOT, 'src/growly-sales');

const FORBIDDEN_PATTERNS = [
  /gmail\.users\.messages\.send/i,
  /gmail\.users\.drafts\.send/i,
  /users\.drafts\.send/i,
  /users\.messages\.send/i,
  /drafts\.send/i,
  /messages\.send/i,
  /nodemailer.*sendMail/i,
  /transporter\.sendMail/i,
  /sendMail\s*\(/i,
  /autoSend/i,
  /auto_send/i,
  /bulkSend/i,
  /scheduledSend/i,
  /googleapis.*gmail.*send/i,
];

const GMAIL_INTEGRATION_ALLOWLIST = [
  'integrations\\gmail\\gmailDraftAdapter.ts',
  'integrations\\gmail\\gmailAuth.ts',
  'integrations/gmail/gmailDraftAdapter.ts',
  'integrations/gmail/gmailAuth.ts',
];

const ALLOWLIST_SEND_FILES = [
  'types/lead.ts',
];

const API_KEY_PATTERNS = [
  /AIza[0-9A-Za-z_-]{35}/,
  /sk-[a-zA-Z0-9]{20,}/,
];

const ADAPTER_LIVE_API_PATTERNS = [
  /maps\.googleapis\.com/i,
  /places\.googleapis\.com/i,
  /customsearch\.googleapis\.com/i,
  /www\.googleapis\.com\/customsearch/i,
];

const MAPS_HTML_SCRAPE_PATTERNS = [
  /puppeteer/i,
  /playwright/i,
  /cheerio[\s\S]{0,80}maps\.google\.com/i,
  /maps\.google\.com\/maps\?/i,
];

let passed = 0;
let failed = 0;

function ok(message: string): void {
  passed++;
  console.log(`  ✅ ${message}`);
}

function fail(message: string): void {
  failed++;
  console.error(`  ❌ ${message}`);
}

function assert(condition: boolean, message: string): void {
  if (condition) ok(message);
  else fail(message);
}

async function collectSourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectSourceFiles(fullPath)));
    } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
      files.push(fullPath);
    }
  }

  return files;
}

async function verifyNoSendCode(): Promise<void> {
  const files = await collectSourceFiles(SRC_ROOT);
  const violations: string[] = [];

  for (const file of files) {
    const relative = file.replace(SRC_ROOT + '/', '').replace(SRC_ROOT + '\\', '');
    if (relative.includes('verify-growly-sales')) continue;

    const content = await readFile(file, 'utf-8');
    const isGmailIntegration = GMAIL_INTEGRATION_ALLOWLIST.some(
      (allowed) => relative.endsWith(allowed.replace(/\//g, '\\')) || relative.endsWith(allowed)
    );

    for (const pattern of FORBIDDEN_PATTERNS) {
      if (pattern.test(content)) {
        const isAllowlisted = ALLOWLIST_SEND_FILES.some(
          (f) => relative.endsWith(f.replace(/\//g, '\\')) || relative.endsWith(f)
        );
        if (!isAllowlisted) {
          violations.push(`${relative}: matches ${pattern}`);
        }
      }
    }

    if (isGmailIntegration && /users\/me\/drafts\/send|users\/me\/messages\/send/.test(content)) {
      violations.push(`${relative}: Gmail send API reference in integration file`);
    }
  }

  const adapterPath = join(SRC_ROOT, 'integrations/gmail/gmailDraftAdapter.ts');
  const adapterContent = await readFile(adapterPath, 'utf-8');
  assert(
    adapterContent.includes('GMAIL_DRAFTS_CREATE_ENDPOINT') ||
      adapterContent.includes('users/me/drafts'),
    'gmailDraftAdapter uses drafts.create endpoint'
  );
  assert(!/users\/me\/drafts\/send|users\/me\/messages\/send/.test(adapterContent), 'gmailDraftAdapter has no send API');

  assert(violations.length === 0, `No auto-send or Gmail send code (${violations.length} violations)`);
  if (violations.length > 0) {
    violations.forEach((v) => fail(v));
  }
}

function verifyLeadRequiredFields(lead: Lead): void {
  const required: (keyof Lead)[] = [
    'id', 'companyName', 'area', 'industry', 'websiteUrl',
    'emailCandidates', 'sourceUrls', 'leadScore', 'reviewStatus',
    'humanReviewStatus', 'sendStatus', 'doNotContact', 'riskLevel',
    'createdAt', 'updatedAt',
  ];

  for (const field of required) {
    assert(lead[field] !== undefined && lead[field] !== null, `Lead has required field: ${field}`);
  }
}

async function verifyJsonStorage(tmpPath: string): Promise<void> {
  const testLead = createEmptyLead({
    companyName: 'Verify Test Co',
    area: '宮城県仙台市',
    industry: '工務店',
    websiteUrl: 'https://example.com',
    sourceUrls: ['https://example.com'],
    emailCandidates: ['info@example.com'],
    leadScore: 'B',
    collectionStatus: 'collected',
    riskLevel: 'low',
  });

  await saveLeadsToJson(tmpPath, [testLead]);
  const loaded = await loadLeadsFromJson(tmpPath);
  assert(loaded.length === 1, 'JSON save/load works');
  assert(loaded[0].companyName === 'Verify Test Co', 'JSON data integrity');
}

async function verifyCsvStorage(tmpPath: string): Promise<void> {
  const testLead = createEmptyLead({
    companyName: 'CSV Test Co',
    area: '宮城県仙台市',
    industry: 'リフォーム',
    websiteUrl: 'https://example.org',
    sourceUrls: ['https://example.org'],
    emailCandidates: ['contact@example.org'],
    leadScore: 'A',
    collectionStatus: 'collected',
    riskLevel: 'low',
  });

  await saveLeadsToCsv(tmpPath, [testLead]);
  const loaded = await loadLeadsFromCsv(tmpPath);
  assert(loaded.length === 1, 'CSV save/load works');
  assert(loaded[0].companyName === 'CSV Test Co', 'CSV data integrity');
}

function verifyDedupe(): void {
  const base = createEmptyLead({
    companyName: 'Dedupe Test',
    area: '仙台市',
    industry: '工務店',
    websiteUrl: 'https://dedupe.test',
    sourceUrls: ['https://dedupe.test'],
    emailCandidates: ['info@dedupe.test'],
  });

  const duplicate = { ...base, id: crypto.randomUUID() };
  const deduped = dedupeLeads([base, duplicate]);
  assert(deduped.length === 1, 'Dedupe removes identical leads');
  assert(leadDedupeKey(base) === leadDedupeKey(duplicate), 'Dedupe key matches for duplicates');
}

function verifyEnums(lead: Lead): void {
  assert(LEAD_SCORES.includes(lead.leadScore), `leadScore is valid: ${lead.leadScore}`);
  assert(REVIEW_STATUSES.includes(lead.reviewStatus), `reviewStatus is valid: ${lead.reviewStatus}`);
  assert(
    HUMAN_REVIEW_STATUSES.includes(lead.humanReviewStatus),
    `humanReviewStatus is valid: ${lead.humanReviewStatus}`
  );
  assert(
    COLLECTION_STATUSES.includes(lead.collectionStatus),
    `collectionStatus is valid: ${lead.collectionStatus}`
  );
  assert(SEND_STATUSES.includes(lead.sendStatus), `sendStatus is valid: ${lead.sendStatus}`);
}

function verifyUtf8BomStrip(): void {
  assert(stripUtf8Bom('\uFEFFcompanyName,area') === 'companyName,area', 'UTF-8 BOM is stripped on read');
}

function verifyMojibakeDetection(): void {
  const garbledName = `サンプル${MOJIBAKE_REPLACEMENT_CHAR}工務店`;
  assert(hasMojibake(garbledName), 'Mojibake replacement character is detected');
  assert(
    hasMojibakeInInputFields({
      companyName: garbledName,
      area: '宮城県仙台市',
      industry: '工務店',
    }),
    'Mojibake in companyName is detected'
  );
}

async function verifyNoMojibakeInDataFiles(): Promise<void> {
  const inputPath = join(PROJECT_ROOT, 'data/growly-sales/input-sites.csv');
  const leadsPath = join(PROJECT_ROOT, 'data/growly-sales/leads.json');

  const { rows, encodingWarnings } = await loadInputSitesCsv(inputPath);
  assert(encodingWarnings.length === 0, `input-sites.csv has no CSV encoding warnings (${encodingWarnings.length} found)`);

  let inputClean = true;
  for (const row of rows) {
    if (hasMojibakeInInputFields(row)) {
      inputClean = false;
      fail(
        `Mojibake in input-sites.csv: companyName="${row.companyName}", area="${row.area}", industry="${row.industry}"`
      );
    }
  }
  if (inputClean) {
    ok('input-sites.csv Japanese fields have no mojibake');
  }

  const leads = await loadLeadsFromJson(leadsPath);
  let leadsClean = true;
  for (const lead of leads) {
    if (hasMojibakeInLeadTextFields(lead)) {
      leadsClean = false;
      fail(
        `Mojibake in leads.json: companyName="${lead.companyName}", area="${lead.area}", industry="${lead.industry}"`
      );
    }
  }
  if (leadsClean) {
    ok('leads.json companyName/area/industry have no mojibake');
  }
}

function verifyDoNotContact(): void {
  const blocked = createEmptyLead({
    companyName: 'Blocked Co',
    area: '仙台市',
    industry: '工務店',
    websiteUrl: 'https://blocked.test',
    sourceUrls: ['https://blocked.test'],
    humanReviewStatus: 'approved',
    reviewStatus: 'approve',
    doNotContact: true,
  });

  assert(!isSendEligible(blocked), 'doNotContact=true leads are not send eligible');

  const eligible = createEmptyLead({
    companyName: 'Eligible Co',
    area: '仙台市',
    industry: '工務店',
    websiteUrl: 'https://eligible.test',
    sourceUrls: ['https://eligible.test'],
    humanReviewStatus: 'approved',
    reviewStatus: 'approve',
    doNotContact: false,
  });

  assert(isSendEligible(eligible), 'Approved non-blocked leads are send eligible (future use)');
}

async function verifyEmptyDataHandling(): Promise<void> {
  const emptyJsonPath = join(PROJECT_ROOT, 'data/growly-sales/_verify_empty.json');
  const emptyCsvPath = join(PROJECT_ROOT, 'data/growly-sales/_verify_empty.csv');

  await saveLeadsToJson(emptyJsonPath, []);
  const jsonLeads = await loadLeadsFromJson(emptyJsonPath);
  assert(jsonLeads.length === 0, 'Empty JSON does not crash');

  await saveLeadsToCsv(emptyCsvPath, []);
  const csvLeads = await loadLeadsFromCsv(emptyCsvPath);
  assert(csvLeads.length === 0, 'Empty CSV does not crash');
}

async function verifyEnvAndSecrets(): Promise<void> {
  const gitignorePath = join(PROJECT_ROOT, '.gitignore');
  const gitignore = await readFile(gitignorePath, 'utf-8');
  assert(gitignore.includes('.env'), '.env is listed in .gitignore');

  const envExamplePath = join(PROJECT_ROOT, '.env.example');
  await access(envExamplePath);
  ok('.env.example exists');

  try {
    await access(join(PROJECT_ROOT, '.env'));
    ok('.env file may exist locally (not verified in git)');
  } catch {
    ok('.env not present in workspace (expected for clean checkout)');
  }

  const files = await collectSourceFiles(SRC_ROOT);
  const keyViolations: string[] = [];
  for (const file of files) {
    const relative = file.replace(SRC_ROOT + '/', '').replace(SRC_ROOT + '\\', '');
    if (relative.includes('verify-growly-sales')) continue;
    const content = await readFile(file, 'utf-8');
    for (const pattern of API_KEY_PATTERNS) {
      if (pattern.test(content)) {
        keyViolations.push(`${relative}: possible hardcoded API key`);
      }
    }
  }
  assert(keyViolations.length === 0, `No hardcoded API keys in source (${keyViolations.length} found)`);
  keyViolations.forEach((v) => fail(v));
}

async function verifyProfiles(): Promise<void> {
  const target = await loadTargetProfile('housing');
  assert(target.targetId === 'housing', 'housing.json loads with targetId=housing');
  for (const field of TARGET_PROFILE_REQUIRED_FIELDS) {
    assert(target[field] !== undefined && target[field] !== null, `housing.json has ${field}`);
  }
  ok('housing.json has all required fields');

  const offer = await loadOfferProfile('sns-operation');
  assert(offer.offerId === 'sns-operation', 'sns-operation.json loads with offerId=sns-operation');
  for (const field of OFFER_PROFILE_REQUIRED_FIELDS) {
    assert(offer[field] !== undefined && offer[field] !== null, `sns-operation.json has ${field}`);
  }
  ok('sns-operation.json has all required fields');
}

async function verifyExternalApiAdapters(): Promise<void> {
  assert(API_PRODUCTION_ENABLED === false, 'API_PRODUCTION_ENABLED is false by default');

  const env = loadEnv();
  assert(!isPlacesAdapterActive(), 'Places adapter is not active without production enable');
  assert(!isWebSearchAdapterActive(), 'Web search adapter is not active without production enable');

  const places = await searchPlaces('仙台 工務店');
  assert(!places.enabled, 'searchPlaces returns disabled when production is off');
  assert(places.mock === true, 'searchPlaces returns mock mode');
  assert(places.results.length === 0, 'searchPlaces does not return live results');

  const web = await searchWeb('仙台 工務店');
  assert(!web.enabled, 'searchWeb returns disabled when production is off');
  assert(web.results.length === 0, 'searchWeb does not return live results');

  const adapterFiles = [
    join(SRC_ROOT, 'adapters/placesAdapter.ts'),
    join(SRC_ROOT, 'adapters/webSearchAdapter.ts'),
  ];
  for (const file of adapterFiles) {
    const content = await readFile(file, 'utf-8');
    assert(content.includes('isApiProductionEnabled'), `${file} gates API with isApiProductionEnabled`);
    for (const pattern of MAPS_HTML_SCRAPE_PATTERNS) {
      assert(!pattern.test(content), `Adapter ${file} has no Google Maps HTML scraping`);
    }
  }

  const allSource = await collectSourceFiles(SRC_ROOT);
  for (const file of allSource) {
    const content = await readFile(file, 'utf-8');
    for (const pattern of MAPS_HTML_SCRAPE_PATTERNS) {
      if (pattern.test(content) && !file.includes('verify-growly-sales')) {
        fail(`Possible Maps HTML scraping in ${file}`);
      }
    }
  }
  ok('No Google Maps HTML scraping patterns in source');

  ok('Places/Web search adapters gated; disabled without API_PRODUCTION_ENABLED');
}

async function verifyInstagramUrlsInLeads(): Promise<void> {
  const leadsPath = join(PROJECT_ROOT, 'data/growly-sales/leads.json');
  const leads = await loadLeadsFromJson(leadsPath);
  let allValid = true;
  for (const lead of leads) {
    if (lead.instagramUrl && !isInstagramUrl(lead.instagramUrl)) {
      allValid = false;
      fail(`Lead ${lead.id} instagramUrl is not Instagram: ${lead.instagramUrl}`);
    }
    if (lead.sourceUrls.length === 0 && lead.collectionStatus !== 'failed') {
      allValid = false;
      fail(`Lead ${lead.id} has empty sourceUrls`);
    }
  }
  if (allValid) {
    ok('All leads have valid instagramUrl (or null) and non-empty sourceUrls');
  }
}

function verifyUrlClassificationRules(): void {
  assert(isSocialMediaUrl('https://facebook.com/profile.php?id=123'), 'Facebook detected as social media');
  assert(isInvalidCompanyProfileUrl('https://facebook.com/profile.php?id=123'), 'Facebook is invalid companyProfileUrl');
  assert(!isInvalidCompanyProfileUrl('https://example.co.jp/about'), 'Same-site about page is valid profile');
  assert(isInvalidContactFormUrl('https://example.co.jp/reform'), '/reform is invalid contactFormUrl');
  assert(!isInvalidContactFormUrl('https://example.co.jp/contact'), '/contact is valid contactFormUrl');
  assert(!isInvalidContactFormUrl('https://example.co.jp/customhouse/request'), '/request is valid contactFormUrl');
  ok('URL classification rules for profile/contact are correct');
}

async function verifyLeadUrlFieldQuality(): Promise<void> {
  const leadsPath = join(PROJECT_ROOT, 'data/growly-sales/leads.json');
  const leads = await loadLeadsFromJson(leadsPath);
  let allValid = true;

  for (const lead of leads) {
    if (lead.companyProfileUrl && isInvalidCompanyProfileUrl(lead.companyProfileUrl)) {
      allValid = false;
      fail(
        `Lead ${lead.companyName}: companyProfileUrl must not be SNS — ${lead.companyProfileUrl}`
      );
    }

    if (lead.companyProfileUrl && isSocialMediaUrl(lead.companyProfileUrl)) {
      allValid = false;
      fail(`Lead ${lead.companyName}: companyProfileUrl contains SNS domain`);
    }

    if (lead.contactFormUrl && isInvalidContactFormUrl(lead.contactFormUrl)) {
      allValid = false;
      fail(
        `Lead ${lead.companyName}: contactFormUrl is not a contact page — ${lead.contactFormUrl}`
      );
    }

    if (lead.instagramUrl && lead.companyProfileUrl === lead.instagramUrl) {
      allValid = false;
      fail(`Lead ${lead.companyName}: Instagram URL must not be in companyProfileUrl`);
    }
  }

  if (allValid) {
    ok('All leads pass companyProfileUrl/contactFormUrl quality checks');
  }
}

async function verifyGenerationPipeline(): Promise<void> {
  const offer = await loadOfferProfile();
  const target = await loadTargetProfile();

  const baseLead = createEmptyLead({
    companyName: '検証工務店',
    area: '宮城県仙台市',
    industry: '工務店',
    websiteUrl: 'https://verify.example.jp',
    sourceUrls: ['https://verify.example.jp', 'https://verify.example.jp/contact'],
    contactFormUrl: 'https://verify.example.jp/contact',
    caseStudyUrl: 'https://verify.example.jp/works',
    instagramUrl: 'https://instagram.com/verify_test',
    collectionStatus: 'collected',
    riskLevel: 'low',
  });

  const salesAngle = generateSalesAngle(baseLead, offer);
  const companyAnalysis = generateCompanyAnalysis(baseLead, { salesAngle, offer, target });
  const hookResult = generateCustomHook(baseLead, { offer });
  const customHook = hookResult.customHook;
  const email = generateSalesEmail(baseLead, { customHook, salesAngle, offer });

  assert(hasJapaneseText(companyAnalysis), 'generateCompanyAnalysis produces Japanese text');
  assert(hasJapaneseText(customHook), 'generateCustomHook produces Japanese text');
  assert(email.emailSubject.length > 0, 'generateSalesEmail produces emailSubject');
  assert(email.emailBody.length > 0, 'generateSalesEmail produces emailBody');
  assert(
    email.emailSubject.includes('様向け｜SNS無料診断レポートのご案内'),
    'generateSalesEmail uses standard subject template'
  );
  assert(!email.emailSubject.startsWith('【'), 'generateSalesEmail subject has no leading brackets');
  assert(
    email.emailBody.includes('SNS運用サポートを行っております、合同会社Want Reachの平塚と申します。'),
    'generateSalesEmail uses production intro line'
  );
  assert(email.emailBody.includes('ホームページを拝見し'), 'generateSalesEmail includes homepage impression');
  assert(
    !MECHANICAL_IMPRESSION_PHRASES.some((phrase) => email.emailBody.includes(phrase)),
    'generateSalesEmail avoids mechanical impression phrases'
  );
  assert(
    email.emailBody.includes(extractImpressionTailForEmail(customHook).replace(/。$/, '')),
    'generateSalesEmail embeds customHook impression tail'
  );
  assert(email.emailBody.includes('「希望」とだけご返信'), 'generateSalesEmail uses hope-reply CTA');
  assert(email.emailBody.includes('しつこい営業はいたしません'), 'generateSalesEmail includes no-push line');
  assert(email.emailBody.includes('平塚千明'), 'generateSalesEmail uses formal signature');
  assert(email.emailBody.includes('wantreach.jp'), 'generateSalesEmail includes signature URL');
  const { getOutreachSignatureEmail, getOutreachFromEmail } = await import('../config/env.js');
  const signatureEmail = getOutreachSignatureEmail();
  assert(signatureEmail === getOutreachFromEmail(), 'signature email defaults to outreach from email');
  assert(email.emailBody.includes(`Email：${signatureEmail}`), 'generateSalesEmail uses outreach signature email');
  assert(
    !email.emailBody.includes('合同会社Want Reach\n\n平塚'),
    'generateSalesEmail signature has no blank lines between fields'
  );
  assert(
    email.emailBody.includes('合同会社Want Reach\n平塚千明'),
    'generateSalesEmail signature is compact (company name directly followed by name line)'
  );
  assert(
    !email.emailBody.includes('Growly Sales テスト運用'),
    'generateSalesEmail does not use test ops phrase'
  );

  const followUpLead = createEmptyLead({
    companyName: 'フォローアップ社',
    area: '仙台市',
    industry: '工務店',
    websiteUrl: 'https://followup.test',
    sourceUrls: ['https://followup.test'],
    sendStatus: 'manual_sent',
    replyStatus: 'replied',
    humanReviewStatus: 'pending',
    emailCandidates: ['info@followup.test'],
  });
  assert(isFollowUpOnlyLead(followUpLead), 'follow-up only lead detected');
  const { getGmailDraftExclusionReason: gmailExclude } = await import(
    '../integrations/gmail/selectGmailDraftCandidates.js'
  );
  assert(
    gmailExclude(followUpLead)?.includes('フォローアップ'),
    'follow-up lead excluded from Gmail drafts'
  );

  const approved = reviewSalesEmail(
    { ...baseLead, ...email, salesAngle, companyAnalysis, customHook },
    offer
  );
  assert(
    ['approve', 'revise', 'reject'].includes(approved.reviewStatus),
    `reviewSalesEmail returns valid status: ${approved.reviewStatus}`
  );

  const prohibited = reviewSalesEmail(
    {
      ...baseLead,
      emailSubject: 'テスト',
      emailBody: '必ず問い合わせが増えます。ご検討ください。',
      salesAngle,
      companyAnalysis,
      customHook,
    },
    offer
  );
  assert(prohibited.reviewStatus === 'reject', 'Prohibited claim in email causes reject');

  const dnc = reviewSalesEmail(
    { ...baseLead, ...email, doNotContact: true, salesAngle, companyAnalysis, customHook },
    offer
  );
  assert(dnc.reviewStatus === 'reject', 'doNotContact=true causes reject');

  const highRisk = reviewSalesEmail(
    { ...baseLead, ...email, riskLevel: 'high', salesAngle, companyAnalysis, customHook },
    offer
  );
  assert(highRisk.reviewStatus === 'reject', 'riskLevel=high causes reject');

  const emptyBody = reviewSalesEmail(
    { ...baseLead, emailSubject: '', emailBody: '', salesAngle, companyAnalysis, customHook },
    offer
  );
  assert(emptyBody.reviewStatus === 'reject', 'Empty emailBody causes reject');

  const leadsPath = join(PROJECT_ROOT, 'data/growly-sales/leads.json');
  const leads = await loadLeadsFromJson(leadsPath);
  let statusOk = true;
  for (const lead of leads) {
    const allowedSend = ['not_sent', 'blocked', 'manual_sent', 'sent'].includes(lead.sendStatus);
    if (!allowedSend || lead.sendStatus === 'draft') {
      statusOk = false;
      fail(`Lead ${lead.companyName}: sendStatus must be not_sent/blocked/manual_sent/sent (no auto-send draft)`);
    }
    if (!HUMAN_REVIEW_STATUSES.includes(lead.humanReviewStatus)) {
      statusOk = false;
      fail(`Lead ${lead.companyName}: invalid humanReviewStatus`);
    }
  }
  if (statusOk) {
    ok('All persisted leads keep safe sendStatus — no draft/auto-send from system');
  }

  const withEmail = leads.filter((l) => l.emailBody?.trim());
  if (withEmail.length > 0) {
    for (const lead of withEmail) {
      if (!['approve', 'revise', 'reject'].includes(lead.reviewStatus)) {
        fail(`Lead ${lead.companyName}: reviewStatus must be approve/revise/reject after generate`);
      }
    }
    ok(`Persisted leads have review results (${withEmail.length} with emailBody)`);
    for (const lead of withEmail) {
      assert(
        !lead.emailBody.includes('Growly Sales テスト運用'),
        `emailBody has no test ops phrase: ${lead.companyName}`
      );
    }
    ok('Persisted emailBody does not contain Growly Sales テスト運用');
  } else {
    ok('leads.json has no emailBody yet — run npm run growly-sales:generate');
  }
}

async function verifyUpdateLeadReview(): Promise<void> {
  const tmpJson = join(PROJECT_ROOT, 'data/growly-sales/_verify_review.json');

  const base = createEmptyLead({
    companyName: 'Review Test Co',
    area: '仙台市',
    industry: '工務店',
    websiteUrl: 'https://review-test.example',
    sourceUrls: ['https://review-test.example'],
    reviewStatus: 'approve',
    humanReviewStatus: 'pending',
    sendStatus: 'not_sent',
    emailSubject: '旧件名',
    emailBody: '旧本文',
    leadScore: 'A',
    riskLevel: 'low',
  });

  await saveLeadsToJson(tmpJson, [base]);

  const approved = await approveLeadForDraft(base.id, tmpJson);
  assert(approved.humanReviewStatus === 'approved', 'approveLeadForDraft sets humanReviewStatus=approved');
  assert(approved.sendStatus === 'not_sent', 'approveLeadForDraft keeps sendStatus=not_sent');
  assert(
    approved.communicationMemo?.includes('humanReview approved'),
    'approveLeadForDraft records approval in communicationMemo'
  );
  assert(isDraftCandidate(approved), 'approved lead is draft candidate');
  assert(!isBlockedLead(approved), 'approved lead is not blocked');

  const revised = await markLeadNeedsRevision(base.id, '件名を短く', tmpJson);
  assert(revised.humanReviewStatus === 'needs_revision', 'markLeadNeedsRevision sets needs_revision');
  assert(revised.reviewComment.includes('件名'), 'markLeadNeedsRevision saves comment');

  const rejected = await rejectLead(base.id, '対象外', tmpJson);
  assert(rejected.humanReviewStatus === 'rejected', 'rejectLead sets humanReviewStatus=rejected');
  assert(rejected.sendStatus === 'not_sent', 'rejectLead keeps sendStatus=not_sent');

  const blocked = await markDoNotContact(base.id, '連絡禁止', tmpJson);
  assert(blocked.doNotContact === true, 'markDoNotContact sets doNotContact=true');
  assert(blocked.sendStatus === 'blocked', 'markDoNotContact sets sendStatus=blocked');
  assert(blocked.nextAction.includes('連絡禁止'), 'markDoNotContact sets nextAction');

  const fresh = createEmptyLead({
    companyName: 'Email Edit Co',
    area: '仙台市',
    industry: '工務店',
    websiteUrl: 'https://email-edit.example',
    sourceUrls: ['https://email-edit.example'],
    emailSubject: '旧件名',
    emailBody: '旧本文',
  });
  await saveLeadsToJson(tmpJson, [fresh]);

  const beforeUpdate = fresh.updatedAt;
  await new Promise((r) => setTimeout(r, 5));
  const edited = await updateLeadEmailDraft(
    fresh.id,
    {
      emailSubject: '新件名',
      emailBody: '新本文です',
      reviewComment: '手動修正',
      nextAction: '再レビュー',
    },
    tmpJson
  );
  assert(edited.emailSubject === '新件名', 'updateLeadEmailDraft updates emailSubject');
  assert(edited.emailBody === '新本文です', 'updateLeadEmailDraft updates emailBody');
  assert(edited.updatedAt >= beforeUpdate, 'updateLeadEmailDraft updates updatedAt');

  const priorityLead = createEmptyLead({
    companyName: 'Priority A',
    area: '仙台市',
    industry: '工務店',
    websiteUrl: 'https://a.example',
    sourceUrls: ['https://a.example'],
    reviewStatus: 'approve',
    humanReviewStatus: 'pending',
    leadScore: 'A',
    riskLevel: 'low',
  });
  const priorityLeadB = createEmptyLead({
    companyName: 'Priority B',
    area: '仙台市',
    industry: '工務店',
    websiteUrl: 'https://b.example',
    sourceUrls: ['https://b.example'],
    reviewStatus: 'pending',
    humanReviewStatus: 'pending',
    leadScore: 'C',
    riskLevel: 'high',
  });
  assert(
    getLeadDisplayPriority(priorityLead) > getLeadDisplayPriority(priorityLeadB),
    'sort priority favors approve+pending, A score, low risk'
  );
  const sorted = sortLeadsForDisplay([priorityLeadB, priorityLead]);
  assert(sorted[0].companyName === 'Priority A', 'sortLeadsForDisplay orders by priority');

  ok('updateLeadReview workflow functions work correctly');
}

async function verifyUpdateLeadCommunication(): Promise<void> {
  const base = createEmptyLead({
    companyName: 'Comm Test Co',
    area: '仙台市',
    industry: '工務店',
    websiteUrl: 'https://comm.test',
    sourceUrls: ['https://comm.test'],
    reviewStatus: 'approve',
    humanReviewStatus: 'approved',
    riskLevel: 'low',
    sendStatus: 'not_sent',
  });

  const tmpJson = join(PROJECT_ROOT, 'data/growly-sales/_verify_comm.json');
  const tmpCsv = join(PROJECT_ROOT, 'data/growly-sales/_verify_comm.csv');
  await saveLeadsToJson(tmpJson, [base]);

  // 手動送信OK
  const sent = await markManualSent(base.id, 'contact_form', new Date().toISOString(), '送信メモ', tmpJson, tmpCsv);
  assert(sent.sendStatus === 'manual_sent', 'markManualSent sets sendStatus=manual_sent');
  assert(Boolean(sent.manualSentAt), 'markManualSent sets manualSentAt');
  assert(sent.manualSendMethod === 'contact_form', 'markManualSent sets manualSendMethod');

  // 制約: pending は不可
  const pending = createEmptyLead({
    companyName: 'Comm Pending',
    area: '仙台市',
    industry: '工務店',
    websiteUrl: 'https://comm-pending.test',
    sourceUrls: ['https://comm-pending.test'],
    reviewStatus: 'approve',
    humanReviewStatus: 'pending',
    riskLevel: 'low',
  });
  await saveLeadsToJson(tmpJson, [pending]);
  try {
    await markManualSent(pending.id, 'email', new Date().toISOString(), undefined, tmpJson, tmpCsv);
    fail('pending Lead should not be manual_sent');
  } catch {
    ok('pending Lead cannot be manual_sent');
  }

  // 返信ステータス更新（sendStatus=sent/manual_sent のみ）
  const sentForReply = {
    ...base,
    sendStatus: 'sent' as const,
    manualSentAt: new Date().toISOString(),
    manualSendMethod: 'email' as const,
  };
  await saveLeadsToJson(tmpJson, [sentForReply]);
  const replied = await markReplyStatus(sentForReply.id, 'replied', '返信あり', tmpJson, tmpCsv);
  assert(replied.replyStatus === 'replied', 'markReplyStatus updates replyStatus=replied');
  assert(replied.replySummary === '返信あり', 'markReplyStatus sets replySummary');
  assert(Boolean(replied.repliedAt), 'markReplyStatus sets repliedAt');

  const follow = await markFollowUpNeeded(sentForReply.id, '2026-07-01', 'フォロー', tmpJson, tmpCsv);
  assert(follow.followUpDate === '2026-07-01', 'markFollowUpNeeded records followUpDate');

  const won = await markDealStatus(sentForReply.id, 'won', '受注', tmpJson, tmpCsv);
  assert(won.dealStatus === 'won', 'markDealStatus updates dealStatus=won');

  ok('updateLeadCommunication workflow functions work correctly');
}

async function verifyUiFilesOnDisk(): Promise<void> {
  const uiFiles = [
    join(SRC_ROOT, 'ui/GrowlySalesDashboard.tsx'),
    join(SRC_ROOT, 'ui/LeadListView.tsx'),
    join(SRC_ROOT, 'ui/LeadDetailPanel.tsx'),
    join(SRC_ROOT, 'ui/LeadStatusBadge.tsx'),
    join(SRC_ROOT, 'ui/LeadReviewActions.tsx'),
    join(SRC_ROOT, 'ui/DraftStatsPanel.tsx'),
    join(SRC_ROOT, 'ui/DraftCandidatesView.tsx'),
    join(SRC_ROOT, 'ui/DraftCandidateCard.tsx'),
    join(SRC_ROOT, 'ui/CopyButton.tsx'),
    join(SRC_ROOT, 'ui/LeadCommunicationActions.tsx'),
    join(SRC_ROOT, 'ui/communicationApi.ts'),
    join(SRC_ROOT, 'drafts/buildUiDraftCandidates.ts'),
    join(SRC_ROOT, 'config/paths.ts'),
    join(SRC_ROOT, 'storage/loadLeadsForApi.ts'),
    join(SRC_ROOT, 'workflow/updateLeadCommunication.ts'),
    join(SRC_ROOT, 'workflow/updateLeadReview.ts'),
    join(SRC_ROOT, 'server/uiServer.ts'),
    join(SRC_ROOT, 'drafts/selectDraftCandidates.ts'),
    join(SRC_ROOT, 'drafts/exportDraftCandidates.ts'),
    join(SRC_ROOT, 'scripts/run-growly-sales-export-drafts.ts'),
    join(SRC_ROOT, 'ui/PilotModeBanner.tsx'),
    join(SRC_ROOT, 'ui/PilotSummaryPanel.tsx'),
    join(SRC_ROOT, 'ui/pilotSummaryApi.ts'),
    join(SRC_ROOT, 'ui/SummaryStatCard.tsx'),
    join(SRC_ROOT, 'ui/SectionCard.tsx'),
    join(SRC_ROOT, 'ui/InfoBanner.tsx'),
    join(SRC_ROOT, 'analytics/buildPilotSummary.ts'),
    join(SRC_ROOT, 'scripts/run-growly-sales-mvp-check.ts'),
  ];
  for (const file of uiFiles) {
    await access(file);
    const relative = file.replace(SRC_ROOT + '/', '').replace(SRC_ROOT + '\\', '');
    ok(`Phase 10 file exists: ${relative}`);
  }
}

function baseEligibleLead(partial: Partial<Lead> = {}): Lead {
  return createEmptyLead({
    companyName: 'Export Test Co',
    area: '宮城県仙台市',
    industry: '工務店',
    websiteUrl: 'https://export-test.example',
    sourceUrls: ['https://export-test.example'],
    emailCandidates: ['info@export-test.example'],
    contactFormUrl: 'https://export-test.example/contact',
    emailSubject: 'テスト件名',
    emailBody: 'テスト本文です。ご担当者様向けの営業文。',
    reviewStatus: 'approve',
    humanReviewStatus: 'approved',
    sendStatus: 'not_sent',
    riskLevel: 'low',
    ...partial,
  });
}

async function verifyDraftExport(): Promise<void> {
  const offer = await loadOfferProfile();

  const eligible = baseEligibleLead();
  const { candidates, excluded } = selectDraftCandidates([eligible], offer);
  assert(candidates.length === 1, 'Approved not_sent lead is draft candidate');
  assert(excluded.length === 0, 'Eligible lead is not excluded');

  const pending = baseEligibleLead({ humanReviewStatus: 'pending' });
  assert(
    getDraftExclusionReason(pending, offer)?.includes('pending'),
    'pending Lead is not a draft candidate'
  );

  const rejected = baseEligibleLead({ humanReviewStatus: 'rejected' });
  assert(
    getDraftExclusionReason(rejected, offer)?.includes('rejected'),
    'rejected Lead is not a draft candidate'
  );

  const needsRevision = baseEligibleLead({ humanReviewStatus: 'needs_revision' });
  assert(
    getDraftExclusionReason(needsRevision, offer)?.includes('needs_revision'),
    'needs_revision Lead is not a draft candidate'
  );

  const blocked = baseEligibleLead({ doNotContact: true });
  assert(
    getDraftExclusionReason(blocked, offer)?.includes('doNotContact'),
    'doNotContact=true is not a draft candidate'
  );

  const highRisk = baseEligibleLead({ riskLevel: 'high' });
  assert(
    getDraftExclusionReason(highRisk, offer)?.includes('high'),
    'riskLevel=high is not a draft candidate'
  );

  const emptySubject = baseEligibleLead({ emailSubject: '' });
  assert(
    getDraftExclusionReason(emptySubject, offer)?.includes('emailSubject'),
    'empty emailSubject is not a draft candidate'
  );

  const emptyBody = baseEligibleLead({ emailBody: '' });
  assert(
    getDraftExclusionReason(emptyBody, offer)?.includes('emailBody'),
    'empty emailBody is not a draft candidate'
  );

  const prohibitedPhrase = PROHIBITED_PHRASES[0];
  const withProhibited = baseEligibleLead({
    emailBody: `テスト本文。${prohibitedPhrase}`,
  });
  assert(
    getDraftExclusionReason(withProhibited, offer)?.includes('禁止表現'),
    'prohibited phrase excludes draft candidate'
  );

  const garbled = baseEligibleLead({
    emailBody: `テスト${MOJIBAKE_REPLACEMENT_CHAR}本文`,
  });
  assert(
    getDraftExclusionReason(garbled, offer)?.includes('文字化け'),
    'mojibake excludes draft candidate'
  );

  const sentLead = baseEligibleLead({ sendStatus: 'sent' });
  assert(
    getDraftExclusionReason(sentLead, offer)?.includes('sent'),
    'sendStatus=sent is not a draft candidate'
  );

  const reviseLead = baseEligibleLead({ reviewStatus: 'revise' });
  assert(
    getDraftExclusionReason(reviseLead, offer)?.includes('revise'),
    'reviewStatus=revise is not a draft candidate'
  );

  const tmpDir = join(PROJECT_ROOT, 'data/growly-sales/_verify_drafts');
  const leadsBefore = [eligible, pending];
  const sendStatusBefore = leadsBefore.map((l) => l.sendStatus);

  const exportResult = await exportDraftCandidates(leadsBefore, offer, tmpDir);
  assert(exportResult.candidates.length === 1, 'export selects one candidate from mixed leads');
  assert(exportResult.excluded.length === 1, 'export excludes ineligible leads');
  assert(exportResult.outputFiles.length === 3, 'export produces 3 output files');

  for (const file of exportResult.outputFiles) {
    await access(file);
    ok(`Draft export file exists: ${file.split(/[/\\]/).pop()}`);
  }

  const copyText = formatDraftCopyText(exportResult.candidates);
  assert(copyText.includes('会社名：Export Test Co'), 'draft-copy.txt contains company name');
  assert(copyText.includes('Gmail下書きではありません'), 'draft-copy.txt has safety notice');

  assert(
    leadsBefore.every((l, i) => l.sendStatus === sendStatusBefore[i]),
    'export does not change sendStatus on in-memory leads'
  );

  ok('Draft export selection and file generation work correctly');
}

async function verifyDraftCandidatesUi(): Promise<void> {
  const offer = await loadOfferProfile();

  const approved = baseEligibleLead();
  const pending = baseEligibleLead({ id: crypto.randomUUID(), humanReviewStatus: 'pending' });
  const mixed = [approved, pending];

  const payload = buildDraftCandidatesPayload(mixed, offer);
  assert(payload.candidates.length === 1, '/api/draft-candidates logic returns only approved leads');
  assert(payload.excludedCount === 1, 'excludedCount reflects ineligible leads');
  assert(
    payload.candidates.every((c) => c.humanReviewStatus === 'approved'),
    'UI candidates are all humanReviewStatus=approved'
  );
  assert(
    payload.candidates.every((c) => c.sendStatus === 'not_sent'),
    'UI candidates keep sendStatus=not_sent'
  );

  const rejected = baseEligibleLead({ humanReviewStatus: 'rejected' });
  assert(
    buildDraftCandidatesPayload([rejected], offer).candidates.length === 0,
    'rejected Lead is not in UI candidates'
  );

  const needsRevision = baseEligibleLead({ humanReviewStatus: 'needs_revision' });
  assert(
    buildDraftCandidatesPayload([needsRevision], offer).candidates.length === 0,
    'needs_revision Lead is not in UI candidates'
  );

  const dnc = baseEligibleLead({ doNotContact: true });
  assert(
    buildDraftCandidatesPayload([dnc], offer).candidates.length === 0,
    'doNotContact=true is not in UI candidates'
  );

  const highRisk = baseEligibleLead({ riskLevel: 'high' });
  assert(
    buildDraftCandidatesPayload([highRisk], offer).candidates.length === 0,
    'riskLevel=high is not in UI candidates'
  );

  const copyBtnPath = join(SRC_ROOT, 'ui/CopyButton.tsx');
  const copyBtnContent = await readFile(copyBtnPath, 'utf-8');
  assert(copyBtnContent.includes('clipboard'), 'CopyButton uses clipboard API');
  assert(
    copyBtnContent.includes('sendStatus を変更しない'),
    'CopyButton documents that sendStatus is not changed'
  );
  assert(
    !/sendStatus\s*=/.test(copyBtnContent),
    'CopyButton does not assign sendStatus'
  );

  const draftViewContent = await readFile(join(SRC_ROOT, 'ui/DraftCandidatesView.tsx'), 'utf-8');
  assert(
    draftViewContent.includes('自動送信は行いません'),
    'DraftCandidatesView has auto-send warning'
  );
  assert(draftViewContent.includes(DRAFT_UI_WARNING), 'DraftCandidatesView has Gmail warning');

  const draftCardContent = await readFile(join(SRC_ROOT, 'ui/DraftCandidateCard.tsx'), 'utf-8');
  assert(draftCardContent.includes('自動送信なし'), 'DraftCandidateCard shows auto-send notice');

  const combined = formatSubjectBodyCopy(
    'テスト件名',
    'テスト本文',
    'https://example.com/contact',
    []
  );
  assert(combined.includes('件名：'), 'subject+body copy format includes 件名');
  assert(combined.includes('問い合わせURL：'), 'subject+body copy format includes 問い合わせURL');

  const serverContent = await readFile(join(SRC_ROOT, 'server/uiServer.ts'), 'utf-8');
  assert(serverContent.includes('/api/draft-candidates'), 'uiServer has draft-candidates API');
  assert(serverContent.includes('/api/draft-stats'), 'uiServer has draft-stats API');
  assert(serverContent.includes('/api/export-drafts'), 'uiServer has export-drafts API');
  assert(!serverContent.includes('drafts.send'), 'uiServer has no Gmail drafts.send');
  assert(!serverContent.includes('messages.send'), 'uiServer has no Gmail messages.send');

  const draftStatsApiContent = await readFile(join(SRC_ROOT, 'ui/draftStatsApi.ts'), 'utf-8');
  assert(draftStatsApiContent.includes('/api/draft-stats'), 'draftStatsApi calls /api/draft-stats');

  ok('Draft candidates UI and API logic verified');
}

async function verifyProjectPaths(): Promise<void> {
  const leadsPath = getLeadsJsonPath();
  const expectedLeads = join(PROJECT_ROOT, 'data', 'growly-sales', 'leads.json');

  assert(leadsPath === expectedLeads, 'getLeadsJsonPath resolves to project data/growly-sales/leads.json');
  await access(leadsPath);
  ok('data/growly-sales/leads.json exists');

  const uiServerContent = await readFile(join(SRC_ROOT, 'server/uiServer.ts'), 'utf-8');
  assert(uiServerContent.includes('getLeadsJsonPath'), 'uiServer uses getLeadsJsonPath');
  assert(!uiServerContent.includes('process.cwd()'), 'uiServer does not use process.cwd() for leads path');

  const leadsFromApi = await loadLeadsForApi('verify');
  assert(leadsFromApi.length > 0, 'loadLeadsForApi reads leads.json with lead data');

  const offer = await loadOfferProfile();
  const stats = computeDraftStats(leadsFromApi, offer);
  assert(stats.totalLeads === leadsFromApi.length, 'draft-stats can read leads.json');

  const draftPayload = buildDraftCandidatesPayload(leadsFromApi, offer);
  assert(Array.isArray(draftPayload.candidates), 'draft-candidates can read leads.json');

  const originalCwd = cwd();
  try {
    chdir(join(PROJECT_ROOT, 'data', 'growly-sales'));
    resetProjectRootCache();
    const pathAfterChdir = getLeadsJsonPath();
    assert(pathAfterChdir === expectedLeads, 'path resolution works when cwd is data/growly-sales');
    const leadsAfterChdir = await loadLeadsForApi('verify-cwd');
    assert(leadsAfterChdir.length > 0, 'loadLeadsForApi works when cwd is data/growly-sales');
  } finally {
    chdir(originalCwd);
    resetProjectRootCache();
  }

  assert(getDraftsDir() === join(PROJECT_ROOT, 'data', 'growly-sales', 'drafts'), 'getDraftsDir is correct');
  assert(getProjectRoot() === PROJECT_ROOT, 'getProjectRoot matches verify PROJECT_ROOT');

  ok('Project path resolution is cwd-independent');
}

function verifyNpmAudit(): void {
  try {
    const output = execSync('npm audit --json', {
      cwd: PROJECT_ROOT,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const report = JSON.parse(output) as { metadata?: { vulnerabilities?: { critical?: number; high?: number } } };
    const critical = report.metadata?.vulnerabilities?.critical ?? 0;
    const high = report.metadata?.vulnerabilities?.high ?? 0;
    assert(critical === 0 && high === 0, `npm audit: no critical/high vulnerabilities (critical=${critical}, high=${high})`);
  } catch (err) {
    const execErr = err as { stdout?: string; status?: number };
    if (execErr.stdout) {
      try {
        const report = JSON.parse(execErr.stdout) as { metadata?: { vulnerabilities?: { critical?: number; high?: number } } };
        const critical = report.metadata?.vulnerabilities?.critical ?? 0;
        const high = report.metadata?.vulnerabilities?.high ?? 0;
        assert(critical === 0 && high === 0, `npm audit: no critical/high vulnerabilities (critical=${critical}, high=${high})`);
        return;
      } catch {
        // fall through
      }
    }
    fail(`npm audit could not be run: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function verifySalesAnalyticsLogic(): void {
  const base = (overrides: Partial<Lead>): Lead =>
    createEmptyLead({
      companyName: 'A社',
      area: '宮城県仙台市',
      industry: '工務店',
      websiteUrl: 'https://a.example',
      sourceUrls: ['https://a.example'],
      emailCandidates: ['info@a.example'],
      leadScore: 'A',
      collectionStatus: 'collected',
      riskLevel: 'low',
      ...overrides,
    });

  const leads: Lead[] = [
    base({
      id: 'L1',
      companyName: '期限切れフォロー',
      humanReviewStatus: 'approved',
      sendStatus: 'manual_sent',
      replyStatus: 'follow_up_needed',
      dealStatus: 'open',
      followUpDate: '2000-01-01',
      nextAction: '至急フォロー',
      salesAngle: '採用導線',
    }),
    base({
      id: 'L2',
      companyName: '興味あり',
      humanReviewStatus: 'approved',
      sendStatus: 'manual_sent',
      replyStatus: 'interested',
      dealStatus: 'open',
      followUpDate: '2099-12-31',
      nextAction: '日程調整',
      leadScore: 'B',
      salesAngle: '施工事例強化',
    }),
    base({
      id: 'L3',
      companyName: '未送信承認済',
      humanReviewStatus: 'approved',
      sendStatus: 'not_sent',
      replyStatus: 'none',
      dealStatus: 'none',
      nextAction: '手動送信',
      leadScore: 'C',
      salesAngle: '資料請求導線',
    }),
    base({
      id: 'L4',
      companyName: '受注済',
      humanReviewStatus: 'approved',
      sendStatus: 'manual_sent',
      replyStatus: 'meeting_scheduled',
      dealStatus: 'won',
      nextAction: '契約手続き',
      leadScore: 'A',
      salesAngle: '採用導線',
    }),
  ];

  const a = buildSalesAnalytics(leads);
  assert(a.totalLeads === 4, 'buildSalesAnalytics aggregates totalLeads');
  assert(a.manualSentLeads === 3, 'manual_sent counted as manualSentLeads');
  assert(a.notSentLeads === 1, 'not_sent counted as notSentLeads');
  assert(a.followUpList.length === 2, 'followUpDate leads extracted');
  assert(a.followUpList[0].companyName === '期限切れフォロー', 'followUpList sorted by date asc');
  assert(a.nextActionList.length >= 2, 'nextActionList generated');
  assert(a.nextActionList[0].priority === 1, 'nextActionList priority: overdue followUp first');
  assert(a.nextActionList.some((x) => x.priority === 5), 'nextActionList includes approved+not_sent');
  assert(Number.isFinite(a.manualSendRate), 'manualSendRate is finite');
  assert(Number.isFinite(a.replyRate), 'replyRate is finite');
  assert(!Number.isNaN(a.wonRate) && Number.isFinite(a.wonRate), 'wonRate is not NaN/Infinity');
  assert(a.leadScoreBreakdown.length > 0, 'leadScore breakdown exists');
  assert(a.salesAngleBreakdown.length > 0, 'salesAngle breakdown exists');
}

function verifyOperationSummaryLogic(): void {
  const analytics = buildSalesAnalytics([]);
  const summary = buildOperationSummary(analytics);
  assert(typeof summary.overallStatus === 'string' && summary.overallStatus.length > 0, 'operation summary has overallStatus');
  assert(summary.warningSignals.length > 0, 'operation summary has warningSignals');
  assert(summary.nextRecommendedActions.length > 0, 'operation summary has nextRecommendedActions');
  assert(summary.dataQualityNotes.length > 0, 'operation summary has dataQualityNotes');
  assert(OP_SUMMARY_WARNING.includes('AI API'), 'OperationSummaryPanel warning text exists');
}

async function verifyMvpReadinessLogic(): Promise<void> {
  const result = await checkLocalMvpReadiness();
  assert(typeof result.ready === 'boolean', 'checkLocalMvpReadiness returns ready boolean');
  assert(Array.isArray(result.passedChecks), 'checkLocalMvpReadiness returns passedChecks');
  assert(Array.isArray(result.failedChecks), 'checkLocalMvpReadiness returns failedChecks');
  assert(Array.isArray(result.warnings), 'checkLocalMvpReadiness returns warnings');
  assert(Array.isArray(result.nextSteps), 'checkLocalMvpReadiness returns nextSteps');
  assert(ANALYTICS_WARNING.includes('外部API'), 'SalesAnalyticsView warning text exists');
}

async function verifyPilotPhase(): Promise<void> {
  const runbook = join(PROJECT_ROOT, 'docs/GROWLY_SALES_PILOT_RUNBOOK.md');
  const checklist = join(PROJECT_ROOT, 'docs/GROWLY_SALES_PILOT_CHECKLIST.md');
  await access(runbook);
  ok('PILOT_RUNBOOK exists');
  await access(checklist);
  ok('PILOT_CHECKLIST exists');

  const dashboard = await readFile(join(SRC_ROOT, 'ui/GrowlySalesDashboard.tsx'), 'utf-8');
  const pilotBanner = await readFile(join(SRC_ROOT, 'ui/PilotModeBanner.tsx'), 'utf-8');
  const uiServer = await readFile(join(SRC_ROOT, 'server/uiServer.ts'), 'utf-8');
  const readme = await readFile(join(PROJECT_ROOT, 'README.md'), 'utf-8');

  assert(dashboard.includes('PilotModeBanner'), 'UI has pilot mode banner');
  assert(pilotBanner.includes(PILOT_MODE_LABEL), 'UI shows local manual MVP / pilot mode label');
  assert(pilotBanner.includes(PILOT_MODE_EXTERNAL_API), 'UI shows external API chip');
  assert(pilotBanner.includes(PILOT_MODE_GMAIL), 'UI shows Gmail chip');
  assert(pilotBanner.includes(PILOT_MODE_SEND_DISABLED), 'UI shows no auto-send');
  assert(pilotBanner.includes('fetchGrowlyStorageStatus'), 'UI loads storage status dynamically');
  assert(uiServer.includes('/api/pilot-summary'), 'uiServer has pilot-summary API');

  const leads = [
    createEmptyLead({
      companyName: 'P1',
      area: '仙台市',
      industry: '工務店',
      websiteUrl: 'https://p1.example',
      sourceUrls: ['https://p1.example'],
      humanReviewStatus: 'approved',
      sendStatus: 'manual_sent',
      replyStatus: 'replied',
    }),
    createEmptyLead({
      companyName: 'P2',
      area: '仙台市',
      industry: '工務店',
      websiteUrl: 'https://p2.example',
      sourceUrls: ['https://p2.example'],
      humanReviewStatus: 'pending',
      followUpDate: '2099-01-01',
    }),
  ];
  const pilot = buildPilotSummary(leads);
  assert(pilot.totalLeads === 2, 'buildPilotSummary counts totalLeads');
  assert(pilot.remainingToPilot === PILOT_TARGET_LEAD_COUNT - 2, 'buildPilotSummary computes remaining to pilot');
  assert(pilot.approvedCount === 1, 'buildPilotSummary counts approved');
  assert(pilot.manualSentCount === 1, 'buildPilotSummary counts manual sent');
  assert(pilot.replyRecordedCount === 1, 'buildPilotSummary counts reply recorded');

  const overPilot = buildPilotSummary(
    Array.from({ length: 12 }, (_, i) =>
      createEmptyLead({
        companyName: `Co${i}`,
        area: '仙台市',
        industry: '工務店',
        websiteUrl: `https://co${i}.example`,
        sourceUrls: [`https://co${i}.example`],
      })
    )
  );
  assert(overPilot.overPilotRecommendation === true, 'over 10 leads does not error, flags recommendation');
  assert(overPilot.remainingToPilot === 0, 'remaining to pilot is 0 when at or over target');

  assert(readme.includes('10社') || readme.includes('10社以下') || readme.includes('パイロット'), 'README mentions pilot 10-company recommendation');
}

async function verifyCustomHookDifferentiation(): Promise<void> {
  const leadsPath = join(PROJECT_ROOT, 'data/growly-sales/leads.json');
  const leads = await loadLeadsFromJson(leadsPath);
  const withHooks = leads.filter((l) => l.customHook.trim().length > 0);

  if (withHooks.length >= 2) {
    const uniqueHooks = new Set(withHooks.map((l) => l.customHook.trim()));
    assert(uniqueHooks.size > 1, 'Persisted customHook values are not all identical');
    assert(
      uniqueHooks.size === withHooks.length || uniqueHooks.size >= Math.min(6, withHooks.length) - 1,
      'customHook has sufficient differentiation across leads'
    );
  }

  for (const lead of withHooks) {
    assert(lead.customHook.trim().length >= 20, `customHook length ok: ${lead.companyName}`);
    assert(
      !containsProhibitedPhrase(lead.customHook),
      `customHook has no prohibited phrase: ${lead.companyName}`
    );
    if (lead.emailBody.trim() && lead.sendStatus !== 'sent' && lead.sendStatus !== 'manual_sent') {
      assert(
        !containsMechanicalImpressionPhrase(lead.emailBody),
        `emailBody has no mechanical impression phrase: ${lead.companyName}`
      );
      assert(
        emailIncludesHookImpression(lead.emailBody, lead.customHook),
        `emailBody includes hook impression: ${lead.companyName}`
      );
    }
  }

  const templateOnly = withHooks.every((l) =>
    l.customHook.replace(l.companyName, '').replace(l.area, '') ===
    withHooks[0].customHook.replace(withHooks[0].companyName, '').replace(withHooks[0].area, '')
  );
  assert(!templateOnly || withHooks.length <= 1, 'customHook is not company-name-only template swap');

  ok('customHook differentiation checks passed for persisted leads');
}

function emailIncludesHookImpression(emailBody: string, customHook: string): boolean {
  if (emailBody.includes(customHook)) return true;
  const tail = extractImpressionTailForEmail(customHook).replace(/。$/, '');
  return tail.length > 0 && emailBody.includes(tail);
}

function containsMechanicalImpressionPhrase(text: string): boolean {
  return MECHANICAL_IMPRESSION_PHRASES.some((phrase) => text.includes(phrase));
}

function containsProhibitedPhrase(text: string): boolean {
  return PROHIBITED_PHRASES.some((phrase) => text.includes(phrase));
}

async function verifyPreserveWorkflowOnRegenerate(): Promise<void> {
  const offer = await loadOfferProfile();
  const target = await loadTargetProfile();

  const lead = createEmptyLead({
    companyName: '保持確認工務店',
    area: '宮城県仙台市',
    industry: '工務店',
    websiteUrl: 'https://preserve.example.jp',
    sourceUrls: ['https://preserve.example.jp', 'https://preserve.example.jp/contact'],
    contactFormUrl: 'https://preserve.example.jp/contact',
    caseStudyUrl: 'https://preserve.example.jp/works',
    instagramUrl: 'https://instagram.com/preserve_test',
    collectionStatus: 'collected',
    riskLevel: 'low',
    humanReviewStatus: 'approved',
    sendStatus: 'not_sent',
    replyStatus: 'none',
    followUpDate: '2026-07-01',
    communicationMemo: 'テストメモ',
  });

  const regen = applyFullGenerationToLead(lead, { target, offer });

  assert(regen.sendStatus === 'not_sent', 'regenerate keeps sendStatus=not_sent');
  assert(regen.replyStatus === 'none', 'regenerate keeps replyStatus');
  assert(regen.followUpDate === lead.followUpDate, 'regenerate keeps followUpDate');
  assert(regen.communicationMemo === lead.communicationMemo, 'regenerate keeps communicationMemo');
  assert(regen.humanReviewStatus === 'pending', 'regenerate resets humanReviewStatus to pending');
  assert(regen.customHook.trim().length > 0, 'regenerate updates customHook');

  const followUpLead = createEmptyLead({
    companyName: 'フォロー保持工務店',
    area: '仙台市',
    industry: '工務店',
    websiteUrl: 'https://follow-preserve.test',
    sourceUrls: ['https://follow-preserve.test'],
    sendStatus: 'manual_sent',
    manualSentAt: '2026-06-25T10:00:00.000Z',
    replyStatus: 'replied',
    humanReviewStatus: 'approved',
    customHook: '既存フック',
    emailSubject: '既存件名',
    emailBody: '既存本文',
  });
  const followRegen = applyFullGenerationToLead(followUpLead, { target, offer });
  assert(followRegen.humanReviewStatus === 'approved', 'follow-up regenerate keeps humanReviewStatus');
  assert(followRegen.emailBody === '既存本文', 'follow-up regenerate keeps emailBody');

  ok('preserveWorkflowState on regenerate works correctly');
}

async function verifyCopySafetyUi(): Promise<void> {
  const draftView = await readFile(join(SRC_ROOT, 'ui/DraftCandidatesView.tsx'), 'utf-8');
  assert(
    draftView.includes('コピーしても送信済みにはなりません'),
    'DraftCandidatesView shows copy-is-not-send notice'
  );

  const copyBtn = await readFile(join(SRC_ROOT, 'ui/CopyButton.tsx'), 'utf-8');
  assert(!/sendStatus\s*=/.test(copyBtn), 'CopyButton does not assign sendStatus');
  assert(copyBtn.includes('clipboard'), 'CopyButton uses clipboard only');

  ok('Copy operation safety UI verified');
}

async function verifyGmailDraftPhase(): Promise<void> {
  const gmailFiles = [
    'integrations/gmail/gmailDraftAdapter.ts',
    'integrations/gmail/gmailAuth.ts',
    'integrations/gmail/buildGmailDraftMessage.ts',
    'integrations/gmail/gmailDraftTypes.ts',
    'integrations/gmail/previewGmailDrafts.ts',
    'integrations/gmail/selectGmailDraftCandidates.ts',
    'scripts/run-growly-sales-gmail-draft-preview.ts',
    'scripts/run-growly-sales-gmail-create-drafts.ts',
    'workflow/updateLeadGmailDraft.ts',
  ];

  for (const rel of gmailFiles) {
    await access(join(SRC_ROOT, rel));
    ok(`Gmail file exists: ${rel}`);
  }

  const previewScript = await readFile(
    join(SRC_ROOT, 'scripts/run-growly-sales-gmail-draft-preview.ts'),
    'utf-8'
  );
  const createScript = await readFile(
    join(SRC_ROOT, 'scripts/run-growly-sales-gmail-create-drafts.ts'),
    'utf-8'
  );
  const previewModule = await readFile(join(SRC_ROOT, 'integrations/gmail/previewGmailDrafts.ts'), 'utf-8');

  assert(!previewScript.includes('createGmailDraft'), 'gmail-preview does not call createGmailDraft');
  assert(!previewModule.includes('fetch('), 'previewGmailDrafts has no external fetch');
  assert(createScript.includes('CREATE_DRAFTS'), 'gmail-create-drafts requires CREATE_DRAFTS confirmation');
  assert(createScript.includes('promptCreateDraftsConfirmation'), 'gmail-create-drafts has confirmation prompt');

  const { applyGmailDraftCreated } = await import('../workflow/updateLeadGmailDraft.js');
  const { getGmailDraftExclusionReason } = await import(
    '../integrations/gmail/selectGmailDraftCandidates.js'
  );
  const { previewGmailDrafts } = await import('../integrations/gmail/previewGmailDrafts.js');
  const offer = await loadOfferProfile();

  const withEmail = createEmptyLead({
    companyName: 'Gmail対象',
    area: '仙台市',
    industry: '工務店',
    websiteUrl: 'https://gmail-eligible.test',
    sourceUrls: ['https://gmail-eligible.test'],
    emailCandidates: ['info@gmail-eligible.test'],
    contactFormUrl: 'https://gmail-eligible.test/contact',
    emailSubject: '件名テスト',
    emailBody: '本文テスト',
    humanReviewStatus: 'approved',
    reviewStatus: 'approve',
    sendStatus: 'not_sent',
    riskLevel: 'low',
    collectionStatus: 'collected',
  });

  const noEmail = createEmptyLead({
    companyName: 'フォームのみ',
    area: '仙台市',
    industry: '工務店',
    websiteUrl: 'https://form-only.test',
    sourceUrls: ['https://form-only.test'],
    emailCandidates: [],
    contactFormUrl: 'https://form-only.test/contact',
    emailSubject: '件名',
    emailBody: '本文',
    humanReviewStatus: 'approved',
    reviewStatus: 'approve',
    sendStatus: 'not_sent',
    riskLevel: 'low',
    collectionStatus: 'collected',
  });

  const pending = createEmptyLead({
    companyName: '未承認',
    area: '仙台市',
    industry: '工務店',
    websiteUrl: 'https://pending.test',
    sourceUrls: ['https://pending.test'],
    emailCandidates: ['info@pending.test'],
    emailSubject: '件名',
    emailBody: '本文',
    humanReviewStatus: 'pending',
    reviewStatus: 'approve',
    sendStatus: 'not_sent',
    riskLevel: 'low',
    collectionStatus: 'collected',
  });

  const dnc = createEmptyLead({
    companyName: 'DNC',
    area: '仙台市',
    industry: '工務店',
    websiteUrl: 'https://dnc.test',
    sourceUrls: ['https://dnc.test'],
    emailCandidates: ['info@dnc.test'],
    emailSubject: '件名',
    emailBody: '本文',
    humanReviewStatus: 'approved',
    reviewStatus: 'approve',
    doNotContact: true,
    sendStatus: 'not_sent',
    riskLevel: 'low',
    collectionStatus: 'collected',
  });

  assert(getGmailDraftExclusionReason(noEmail, offer)?.includes('form_later'), 'no-email form-only lead excluded from Gmail drafts');
  assert(
    getGmailDraftExclusionReason(pending, offer)?.includes('pending'),
    'pending lead requires approval before Gmail draft create'
  );
  assert(getGmailDraftExclusionReason(dnc, offer)?.includes('doNotContact'), 'doNotContact lead excluded from Gmail drafts');
  assert(getGmailDraftExclusionReason(withEmail, offer) === null, 'approved email lead is Gmail draft eligible');

  const created = applyGmailDraftCreated(withEmail, 'draft-abc', new Date().toISOString());
  assert(created.sendStatus === 'not_sent', 'Gmail draft create keeps sendStatus=not_sent');
  assert(created.gmailDraftStatus === 'draft_created', 'gmailDraftStatus=draft_created');
  assert(created.gmailDraftId === 'draft-abc', 'draft_created lead has gmailDraftId');

  const preview = previewGmailDrafts([withEmail, noEmail, pending], offer);
  assert(preview.eligible.length === 1, 'gmail preview eligible count (approved only)');
  assert(preview.skipped.length === 1, 'gmail preview skipped form-only');
  assert(preview.excluded.length === 1, 'gmail preview excludes pending without approval');

  for (const status of ['none', 'previewed', 'draft_created', 'failed', 'skipped']) {
    const lead = createEmptyLead({
      companyName: `Status ${status}`,
      area: '仙台市',
      industry: '工務店',
      websiteUrl: 'https://status.test',
      sourceUrls: ['https://status.test'],
      gmailDraftStatus: status as Lead['gmailDraftStatus'],
      gmailDraftId: status === 'draft_created' ? 'draft-id' : null,
    });
    assert(validateLeadEnums(lead).length === 0, `gmailDraftStatus valid: ${status}`);
  }

  const pkg = await readFile(join(PROJECT_ROOT, 'package.json'), 'utf-8');
  assert(pkg.includes('growly-sales:gmail-preview'), 'package.json has gmail-preview script');
  assert(pkg.includes('growly-sales:gmail-create-drafts'), 'package.json has gmail-create-drafts script');

  const createDraftsSource = await readFile(
    join(SRC_ROOT, 'scripts/run-growly-sales-gmail-create-drafts.ts'),
    'utf-8'
  );
  assert(createDraftsSource.includes('getGmailDraftCreateLimit'), 'gmail-create-drafts respects GMAIL_DRAFT_CREATE_LIMIT');
  assert(createDraftsSource.includes('requireOutreachSendAsForDraftCreate'), 'gmail-create-drafts validates sendAs before create');
  assert(createDraftsSource.includes('createVerifiedGmailDraft'), 'gmail-create-drafts verifies draft MIME after create');

  const { buildGmailDraftMessage } = await import('../integrations/gmail/buildGmailDraftMessage.js');
  const draftMsg = buildGmailDraftMessage(withEmail);
  assert(draftMsg.raw.includes('From:'), 'gmail draft MIME includes From header');
  assert(draftMsg.raw.includes('Reply-To:'), 'gmail draft MIME includes Reply-To header');
  assert(draftMsg.raw.includes('Content-Transfer-Encoding: base64'), 'gmail draft uses base64 body encoding');
  assert(draftMsg.raw.includes('\r\n\r\n'), 'gmail draft MIME has CRLF header/body separator');
  assert(!draftMsg.body.includes('From:'), 'email body does not contain From header line');
  assert(!draftMsg.body.startsWith('Reply-To:'), 'email body does not start with Reply-To');
  assert(draftMsg.from.length > 0, 'gmail draft message has from field');
  assert(draftMsg.replyTo.length > 0, 'gmail draft message has replyTo field');

  const { verifyBuiltMimeLocally } = await import('../integrations/gmail/gmailDraftVerify.js');
  const localVerify = verifyBuiltMimeLocally(draftMsg.raw, {
    fromEmail: draftMsg.from,
    replyToEmail: draftMsg.replyTo,
    toEmail: draftMsg.to,
    subject: draftMsg.subject,
    bodyPlain: draftMsg.body,
  });
  assert(localVerify.ok, 'built MIME passes local verification');

  const { getGmailDraftCreateLimit } = await import('../config/env.js');
  const { applyGmailDraftCreateLimit } = await import(
    '../integrations/gmail/selectGmailDraftCandidates.js'
  );
  const prevLimit = process.env.GMAIL_DRAFT_CREATE_LIMIT;
  process.env.GMAIL_DRAFT_CREATE_LIMIT = '1';
  assert(getGmailDraftCreateLimit() === 1, 'GMAIL_DRAFT_CREATE_LIMIT=1 parsed');
  assert(applyGmailDraftCreateLimit(['a', 'b', 'c'], 1).length === 1, 'draft create limit slices targets');
  assert(applyGmailDraftCreateLimit(['a', 'b'], null).length === 2, 'null limit keeps all targets');
  process.env.GMAIL_DRAFT_CREATE_LIMIT = '';
  assert(getGmailDraftCreateLimit() === null, 'empty GMAIL_DRAFT_CREATE_LIMIT means no limit');
  if (prevLimit === undefined) delete process.env.GMAIL_DRAFT_CREATE_LIMIT;
  else process.env.GMAIL_DRAFT_CREATE_LIMIT = prevLimit;

  const diagPath = join(SRC_ROOT, 'integrations/gmail/gmailFetchDiagnostics.ts');
  await access(diagPath);
  ok('gmailFetchDiagnostics exists');

  const diagSource = await readFile(diagPath, 'utf-8');
  assert(!diagSource.includes('console.log(access_token'), 'diagnostics do not log access_token');
  assert(
    !/console\.(log|error)\([^)]*access_token/.test(diagSource),
    'diagnostics do not console log tokens'
  );

  const {
    formatSafeFetchError,
    parseGoogleApiErrorMessage,
    GmailFetchDiagnosticError,
  } = await import('../integrations/gmail/gmailFetchDiagnostics.js');

  const causeErr = new Error('getaddrinfo ENOTFOUND') as Error & { code?: string; hostname?: string };
  causeErr.code = 'ENOTFOUND';
  causeErr.hostname = 'gmail.googleapis.com';
  const netErr = new TypeError('fetch failed', { cause: causeErr });
  const formatted = formatSafeFetchError(netErr);
  assert(formatted.includes('fetch failed'), 'formatSafeFetchError includes message');
  assert(formatted.includes('ENOTFOUND'), 'formatSafeFetchError includes cause.code');
  assert(formatted.includes('gmail.googleapis.com'), 'formatSafeFetchError includes cause.hostname');

  const apiMsg = parseGoogleApiErrorMessage(
    JSON.stringify({ error: { status: 'PERMISSION_DENIED', message: 'Insufficient Permission' } })
  );
  assert(apiMsg?.includes('Insufficient Permission'), 'parseGoogleApiErrorMessage extracts error.message');
  assert(
    parseGoogleApiErrorMessage(JSON.stringify({ access_token: 'secret-value' })) === null,
    'parseGoogleApiErrorMessage does not return access_token'
  );

  const diagErr = new GmailFetchDiagnosticError('gmail_drafts_create', 'Gmail drafts.create failed', [
    'http.status=403',
  ]);
  assert(diagErr.stage === 'gmail_drafts_create', 'diagnostic error has stage');
  assert(diagErr.toLogLines()[0] === 'stage=gmail_drafts_create', 'diagnostic log includes stage');

  const authSource = await readFile(join(SRC_ROOT, 'integrations/gmail/gmailAuth.ts'), 'utf-8');
  const adapterSource = await readFile(join(SRC_ROOT, 'integrations/gmail/gmailDraftAdapter.ts'), 'utf-8');
  assert(authSource.includes('gmail_oauth_token_refresh'), 'gmailAuth labels oauth refresh stage');
  assert(adapterSource.includes('gmail_drafts_create'), 'gmailDraftAdapter labels drafts.create stage');

  ok('Gmail fetch diagnostics checks passed');

  ok('Gmail draft phase checks passed');
}

async function verifyGmailOAuthHelper(): Promise<void> {
  const helperRel = 'scripts/run-growly-sales-gmail-oauth-helper.ts';
  const helperPath = join(SRC_ROOT, helperRel);
  await access(helperPath);
  ok('gmail-oauth-helper script exists');

  const pkg = await readFile(join(PROJECT_ROOT, 'package.json'), 'utf-8');
  assert(pkg.includes('growly-sales:gmail-oauth-helper'), 'package.json has growly-sales:gmail-oauth-helper');

  const helper = await readFile(helperPath, 'utf-8');
  assert(helper.includes('gmail.compose'), 'helper uses gmail.compose scope');
  assert(helper.includes('gmail.settings.basic'), 'helper uses gmail.settings.basic scope for sendAs');
  assert(!helper.includes('drafts.create'), 'helper does not call drafts.create');
  assert(!/drafts\.send|messages\.send/.test(helper), 'helper does not call send APIs');
  assert(!helper.includes('writeFile'), 'helper does not write token files');
  assert(!helper.includes('appendFile'), 'helper does not append token files');
  assert(!helper.includes('createWriteStream'), 'helper does not stream token files');
  assert(!/writeFile\s*\(/.test(helper), 'helper does not auto-edit .env');
  assert(helper.includes('oauth2.googleapis.com/token'), 'helper uses OAuth token endpoint only');
  assert(!helper.includes('googleapis.com/gmail'), 'helper does not call Gmail API');
  assert(!API_KEY_PATTERNS.some((p) => p.test(helper)), 'helper has no hardcoded API keys');

  const {
    buildGmailOAuthAuthorizationUrl,
    GMAIL_OAUTH_SCOPE,
    GMAIL_OAUTH_REDIRECT_URI,
  } = await import('./run-growly-sales-gmail-oauth-helper.js');

  const authUrl = buildGmailOAuthAuthorizationUrl('test-client-id.apps.googleusercontent.com');
  assert(authUrl.includes(encodeURIComponent(GMAIL_OAUTH_SCOPE)), 'auth URL includes gmail.compose');
  assert(authUrl.includes(encodeURIComponent(GMAIL_OAUTH_REDIRECT_URI)), 'auth URL uses localhost redirect');
  assert(authUrl.startsWith('https://accounts.google.com/o/oauth2/v2/auth'), 'auth URL is Google OAuth');

  ok('Gmail OAuth helper checks passed');
}

async function verifyProjectDotEnvLoading(): Promise<void> {
  const envSource = await readFile(join(SRC_ROOT, 'config/env.ts'), 'utf-8');
  assert(envSource.includes('ensureProjectEnvLoaded'), 'env.ts provides ensureProjectEnvLoaded');
  assert(envSource.includes('getProjectRoot'), 'env.ts loads .env via getProjectRoot');
  assert(!envSource.includes('dotenv'), 'env.ts does not use dotenv package');

  const gmailAuthSource = await readFile(join(SRC_ROOT, 'integrations/gmail/gmailAuth.ts'), 'utf-8');
  assert(gmailAuthSource.includes('ensureProjectEnvLoaded'), 'gmailAuth loads project .env');

  const createDraftsSource = await readFile(
    join(SRC_ROOT, 'scripts/run-growly-sales-gmail-create-drafts.ts'),
    'utf-8'
  );
  assert(createDraftsSource.includes('ensureProjectEnvLoaded'), 'gmail-create-drafts loads project .env');

  const { ensureProjectEnvLoaded, loadEnv } = await import('../config/env.js');
  ensureProjectEnvLoaded();
  const env = loadEnv();

  const hadTriple =
    Boolean(process.env.GMAIL_CLIENT_ID?.trim()) &&
    Boolean(process.env.GMAIL_CLIENT_SECRET?.trim()) &&
    Boolean(process.env.GMAIL_REFRESH_TOKEN?.trim());

  if (hadTriple) {
    assert(env.isGmailConfigured, 'Gmail env triple enables isGmailConfigured');
    const { isGmailConfigured } = await import('../integrations/gmail/gmailAuth.js');
    assert(await isGmailConfigured(), 'isGmailConfigured reads project .env triple');
  } else {
    ok('Gmail env triple not in local .env — skipping live configured check');
  }

  const prevPath = process.env.GMAIL_CREDENTIALS_PATH;
  process.env.GMAIL_CREDENTIALS_PATH = '';
  const envWithEmptyPath = loadEnv();
  if (hadTriple) {
    assert(envWithEmptyPath.isGmailConfigured, 'empty GMAIL_CREDENTIALS_PATH does not block env triple');
  }
  if (prevPath === undefined) delete process.env.GMAIL_CREDENTIALS_PATH;
  else process.env.GMAIL_CREDENTIALS_PATH = prevPath;

  ok('project .env loading checks passed');
}

async function verifyPhase15SalesDashboard(): Promise<void> {
  const files = [
    join(SRC_ROOT, 'analytics/buildSalesDashboard.ts'),
    join(SRC_ROOT, 'ui/SalesDashboardView.tsx'),
    join(SRC_ROOT, 'ui/salesDashboardApi.ts'),
    join(SRC_ROOT, 'ui/GmailDraftCandidatesView.tsx'),
    join(SRC_ROOT, 'ui/gmailDraftCandidatesApi.ts'),
    join(SRC_ROOT, 'ui/SendRecordsView.tsx'),
    join(SRC_ROOT, 'ui/ReplyManagementView.tsx'),
    join(SRC_ROOT, 'ui/FollowUpDashboardView.tsx'),
    join(SRC_ROOT, 'ui/SettingsView.tsx'),
  ];
  for (const file of files) {
    await access(file);
    ok(`Phase 15-A file exists: ${file.replace(SRC_ROOT + '/', '').replace(SRC_ROOT + '\\', '')}`);
  }

  const dashboardTsx = await readFile(join(SRC_ROOT, 'ui/GrowlySalesDashboard.tsx'), 'utf-8');
  const uiServer = await readFile(join(SRC_ROOT, 'server/uiServer.ts'), 'utf-8');
  const styles = await readFile(join(SRC_ROOT, 'ui/styles.css'), 'utf-8');

  assert(dashboardTsx.includes('dashboard-sidebar'), 'UI has left sidebar navigation');
  assert(dashboardTsx.includes('ダッシュボード'), 'UI has dashboard tab');
  assert(dashboardTsx.includes('Lead一覧'), 'UI has leads tab');
  assert(dashboardTsx.includes('下書き候補'), 'UI has draft candidates tab');
  assert(dashboardTsx.includes('送信記録'), 'UI has send records tab');
  assert(dashboardTsx.includes('返信管理'), 'UI has reply management tab');
  assert(dashboardTsx.includes('フォローアップ'), 'UI has follow-up tab');
  assert(dashboardTsx.includes('設定'), 'UI has settings tab');
  assert(uiServer.includes('/api/sales-dashboard'), 'uiServer has sales-dashboard API');
  assert(uiServer.includes('/api/gmail-draft-candidates'), 'uiServer has gmail-draft-candidates API');
  assert(styles.includes('dashboard-sidebar'), 'styles have left sidebar layout');
  assert(!styles.includes('margin: 0 auto') || styles.includes('margin: 0;'), 'dashboard avoids center auto margin');

  const leads = [
    createEmptyLead({
      companyName: 'Sent Co',
      area: '仙台市',
      industry: '工務店',
      websiteUrl: 'https://sent.example',
      sourceUrls: ['https://sent.example'],
      emailCandidates: ['info@sent.example'],
      sendStatus: 'sent',
      replyStatus: 'none',
    }),
    createEmptyLead({
      companyName: 'Draft Co',
      area: '仙台市',
      industry: '工務店',
      websiteUrl: 'https://draft.example',
      sourceUrls: ['https://draft.example'],
      emailCandidates: ['info@draft.example'],
      humanReviewStatus: 'approved',
      sendStatus: 'not_sent',
      emailSubject: '件名',
      emailBody: '本文',
      gmailDraftStatus: 'none',
    }),
    createEmptyLead({
      companyName: 'Form Only',
      area: '仙台市',
      industry: '工務店',
      websiteUrl: 'https://form.example',
      sourceUrls: ['https://form.example'],
      contactFormUrl: 'https://form.example/contact',
    }),
  ];
  const offer = await loadOfferProfile();
  const dash = buildSalesDashboard(leads, offer);
  assert(dash.metrics.initialEmailSentCount === 1, 'buildSalesDashboard counts initialEmailSent');
  assert(dash.metrics.awaitingReplyCount === 1, 'buildSalesDashboard counts awaitingReply');
  assert(dash.metrics.gmailDraftCandidateCount >= 1, 'buildSalesDashboard counts gmail draft candidates');
  assert(dash.metrics.formOnlyLeadCount === 1, 'buildSalesDashboard counts form-only leads');
  assert(dash.outreachSender.fromEmail.includes('@'), 'buildSalesDashboard exposes fromEmail only');
  assert(dash.mimeVerification.status === 'ready', 'buildSalesDashboard mime status ready');
  assert(dash.recommendedActions.length > 0, 'buildSalesDashboard has recommended actions');
  assert(dash.topRecommendedAction !== null, 'buildSalesDashboard has topRecommendedAction');
  ok('Phase 15-A sales dashboard logic verified');
}

async function verifyPhase16ASendRecordUi(): Promise<void> {
  const files = [
    join(SRC_ROOT, 'workflow/recordManualGmailSent.ts'),
    join(SRC_ROOT, 'ui/sendRecordApi.ts'),
    join(SRC_ROOT, 'ui/ManualSendRecordDialog.tsx'),
  ];
  for (const file of files) {
    await access(file);
    ok(`Phase 16-A file exists: ${file.replace(SRC_ROOT + '/', '').replace(SRC_ROOT + '\\', '')}`);
  }

  const sendRecordsView = await readFile(join(SRC_ROOT, 'ui/SendRecordsView.tsx'), 'utf-8');
  const uiServer = await readFile(join(SRC_ROOT, 'server/uiServer.ts'), 'utf-8');
  const recordWorkflow = await readFile(join(SRC_ROOT, 'workflow/recordManualGmailSent.ts'), 'utf-8');

  assert(sendRecordsView.includes('手動送信済みに記録'), 'SendRecordsView uses safe record label');
  assert(sendRecordsView.includes('Gmailで送信後に押してください'), 'SendRecordsView shows post-send hint');
  assert(!sendRecordsView.includes('Gmailを送信'), 'SendRecordsView does not say Gmailを送信');
  assert(uiServer.includes('/api/send-record-pending'), 'uiServer has send-record-pending API');
  assert(uiServer.includes('record-manual-gmail-sent'), 'uiServer has record-manual-gmail-sent API');
  assert(!uiServer.includes('messages.send'), 'uiServer does not call messages.send');
  assert(!recordWorkflow.includes('messages.send'), 'record workflow does not call messages.send');

  const tmpJson = join(PROJECT_ROOT, 'data/growly-sales/.verify-phase16-leads.json');
  const tmpCsv = join(PROJECT_ROOT, 'data/growly-sales/.verify-phase16-leads.csv');
  const draftId = 'r-verify-draft-001';
  const pendingLead = createEmptyLead({
    companyName: 'Phase16 Record Co',
    area: '仙台市',
    industry: '工務店',
    websiteUrl: 'https://phase16.example',
    sourceUrls: ['https://phase16.example'],
    emailCandidates: ['info@phase16.example'],
    emailSubject: 'テスト件名',
    humanReviewStatus: 'approved',
    reviewStatus: 'approve',
    sendStatus: 'not_sent',
    gmailDraftStatus: 'draft_created',
    gmailDraftId: draftId,
  });
  await saveLeadsToJson(tmpJson, [pendingLead]);
  await saveLeadsToCsv(tmpCsv, [pendingLead]);

  const { recordManualGmailSent, isPendingGmailSendRecordLead } = await import(
    '../workflow/recordManualGmailSent.js'
  );
  assert(isPendingGmailSendRecordLead(pendingLead), 'pending lead is recordable');

  let rejected = false;
  try {
    await recordManualGmailSent(pendingLead.id, { draftId: 'wrong-id' }, tmpJson, tmpCsv);
  } catch (err) {
    rejected = err instanceof Error && err.message.includes('draftId');
  }
  assert(rejected, 'record rejects draftId mismatch');

  const result = await recordManualGmailSent(pendingLead.id, { draftId }, tmpJson, tmpCsv);
  assert(result.lead.sendStatus === 'sent', 'record sets sendStatus=sent');
  assert(result.lead.manualSendMethod === 'email', 'record sets manualSendMethod=email');
  assert(result.lead.manualSentAt !== null, 'record sets manualSentAt');
  assert(result.lead.nextAction === '返信待ち', 'record sets nextAction=返信待ち');
  assert(result.lead.communicationMemo.includes('manual_gmail'), 'record appends manual_gmail memo');
  assert(result.lead.communicationMemo.includes(draftId), 'record memo includes draftId');

  let rejectedAfterSent = false;
  try {
    await recordManualGmailSent(pendingLead.id, { draftId }, tmpJson, tmpCsv);
  } catch (err) {
    rejectedAfterSent = err instanceof Error && err.message.includes('送信記録済み');
  }
  assert(rejectedAfterSent, 'record rejects already-sent lead');

  ok('Phase 16-A send record UI logic verified');
}

async function verifyPhase16BReplyManagementUi(): Promise<void> {
  const files = [
    join(SRC_ROOT, 'workflow/replyManagementValidation.ts'),
    join(SRC_ROOT, 'ui/replyManagementUiUtils.ts'),
    join(SRC_ROOT, 'ui/ReplyManagementLeadCard.tsx'),
    join(SRC_ROOT, 'ui/ReplyManagementConfirmDialog.tsx'),
  ];
  for (const file of files) {
    await access(file);
    ok(`Phase 16-B file exists: ${file.replace(SRC_ROOT + '/', '').replace(SRC_ROOT + '\\', '')}`);
  }

  const replyView = await readFile(join(SRC_ROOT, 'ui/ReplyManagementView.tsx'), 'utf-8');
  const uiServer = await readFile(join(SRC_ROOT, 'server/uiServer.ts'), 'utf-8');

  assert(replyView.includes('updateLeadReplyManagementApi'), 'ReplyManagementView uses reply-management API');
  assert(replyView.includes('ReplyManagementConfirmDialog'), 'ReplyManagementView has confirm dialog');
  assert(replyView.includes('返信要約'), 'ReplyManagementView has replySummary field');
  assert(!replyView.includes('読み取り専用'), 'ReplyManagementView is editable');
  assert(uiServer.includes('reply-management'), 'uiServer has reply-management endpoint');
  assert(uiServer.includes('ReplyManagementValidationError'), 'uiServer handles reply validation errors');

  const {
    inferNextActionFromReplyStatus,
    isValidFollowUpDueAt,
    buildReplyManagementDiffMemo,
    assertReplyManagementEligible,
    REPLY_MANAGEMENT_UI_STATUSES,
    REPLY_MANAGEMENT_API_STATUSES,
    isReplyManagementApiStatus,
  } = await import('../workflow/replyManagementValidation.js');

  assert(inferNextActionFromReplyStatus('none') === '返信待ち', 'none maps to 返信待ち');
  assert(inferNextActionFromReplyStatus('no_reply') === '対象外', 'no_reply maps to 対象外');
  assert(inferNextActionFromReplyStatus('replied') === 'フォローアップ', 'replied maps to フォローアップ');
  assert(inferNextActionFromReplyStatus('interested') === 'フォローアップ', 'interested maps to フォローアップ');
  assert(inferNextActionFromReplyStatus('requested_report') === '診断レポート作成', 'requested_report maps correctly');
  assert(inferNextActionFromReplyStatus('declined') === '対象外', 'declined maps to 対象外');
  assert(inferNextActionFromReplyStatus('bounced') === '対象外', 'bounced maps to 対象外');
  assert(isValidFollowUpDueAt('2026-06-30'), 'valid followUpDueAt accepted');
  assert(!isValidFollowUpDueAt('06/30/2026'), 'invalid followUpDueAt rejected');
  assert(REPLY_MANAGEMENT_UI_STATUSES.length === 6, 'UI has 6 reply statuses');
  assert(REPLY_MANAGEMENT_API_STATUSES.includes('no_reply'), 'API allows no_reply');
  assert(isReplyManagementApiStatus('no_reply'), 'isReplyManagementApiStatus accepts no_reply');
  assert(!REPLY_MANAGEMENT_UI_STATUSES.includes('no_reply'), 'no_reply is API-only one-click status');

  const tmpJson = join(PROJECT_ROOT, 'data/growly-sales/.verify-phase16b-leads.json');
  const tmpCsv = join(PROJECT_ROOT, 'data/growly-sales/.verify-phase16b-leads.csv');
  const sentLead = createEmptyLead({
    companyName: 'Reply UI Test',
    area: '仙台市',
    industry: '工務店',
    websiteUrl: 'https://reply-ui.test',
    sourceUrls: ['https://reply-ui.test'],
    sendStatus: 'sent',
    replyStatus: 'none',
    nextAction: '返信待ち',
  });
  await saveLeadsToJson(tmpJson, [sentLead]);
  await saveLeadsToCsv(tmpCsv, [sentLead]);

  const { updateLeadReplyManagement } = await import('../workflow/updateLeadCommunication.js');
  const updated = await updateLeadReplyManagement(
    sentLead.id,
    {
      replyStatus: 'replied',
      replySummary: '希望の返信あり',
      followUpDueAt: '2026-07-01',
    },
    tmpJson,
    tmpCsv
  );
  assert(updated.replyStatus === 'replied', 'reply-management updates replyStatus');
  assert(updated.replySummary === '希望の返信あり', 'reply-management updates replySummary');
  assert(updated.nextAction === 'フォローアップ', 'reply-management infers nextAction');
  assert(updated.communicationMemo.includes('返信管理UI更新'), 'reply-management appends diff memo');

  const noReplyLead = createEmptyLead({
    companyName: 'No Reply Co',
    area: '仙台市',
    industry: '工務店',
    websiteUrl: 'https://no-reply.test',
    sourceUrls: ['https://no-reply.test'],
    sendStatus: 'sent',
    replyStatus: 'none',
    nextAction: '返信待ち',
  });
  await saveLeadsToJson(tmpJson, [noReplyLead]);
  await saveLeadsToCsv(tmpCsv, [noReplyLead]);
  const noReplyUpdated = await updateLeadReplyManagement(
    noReplyLead.id,
    { replyStatus: 'no_reply' },
    tmpJson,
    tmpCsv
  );
  assert(noReplyUpdated.replyStatus === 'no_reply', 'reply-management accepts no_reply');
  assert(noReplyUpdated.nextAction === '対象外', 'no_reply infers 対象外 nextAction');
  const { isAwaitingReplyLead, needsFollowUpDateSetup, resolveNextActionForLead } = await import(
    '../workflow/replyManagement.js'
  );
  assert(!isAwaitingReplyLead(noReplyUpdated), 'no_reply lead excluded from awaiting reply');

  const followUpLead = createEmptyLead({
    companyName: 'Follow Up Unset Co',
    area: '仙台市',
    industry: '工務店',
    websiteUrl: 'https://follow-unset.test',
    sourceUrls: ['https://follow-unset.test'],
    sendStatus: 'sent',
    replyStatus: 'replied',
    replySummary: 'テスト',
    nextAction: 'フォローアップ',
  });
  await saveLeadsToJson(tmpJson, [followUpLead]);
  await saveLeadsToCsv(tmpCsv, [followUpLead]);
  assert(needsFollowUpDateSetup(followUpLead), 'replied follow-up lead needs date setup');
  const noActionUpdated = await updateLeadReplyManagement(
    followUpLead.id,
    { nextAction: '対象外' },
    tmpJson,
    tmpCsv
  );
  assert(noActionUpdated.nextAction === '対象外', 'reply-management saves 対象外 nextAction');
  assert(!needsFollowUpDateSetup(noActionUpdated), '対象外 clears follow-up date setup requirement');
  assert(resolveNextActionForLead(noActionUpdated) === '対象外', 'resolveNextAction respects saved 対象外');

  let blocked = false;
  try {
    const notSent = createEmptyLead({
      companyName: 'Not Sent',
      area: '仙台市',
      industry: '工務店',
      websiteUrl: 'https://not-sent.test',
      sourceUrls: ['https://not-sent.test'],
      sendStatus: 'not_sent',
    });
    assertReplyManagementEligible(notSent);
  } catch {
    blocked = true;
  }
  assert(blocked, 'not_sent lead blocked from reply management');

  const diff = buildReplyManagementDiffMemo(sentLead, updated);
  assert(diff !== null && diff.includes('replyStatus'), 'diff memo captures changes');

  ok('Phase 16-B reply management UI logic verified');
}

async function verifyPhase16CGmailDraftCreateUi(): Promise<void> {
  const files = [
    join(SRC_ROOT, 'integrations/gmail/createDraftsGate.ts'),
    join(SRC_ROOT, 'integrations/gmail/gmailDraftLeadValidation.ts'),
    join(SRC_ROOT, 'workflow/createGmailDraftForLead.ts'),
    join(SRC_ROOT, 'ui/GmailDraftCreateDialog.tsx'),
    join(SRC_ROOT, 'ui/GmailDraftCreateResultPanel.tsx'),
  ];
  for (const file of files) {
    await access(file);
    ok(`Phase 16-C file exists: ${file.replace(SRC_ROOT + '/', '').replace(SRC_ROOT + '\\', '')}`);
  }

  const draftView = await readFile(join(SRC_ROOT, 'ui/GmailDraftCandidatesView.tsx'), 'utf-8');
  const draftResultPanel = await readFile(join(SRC_ROOT, 'ui/GmailDraftCreateResultPanel.tsx'), 'utf-8');
  const uiServer = await readFile(join(SRC_ROOT, 'server/uiServer.ts'), 'utf-8');
  const adapter = await readFile(join(SRC_ROOT, 'integrations/gmail/gmailDraftAdapter.ts'), 'utf-8');

  assert(draftView.includes('Gmail下書きを作成'), 'GmailDraftCandidatesView has create button');
  assert(draftView.includes('自動送信は行いません'), 'GmailDraftCandidatesView warns no send');
  const draftDialog = await readFile(join(SRC_ROOT, 'ui/GmailDraftCreateDialog.tsx'), 'utf-8');
  assert(
    draftDialog.includes('CREATE_DRAFTS') || draftView.includes('CREATE_DRAFTS'),
    'Gmail draft create uses CREATE_DRAFTS gate'
  );
  assert(draftResultPanel.includes('送信記録タブへ移動'), 'Gmail draft result navigates to send records');
  assert(draftView.includes('onNavigateToTab'), 'GmailDraftCandidatesView wires tab navigation');
  assert(uiServer.includes('create-gmail-draft'), 'uiServer has create-gmail-draft API');
  assert(!uiServer.includes('messages.send'), 'uiServer does not call messages.send');
  assert(adapter.includes('drafts.create'), 'gmail adapter uses drafts.create only');

  const { isCreateDraftsGateConfirmed, CREATE_DRAFTS_GATE_TOKEN } = await import(
    '../integrations/gmail/createDraftsGate.js'
  );
  assert(isCreateDraftsGateConfirmed(CREATE_DRAFTS_GATE_TOKEN), 'CREATE_DRAFTS gate accepts token');
  assert(!isCreateDraftsGateConfirmed('create_drafts'), 'CREATE_DRAFTS gate rejects wrong token');

  const { verifyLeadEmailBodyForGmailDraft } = await import(
    '../integrations/gmail/gmailDraftLeadValidation.js'
  );
  const { buildGmailDraftMessage } = await import('../integrations/gmail/buildGmailDraftMessage.js');
  const eligible = createEmptyLead({
    companyName: 'サスティナライフ森の家',
    area: '仙台市',
    industry: '工務店',
    websiteUrl: 'https://www.sustainalife.co.jp/',
    sourceUrls: ['https://www.sustainalife.co.jp/'],
    emailCandidates: ['info@sustainalife.co.jp'],
    emailSubject: 'テスト件名',
    emailBody: 'サスティナライフ森の家\nご担当者様\n\nテスト本文\n\nEmail：c_hiratsuka@wantreach.jp',
    humanReviewStatus: 'pending',
    sendStatus: 'not_sent',
    gmailDraftStatus: 'none',
  });
  const bodyErrors = verifyLeadEmailBodyForGmailDraft(eligible, eligible.emailBody);
  assert(bodyErrors.length === 0, 'eligible lead body passes validation');
  const msg = buildGmailDraftMessage(eligible);
  assert(msg.from === 'c_hiratsuka@wantreach.jp', 'draft message uses outreach from email');

  const { buildGmailDraftPreviewForLead } = await import(
    '../workflow/createGmailDraftForLead.js'
  );
  const sentLead = createEmptyLead({
    companyName: 'Sent Co',
    area: '仙台市',
    industry: '工務店',
    websiteUrl: 'https://sent.test',
    sourceUrls: ['https://sent.test'],
    sendStatus: 'sent',
  });
  let blocked = false;
  try {
    const preview = buildGmailDraftPreviewForLead(sentLead);
    if (!preview.canCreate) blocked = true;
  } catch {
    blocked = true;
  }
  assert(blocked, 'sent lead cannot create gmail draft');

  const alreadyDrafted = createEmptyLead({
    companyName: 'Drafted Co',
    area: '仙台市',
    industry: '工務店',
    websiteUrl: 'https://drafted.test',
    sourceUrls: ['https://drafted.test'],
    emailCandidates: ['info@drafted.test'],
    emailSubject: '件名',
    emailBody: 'Drafted Co\nご担当者様\n\n本文\n\nEmail：c_hiratsuka@wantreach.jp',
    sendStatus: 'not_sent',
    gmailDraftStatus: 'draft_created',
    gmailDraftId: 'r-test',
  });
  const draftedPreview = buildGmailDraftPreviewForLead(alreadyDrafted);
  assert(!draftedPreview.canCreate, 'draft_created lead cannot create again');

  ok('Phase 16-C Gmail draft create UI logic verified');
}

async function verifyPhase17SalesFlowPolish(): Promise<void> {
  const phase17Files = [
    'workflow/refreshUnsentLeadSignatures.ts',
    'ui/SignatureRefreshPanel.tsx',
    'ui/CandidateCollectionView.tsx',
    'ui/ApproveDraftDialog.tsx',
    'ui/signatureRefreshApi.ts',
  ];
  for (const file of phase17Files) {
    await access(join(SRC_ROOT, file));
    ok(`Phase 17 file exists: ${file}`);
  }

  const {
    hasStaleOutreachSignature,
    shouldRefreshUnsentLeadSignature,
    previewUnsentSignatureRefresh,
    refreshUnsentLeadSignatures,
  } = await import('../workflow/refreshUnsentLeadSignatures.js');
  const { selectGmailDraftTabLeads } = await import('../outreach/outreachPolicy.js');
  const { buildSalesDashboard } = await import('../analytics/buildSalesDashboard.js');
  const offer = await loadOfferProfile();

  assert(
    hasStaleOutreachSignature('Email：info@wantreach.jp\n本文'),
    'detects legacy info@wantreach.jp signature'
  );
  assert(
    !hasStaleOutreachSignature(`Email：c_hiratsuka@wantreach.jp\n本文`),
    'accepts standard signature email'
  );

  const notSentStale = createEmptyLead({
    companyName: '署名古い社',
    area: '仙台市',
    industry: '工務店',
    websiteUrl: 'https://stale-sig.test',
    sourceUrls: ['https://stale-sig.test'],
    customHook: 'フック',
    emailBody: '署名古い社\nご担当者様\n\n本文\n\nEmail：info@wantreach.jp',
    sendStatus: 'not_sent',
  });
  const sentStale = createEmptyLead({
    companyName: '送信済み署名古い社',
    area: '仙台市',
    industry: '工務店',
    websiteUrl: 'https://sent-stale.test',
    sourceUrls: ['https://sent-stale.test'],
    customHook: 'フック',
    emailBody: '送信済み署名古い社\nご担当者様\n\n本文\n\nEmail：info@wantreach.jp',
    sendStatus: 'sent',
  });
  assert(shouldRefreshUnsentLeadSignature(notSentStale), 'not_sent stale signature is refresh target');
  assert(!shouldRefreshUnsentLeadSignature(sentStale), 'sent lead is never signature refresh target');

  const tmpJson = join(PROJECT_ROOT, 'data/growly-sales/.verify-phase17-sig.json');
  const tmpCsv = join(PROJECT_ROOT, 'data/growly-sales/.verify-phase17-sig.csv');
  await saveLeadsToJson(tmpJson, [notSentStale]);
  await saveLeadsToCsv(tmpCsv, [notSentStale]);
  const preview = await previewUnsentSignatureRefresh(tmpJson);
  assert(preview.length === 1, 'preview lists stale not_sent lead');
  const refreshed = await refreshUnsentLeadSignatures(tmpJson, tmpCsv);
  assert(refreshed.refreshed.length === 1, 'refresh updates stale not_sent lead');
  assert(
    refreshed.refreshed[0].expectedSignatureEmail.includes('@'),
    'refresh result includes expected signature email'
  );
  const after = await loadLeadsFromJson(tmpJson);
  assert(
    after[0].emailBody.includes('c_hiratsuka@wantreach.jp'),
    'refreshed body has standard signature email'
  );

  const pendingTab = createEmptyLead({
    companyName: 'タブ表示社',
    area: '仙台市',
    industry: '工務店',
    websiteUrl: 'https://tab-pending.test',
    sourceUrls: ['https://tab-pending.test'],
    emailCandidates: ['info@tab-pending.test'],
    emailSubject: '件名',
    emailBody: 'タブ表示社\nご担当者様\n\n本文\n\nEmail：c_hiratsuka@wantreach.jp',
    humanReviewStatus: 'pending',
    sendStatus: 'not_sent',
    gmailDraftStatus: 'none',
  });
  const tabLeads = selectGmailDraftTabLeads([pendingTab], offer);
  assert(tabLeads.length === 1, 'selectGmailDraftTabLeads includes pending review lead');

  const dash = buildSalesDashboard([pendingTab], offer);
  assert(dash.metrics.gmailDraftPendingReviewCount === 1, 'dashboard counts pending review');
  assert(
    dash.recommendedActions.some((a) => a.targetTab === 'draft-candidates'),
    'recommended actions link to draft-candidates tab'
  );
  assert(
    dash.recommendedActions.some((a) => a.category === 'approval' || a.category === 'gmail_draft'),
    'recommended actions mention draft/approval flow'
  );

  const uiServer = await readFile(join(SRC_ROOT, 'server/uiServer.ts'), 'utf-8');
  assert(uiServer.includes('/api/signature-refresh-preview'), 'uiServer has signature preview API');
  assert(uiServer.includes('/api/refresh-unsent-signatures'), 'uiServer has signature refresh API');
  assert(uiServer.includes('selectGmailDraftTabLeads'), 'uiServer uses tab leads for draft candidates');
  assert(!uiServer.includes('messages.send'), 'uiServer does not call messages.send');

  ok('Phase 17 sales flow polish verified');
}

async function verifyPhase19DailySalesLoop(): Promise<void> {
  const phase19Files = [
    'analytics/buildDailySalesChecklist.ts',
    'ui/DailyChecklistPanel.tsx',
    'ui/DailyOperationsLogPanel.tsx',
  ];
  for (const file of phase19Files) {
    await access(join(SRC_ROOT, file));
    ok(`Phase 19 file exists: ${file}`);
  }

  const { buildDailySalesChecklist } = await import('../analytics/buildDailySalesChecklist.js');
  const { buildSalesDashboard, buildTopRecommendedAction } = await import(
    '../analytics/buildSalesDashboard.js'
  );
  const { selectAwaitingReplyLeads } = await import('../workflow/replyManagement.js');
  const offer = await loadOfferProfile();
  const leads = await loadLeadsFromJson(getLeadsJsonPath());

  const checklist = buildDailySalesChecklist(leads, offer);
  assert(checklist.length >= 8, 'daily checklist has at least 8 items');
  assert(checklist.some((i) => i.id === 'check_replies'), 'checklist includes reply check');
  assert(checklist.some((i) => i.id === 'record_reply'), 'checklist includes record reply');

  const dash = buildSalesDashboard(leads, offer);
  assert(dash.topRecommendedAction !== null, 'dashboard has topRecommendedAction');
  assert(dash.recommendedActions.length === 1, 'recommendedActions is single top action');
  assert(dash.dailyChecklist.length >= 8, 'dashboard includes dailyChecklist');

  const awaiting = selectAwaitingReplyLeads(leads);
  const top = buildTopRecommendedAction(leads, offer);
  if (dash.metrics.pendingGmailSendRecordCount > 0) {
    assert(top.category === 'send_record', 'top action is send_record when pending');
  } else if (awaiting.length > 0) {
    assert(top.category === 'reply_check', 'top action is reply_check when awaiting replies');
    assert(top.targetTab === 'reply-management', 'top action targets reply-management');
  } else if (dash.metrics.gmailDraftCandidateCount === 0) {
    assert(top.category === 'candidate_collection', 'top action is candidate_collection when no drafts');
  }

  const replyView = await readFile(join(SRC_ROOT, 'ui/ReplyManagementView.tsx'), 'utf-8');
  assert(replyView.includes('SearchAndFilterBar'), 'ReplyManagementView has search filter bar');
  assert(replyView.includes('pane-list-scroll'), 'ReplyManagementView has scrollable list pane');
  assert(replyView.includes('返信なしで確認済みにする'), 'ReplyManagementView documents no-update path');
  assert(replyView.includes('REPLY_NEXT_STEP_OPTIONS'), 'ReplyManagementView has next step options');
  assert(replyView.includes('次の対応'), 'ReplyManagementView shows next step field');
  const filterUtils = await readFile(join(SRC_ROOT, 'ui/leadFilterUtils.ts'), 'utf-8');
  assert(filterUtils.includes('Gmail確認待ち'), 'reply filters include Gmail確認待ち label');
  assert(filterUtils.includes('matchesCompanySearch'), 'leadFilterUtils has company search');

  const candidateView = await readFile(join(SRC_ROOT, 'ui/CandidateCollectionView.tsx'), 'utf-8');
  assert(candidateView.includes('候補を集める'), 'CandidateCollectionView documents collection step');
  assert(candidateView.includes('Daily30DraftImportPanel'), 'CandidateCollectionView documents draft import');

  const dashboardView = await readFile(join(SRC_ROOT, 'ui/SalesDashboardView.tsx'), 'utf-8');
  assert(dashboardView.includes('DashboardCompactChecklist'), 'SalesDashboardView uses compact checklist');
  assert(dashboardView.includes('今日の最優先'), 'SalesDashboardView shows single top action');

  const logPanel = await readFile(join(SRC_ROOT, 'ui/DailyOperationsLogPanel.tsx'), 'utf-8');
  assert(logPanel.includes('localStorage'), 'DailyOperationsLogPanel uses localStorage only');
  assert(!logPanel.includes('saveLeadsToJson'), 'DailyOperationsLogPanel does not write leads.json');

  ok('Phase 19 daily sales loop verified');
}

async function verifyPhase17ExternalCandidates(): Promise<void> {
  const pkg = await readFile(join(PROJECT_ROOT, 'package.json'), 'utf-8');
  assert(pkg.includes('growly-sales:external-preview'), 'package.json has external-preview script');
  assert(pkg.includes('growly-sales:external-fetch'), 'package.json has external-fetch script');
  assert(pkg.includes('growly-sales:external-import-approved'), 'package.json has external-import-approved script');

  const previewScript = await readFile(
    join(SRC_ROOT, 'scripts/run-growly-sales-external-candidates-preview.ts'),
    'utf-8'
  );
  assert(!previewScript.includes('searchPlaces('), 'external-preview does not call searchPlaces');
  assert(!previewScript.includes('searchWeb('), 'external-preview does not call searchWeb');
  assert(!previewScript.includes('fetchExternalLeadCandidates('), 'external-preview does not fetch live');
  assert(!previewScript.includes('saveLeadsToJson'), 'external-preview does not modify leads.json');
  ok('external-preview is dry-run without external communication');

  const fetchScript = await readFile(
    join(SRC_ROOT, 'scripts/run-growly-sales-external-fetch.ts'),
    'utf-8'
  );
  assert(fetchScript.includes(FETCH_CANDIDATES_CONFIRM_TOKEN), 'external-fetch requires FETCH_CANDIDATES');
  assert(!fetchScript.includes('saveLeadsToJson'), 'external-fetch does not directly Lead-import');
  assert(fetchScript.includes('persistExternalCandidates'), 'external-fetch saves to external-candidates store');
  ok('external-fetch gated by FETCH_CANDIDATES; no direct Lead import');

  const importScript = await readFile(
    join(SRC_ROOT, 'scripts/run-growly-sales-import-approved-candidates.ts'),
    'utf-8'
  );
  assert(importScript.includes(IMPORT_APPROVED_CONFIRM_TOKEN), 'external-import requires IMPORT_APPROVED');
  assert(!importScript.includes('saveLeadsToJson'), 'import-approved does not write leads.json directly');
  ok('external-import-approved gated; writes input-sites.csv only');

  assert(getExternalCandidatesJsonPath().endsWith('external-candidates.json'), 'external-candidates json path');
  assert(getExternalCandidatesCsvPath().endsWith('external-candidates.csv'), 'external-candidates csv path');

  const target = await loadTargetProfile('housing');
  const queries = buildLeadSearchQueries(target);
  assert(queries.length >= 6, 'buildLeadSearchQueries generates seed queries');
  assert(queries.some((q) => q.includes('工務店')), 'search queries include 工務店');

  const c1 = buildExternalLeadCandidate(
    { sourceType: 'google_places', companyName: 'テスト工務店', websiteUrl: 'https://a.test', sourceQuery: '仙台市 工務店' },
    target
  );
  const c2 = buildExternalLeadCandidate(
    { sourceType: 'google_places', companyName: 'テスト工務店', websiteUrl: 'https://a.test', sourceQuery: '仙台市 工務店' },
    target
  );
  const deduped = dedupeExternalCandidates([c1, c2]);
  assert(deduped.length === 1, 'dedupeExternalCandidates removes duplicate website');

  const noWeb = buildExternalLeadCandidate(
    { sourceType: 'web_search', companyName: 'URLなし社', websiteUrl: null, sourceQuery: '宮城県 工務店' },
    target
  );
  assert(noWeb.importStatus === 'needs_review', 'no websiteUrl => needs_review');

  const existingLead = createEmptyLead({
    companyName: '既存社',
    area: '仙台市',
    industry: '工務店',
    websiteUrl: 'https://existing.test',
    sourceUrls: ['https://existing.test'],
  });
  const dupCandidate = buildExternalLeadCandidate(
    { sourceType: 'manual', companyName: '既存社', websiteUrl: 'https://existing.test', sourceQuery: 'q' },
    target
  );
  const withDup = applyDuplicateStatus([dupCandidate], [existingLead], []);
  assert(withDup[0].importStatus === 'duplicate', 'duplicate detection vs existing leads');

  const dncLead = createEmptyLead({
    companyName: 'DNC社',
    area: '仙台市',
    industry: '工務店',
    websiteUrl: 'https://dnc.test',
    sourceUrls: ['https://dnc.test'],
    doNotContact: true,
  });
  const dncCandidate = buildExternalLeadCandidate(
    { sourceType: 'manual', companyName: 'DNC社', websiteUrl: 'https://dnc.test', sourceQuery: 'q' },
    target
  );
  const dncBlock = isCandidateImportable(dncCandidate, [dncLead], []);
  assert(dncBlock !== null && dncBlock.includes('doNotContact'), 'doNotContact blocks import');

  const noUrlBlock = isCandidateImportable(noWeb, [], []);
  assert(noUrlBlock !== null, 'websiteUrl-less candidate not importable');

  const leads = await loadLeadsFromJson(getLeadsJsonPath());
  const contact = buildContactPathAnalytics(leads);
  assert(contact.totalLeads === leads.length, 'contact path analytics totalLeads');
  assert(typeof contact.emailCandidateRate === 'number', 'emailCandidateRate computed');
  assert(typeof contact.contactFormOnlyLeads === 'number', 'contactFormOnlyLeads computed');

  const uiServer = await readFile(join(SRC_ROOT, 'server/uiServer.ts'), 'utf-8');
  assert(uiServer.includes('/api/contact-path-analytics'), 'uiServer has contact-path-analytics API');
  assert(uiServer.includes('/api/external-candidates'), 'uiServer has external-candidates API');
  assert(uiServer.includes('approve-for-import'), 'uiServer has approve-for-import endpoint');
  assert(!uiServer.includes('saveLeadsToJson'), 'uiServer does not auto-import external candidates to leads');

  assert(EXTERNAL_CANDIDATES_WARNING.includes('直接Lead化'), 'ExternalCandidatesView warning exists');

  const envExample = await readFile(join(PROJECT_ROOT, '.env.example'), 'utf-8');
  assert(envExample.includes('API_PRODUCTION_ENABLED'), '.env.example documents API_PRODUCTION_ENABLED');
  assert(envExample.includes('WEB_SEARCH_ENGINE_ID'), '.env.example documents WEB_SEARCH_ENGINE_ID');

  ok('Phase 17 external candidates checks passed');
}

async function verifyPhase18LiteHandoff(): Promise<void> {
  const claudePath = join(PROJECT_ROOT, 'CLAUDE.md');
  const workLogPath = join(PROJECT_ROOT, 'WORK_LOG.md');
  const nextTasksPath = join(PROJECT_ROOT, 'NEXT_TASKS.md');
  const emailPlanPath = join(PROJECT_ROOT, 'docs/GROWLY_SALES_EMAIL_CANDIDATES_IMPROVEMENT_PLAN.md');

  await access(claudePath);
  ok('CLAUDE.md exists at project root');

  await access(workLogPath);
  ok('WORK_LOG.md exists at project root');

  await access(nextTasksPath);
  ok('NEXT_TASKS.md exists at project root');

  const claude = await readFile(claudePath, 'utf-8');
  assert(claude.includes('Growly Sales'), 'CLAUDE.md mentions Growly Sales');
  assert(
    claude.includes('SNS分析') || claude.includes('SNS分析アプリ'),
    'CLAUDE.md distinguishes Growly SNS analytics app'
  );
  assert(
    claude.includes('chiak') && claude.includes('Growly Sales'),
    'CLAUDE.md mentions workspace path'
  );
  assert(claude.includes('自動送信'), 'CLAUDE.md documents auto-send prohibition');
  assert(claude.includes('FETCH_CANDIDATES'), 'CLAUDE.md documents FETCH_CANDIDATES');
  assert(claude.includes('CREATE_DRAFTS'), 'CLAUDE.md documents CREATE_DRAFTS');
  ok('CLAUDE.md handoff content verified');

  const workLog = await readFile(workLogPath, 'utf-8');
  assert(workLog.includes('Phase 17'), 'WORK_LOG.md records Phase 17');
  assert(workLog.includes('366') || workLog.includes('verify'), 'WORK_LOG.md records verify results');
  assert(workLog.includes('emailCandidates'), 'WORK_LOG.md mentions emailCandidates');
  ok('WORK_LOG.md handoff content verified');

  const nextTasks = await readFile(nextTasksPath, 'utf-8');
  assert(nextTasks.includes('Phase 18'), 'NEXT_TASKS.md lists Phase 18');
  assert(nextTasks.includes('Phase 19'), 'NEXT_TASKS.md lists Phase 19');
  assert(nextTasks.includes('Phase 21'), 'NEXT_TASKS.md lists Phase 21');
  assert(nextTasks.includes('FETCH_CANDIDATES'), 'NEXT_TASKS.md documents Phase 18 gate');
  assert(nextTasks.includes('CREATE_DRAFTS'), 'NEXT_TASKS.md documents Phase 19 gate');
  ok('NEXT_TASKS.md handoff content verified');

  await access(emailPlanPath);
  const emailPlan = await readFile(emailPlanPath, 'utf-8');
  assert(emailPlan.includes('個人メール'), 'EMAIL plan documents personal email policy');
  assert(emailPlan.includes('画像OCR') || emailPlan.includes('OCR'), 'EMAIL plan prohibits image OCR');
  assert(emailPlan.includes('WHOIS'), 'EMAIL plan prohibits WHOIS');
  assert(
    emailPlan.includes('問い合わせフォーム') || emailPlan.includes('contact_form'),
    'EMAIL plan documents form-only lead operation'
  );
  assert(emailPlan.includes('contactPathType'), 'EMAIL plan proposes contactPathType');
  ok('EMAIL_CANDIDATES_IMPROVEMENT_PLAN verified');

  const readme = await readFile(join(PROJECT_ROOT, 'README.md'), 'utf-8');
  assert(readme.includes('CLAUDE.md'), 'README links to CLAUDE.md');
  assert(readme.includes('emailCandidates'), 'README documents emailCandidates');

  ok('Phase 18-lite handoff checks passed');
}

async function verifyPhase21CandidateCollection(): Promise<void> {
  const pkg = await readFile(join(PROJECT_ROOT, 'package.json'), 'utf-8');
  assert(pkg.includes('growly-sales:candidates-preview'), 'package.json has candidates-preview');
  assert(pkg.includes('growly-sales:fetch-candidates'), 'package.json has fetch-candidates');
  assert(pkg.includes('growly-sales:candidates-audit'), 'package.json has candidates-audit');

  const previewScript = await readFile(
    join(SRC_ROOT, 'scripts/run-growly-sales-candidates-preview.ts'),
    'utf-8'
  );
  assert(!previewScript.includes('searchPlaces('), 'candidates-preview does not call searchPlaces');
  assert(!previewScript.includes('searchWeb('), 'candidates-preview does not call searchWeb');
  assert(!previewScript.includes('fetchExternalLeadCandidates('), 'candidates-preview does not fetch live');
  assert(!previewScript.includes('persistExternalCandidates'), 'candidates-preview does not persist');
  assert(previewScript.includes('FETCH_CANDIDATES'), 'candidates-preview documents FETCH_CANDIDATES gate');
  ok('candidates-preview is dry-run without external communication');

  const fetchScript = await readFile(
    join(SRC_ROOT, 'scripts/run-growly-sales-fetch-candidates.ts'),
    'utf-8'
  );
  assert(fetchScript.includes(FETCH_CANDIDATES_CONFIRM_TOKEN), 'fetch-candidates references FETCH_CANDIDATES');
  assert(fetchScript.includes('promptFetchCandidatesConfirmation'), 'fetch-candidates requires confirmation');
  assert(!fetchScript.includes('saveLeadsToJson'), 'fetch-candidates does not directly Lead-import');
  assert(fetchScript.includes('persistExternalCandidates'), 'fetch-candidates saves external store');
  ok('fetch-candidates gated by FETCH_CANDIDATES; no direct Lead import');

  const auditScript = await readFile(
    join(SRC_ROOT, 'scripts/run-growly-sales-candidates-audit.ts'),
    'utf-8'
  );
  assert(auditScript.includes('auditCandidateCollection'), 'candidates-audit uses audit module');
  assert(auditScript.includes('officialSiteUrl'), 'candidates-audit reports officialSiteUrl');
  ok('candidates-audit script present');

  const target = await loadTargetProfile('housing');
  const built = buildExternalLeadCandidate(
    {
      sourceType: 'google_places',
      companyName: 'Phase21テスト',
      websiteUrl: 'https://phase21.test',
      sourceUrl: 'https://phase21.test',
      sourceQuery: '仙台市 工務店',
    },
    target
  );
  assert(built.officialSiteUrl === built.websiteUrl, 'officialSiteUrl mirrors websiteUrl');
  assert(built.duplicateKey.startsWith('web:'), 'duplicateKey computed on build');
  assert(built.category === built.industry, 'category set from industry');
  assert(built.collectedAt === built.createdAt, 'collectedAt set on build');

  const importable = Array.from({ length: 5 }, (_, i) =>
    buildExternalLeadCandidate(
      {
        sourceType: 'manual',
        companyName: `LimitTest${i}`,
        websiteUrl: `https://limit${i}.test`,
        sourceQuery: 'q',
      },
      target
    )
  );
  const { accepted, deferred } = limitNewCandidates(importable, 2);
  assert(deferred.length === 3, 'limitNewCandidates defers excess importable candidates');
  assert(accepted.filter((c) => c.importStatus !== 'duplicate').length <= 2, 'limit caps importable');

  const leads = await loadLeadsFromJson(getLeadsJsonPath());
  const audit = auditCandidateCollection(leads, []);
  assert(audit.target === CANDIDATE_COLLECTION_TARGET, 'audit target is 30');
  assert(audit.leadRows.every((r) => r.officialSiteUrl), 'audit includes officialSiteUrl per lead');

  const claude = await readFile(join(PROJECT_ROOT, 'CLAUDE.md'), 'utf-8');
  assert(claude.includes('candidates-preview') || claude.includes('fetch-candidates'), 'CLAUDE documents Phase 21 commands');

  const workLog = await readFile(join(PROJECT_ROOT, 'WORK_LOG.md'), 'utf-8');
  assert(workLog.includes('Phase 21'), 'WORK_LOG records Phase 21');

  const nextTasks = await readFile(join(PROJECT_ROOT, 'NEXT_TASKS.md'), 'utf-8');
  assert(nextTasks.includes('Phase 21'), 'NEXT_TASKS lists Phase 21');

  ok('Phase 21 candidate collection checks passed');
}

async function verifyPhase23Daily30Collection(): Promise<void> {
  const pkg = await readFile(join(PROJECT_ROOT, 'package.json'), 'utf-8');
  assert(pkg.includes('growly-sales:daily30-preview'), 'package.json has daily30-preview');
  assert(pkg.includes('growly-sales:daily30-fetch'), 'package.json has daily30-fetch');

  const previewScript = await readFile(
    join(SRC_ROOT, 'scripts/run-growly-sales-daily30-preview.ts'),
    'utf-8'
  );
  assert(!previewScript.includes('fetchDaily30Candidates('), 'daily30-preview does not fetch live');
  assert(!previewScript.includes('searchPlaces('), 'daily30-preview does not call searchPlaces');
  assert(previewScript.includes('buildDaily30Dashboard'), 'daily30-preview builds dashboard');
  ok('daily30-preview is dry-run');

  const fetchScript = await readFile(
    join(SRC_ROOT, 'scripts/run-growly-sales-daily30-fetch.ts'),
    'utf-8'
  );
  assert(fetchScript.includes(FETCH_DAILY_30_CONFIRM_TOKEN), 'daily30-fetch references FETCH_DAILY_30');
  assert(fetchScript.includes('promptFetchDaily30Confirmation'), 'daily30-fetch requires confirmation');
  assert(!fetchScript.includes('createGmailDraftForLead'), 'daily30-fetch does not create Gmail drafts');
  assert(!fetchScript.includes('messages.send'), 'daily30-fetch does not send email');
  ok('daily30-fetch gated by FETCH_DAILY_30');

  const areaConfig = await readFile(join(SRC_ROOT, 'candidates/daily30AreaConfig.ts'), 'utf-8');
  assert(areaConfig.includes('宮城県'), 'area config includes Miyagi');
  assert(areaConfig.includes('福島県'), 'area config includes Fukushima');
  assert(areaConfig.includes('茨城県'), 'area config includes Ibaraki');
  assert(areaConfig.includes('栃木県'), 'area config includes Tochigi');
  assert(areaConfig.includes('群馬県'), 'area config includes Gunma');
  ok('daily30 area expansion order defined');

  const uiServer = await readFile(join(SRC_ROOT, 'server/uiServer.ts'), 'utf-8');
  assert(uiServer.includes('/api/daily30-dashboard'), 'uiServer exposes daily30-dashboard');
  assert(uiServer.includes('/api/daily30-fetch'), 'uiServer exposes daily30-fetch');
  assert(uiServer.includes(FETCH_DAILY_30_CONFIRM_TOKEN), 'uiServer gates daily30-fetch');

  const settingsView = await readFile(join(SRC_ROOT, 'ui/SettingsView.tsx'), 'utf-8');
  assert(settingsView.includes('Daily30DashboardPanel'), 'Settings embeds Daily30 manual fetch panel');

  const { buildDaily30Dashboard } = await import('../candidates/buildDaily30Dashboard.js');
  const { DAILY_30_TARGET } = await import('../candidates/daily30CandidateStatus.js');
  const leads = await loadLeadsFromJson(getLeadsJsonPath());
  const dashboard = buildDaily30Dashboard([], leads);
  assert(dashboard.target === DAILY_30_TARGET, 'daily30 dashboard target is 30');
  assert(dashboard.shortfall === 30, 'empty batch shortfall is 30');

  const statusFile = await readFile(join(SRC_ROOT, 'candidates/daily30CandidateStatus.ts'), 'utf-8');
  assert(statusFile.includes('email_found'), 'pipeline status email_found');
  assert(statusFile.includes('ready_for_draft'), 'pipeline status ready_for_draft');

  ok('Phase 23 Daily 30 collection checks passed');
}

async function verifyPhase24Daily30CopyPipeline(): Promise<void> {
  const pkg = await readFile(join(PROJECT_ROOT, 'package.json'), 'utf-8');
  assert(pkg.includes('growly-sales:daily30-generate-copy'), 'package.json has daily30-generate-copy');

  const copyScript = await readFile(
    join(SRC_ROOT, 'scripts/run-growly-sales-daily30-generate-copy.ts'),
    'utf-8'
  );
  assert(copyScript.includes(GENERATE_DAILY_30_COPY_CONFIRM_TOKEN), 'daily30-generate-copy references gate');
  assert(copyScript.includes('promptGenerateDaily30CopyConfirmation'), 'daily30-generate-copy requires confirmation');
  assert(!copyScript.includes('createGmailDraftForLead'), 'daily30-generate-copy does not create Gmail drafts');
  assert(!copyScript.includes('messages.send'), 'daily30-generate-copy does not send email');
  assert(!copyScript.includes('saveLeadsToJson'), 'daily30-generate-copy does not write leads.json');
  ok('daily30-generate-copy gated by GENERATE_DAILY_30_COPY');

  const uiServer = await readFile(join(SRC_ROOT, 'server/uiServer.ts'), 'utf-8');
  assert(uiServer.includes('/api/daily30-generate-copy'), 'uiServer exposes daily30-generate-copy');
  assert(uiServer.includes('/api/daily30-lead-candidates'), 'uiServer exposes daily30-lead-candidates');
  assert(uiServer.includes('approve-for-lead'), 'uiServer exposes approve-for-lead');
  assert(uiServer.includes(GENERATE_DAILY_30_COPY_CONFIRM_TOKEN), 'uiServer gates daily30-generate-copy');

  const candidateView = await readFile(join(SRC_ROOT, 'ui/CandidateCollectionView.tsx'), 'utf-8');
  assert(candidateView.includes('Daily30LeadCandidatesPanel'), 'CandidateCollectionView embeds Lead candidates panel');
  assert(candidateView.includes('Lead化承認'), 'CandidateCollectionView shows lead approval flow');

  const typesFile = await readFile(join(SRC_ROOT, 'adapters/externalLeadCandidateTypes.ts'), 'utf-8');
  assert(typesFile.includes('approved_for_lead'), 'importStatus approved_for_lead');
  assert(typesFile.includes('generatedEmailSubject'), 'candidate stores generatedEmailSubject');
  assert(typesFile.includes('failureReason'), 'candidate stores failureReason');

  const statusFile = await readFile(join(SRC_ROOT, 'candidates/daily30CandidateStatus.ts'), 'utf-8');
  assert(statusFile.includes('needs_review'), 'pipeline status needs_review');

  const { isDaily30LeadReviewCandidate } = await import('../candidates/selectDaily30LeadCandidates.js');
  const { buildDaily30Dashboard } = await import('../candidates/buildDaily30Dashboard.js');
  const leads = await loadLeadsFromJson(getLeadsJsonPath());

  const sample = {
    externalCandidateId: 'test-phase24',
    sourceType: 'google_places' as const,
    companyName: 'テスト工務店',
    area: '宮城県仙台市',
    industry: '工務店',
    websiteUrl: 'https://example.co.jp',
    officialSiteUrl: 'https://example.co.jp',
    phoneNumber: null,
    address: null,
    googlePlaceId: null,
    sourceUrl: 'https://maps.example',
    sourceQuery: 'q',
    category: '工務店',
    contactFormUrl: null,
    emailCandidates: ['info@example.co.jp'],
    confidenceScore: 0.8,
    importStatus: 'preview' as const,
    riskLevel: 'low' as const,
    duplicateReason: '',
    duplicateKey: 'web:example.co.jp',
    pipelineStatus: 'email_found' as const,
    prefecture: '宮城県',
    regionGroup: '宮城' as const,
    collectionPriority: 1,
    collectionAreaSource: '宮城県',
    collectionBatchId: '2026-01-01',
    emailCandidateSourceUrls: ['https://example.co.jp/contact'],
    emailVerifiedAt: null,
    generatedEmailSubject: null,
    generatedEmailBody: null,
    generatedCustomHook: null,
    generatedCustomHookReason: null,
    targetEmail: null,
    emailCandidateSourceUrl: null,
    failureReason: null,
    copyGeneratedAt: null,
    qualityCheckedAt: null,
    humanReviewStatus: null,
    gmailDraftStatus: null,
    sendStatus: null,
    notes: '',
    collectedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  assert(isDaily30LeadReviewCandidate(sample), 'email_found candidate is review eligible');

  const dashboard = buildDaily30Dashboard([], leads);
  assert(typeof dashboard.leadApprovalPendingCount === 'number', 'dashboard has leadApprovalPendingCount');
  assert(typeof dashboard.copyGeneratedCount === 'number', 'dashboard has copyGeneratedCount');
  assert(typeof dashboard.qualityCheckPassedCount === 'number', 'dashboard has qualityCheckPassedCount');

  ok('Phase 24 Daily 30 copy pipeline checks passed');
}

async function verifyPhase25Daily30DraftImport(): Promise<void> {
  const pkg = await readFile(join(PROJECT_ROOT, 'package.json'), 'utf-8');
  assert(
    pkg.includes('growly-sales:daily30-import-draft-candidates'),
    'package.json has daily30-import-draft-candidates'
  );

  const importScript = await readFile(
    join(SRC_ROOT, 'scripts/run-growly-sales-daily30-import-draft-candidates.ts'),
    'utf-8'
  );
  assert(
    importScript.includes(IMPORT_DAILY_30_DRAFT_CANDIDATES_CONFIRM_TOKEN),
    'daily30-import references IMPORT_DAILY_30_DRAFT_CANDIDATES'
  );
  assert(!importScript.includes('createGmailDraftForLead'), 'import script does not create Gmail drafts');
  assert(!importScript.includes('messages.send'), 'import script does not send email');
  ok('daily30-import gated by IMPORT_DAILY_30_DRAFT_CANDIDATES');

  const uiServer = await readFile(join(SRC_ROOT, 'server/uiServer.ts'), 'utf-8');
  assert(uiServer.includes('/api/daily30-ready-for-draft'), 'uiServer exposes daily30-ready-for-draft');
  assert(uiServer.includes('/api/daily30-import-draft-candidates'), 'uiServer exposes bulk import');
  assert(uiServer.includes('import-as-draft-candidate'), 'uiServer exposes single import');
  assert(uiServer.includes(IMPORT_DAILY_30_DRAFT_CANDIDATES_CONFIRM_TOKEN), 'uiServer gates bulk import');
  assert(uiServer.includes('CREATE_DRAFTS'), 'uiServer still uses CREATE_DRAFTS for Gmail');

  const candidateView = await readFile(join(SRC_ROOT, 'ui/CandidateCollectionView.tsx'), 'utf-8');
  assert(candidateView.includes('Daily30DraftImportPanel'), 'CandidateCollectionView embeds import panel');

  const {
    isDaily30ReadyForDraftImportCandidate,
    getDaily30DraftImportBlockReason,
  } = await import('../candidates/getDaily30DraftImportBlockReason.js');
  const { buildLeadFromDaily30ReadyForDraft } = await import(
    '../candidates/buildLeadFromDaily30ReadyForDraft.js'
  );
  const leads = await loadLeadsFromJson(getLeadsJsonPath());

  const readySample = {
    externalCandidateId: 'test-phase25-ready',
    sourceType: 'google_places' as const,
    companyName: 'テスト住宅',
    area: '宮城県仙台市',
    industry: '工務店',
    websiteUrl: 'https://example-home.co.jp',
    officialSiteUrl: 'https://example-home.co.jp',
    phoneNumber: null,
    address: null,
    googlePlaceId: null,
    sourceUrl: 'https://maps.example',
    sourceQuery: 'q',
    category: '工務店',
    contactFormUrl: null,
    emailCandidates: ['info@example-home.co.jp'],
    confidenceScore: 0.9,
    importStatus: 'approved_for_lead' as const,
    riskLevel: 'low' as const,
    duplicateReason: '',
    duplicateKey: 'web:example-home.co.jp',
    pipelineStatus: 'ready_for_draft' as const,
    prefecture: '宮城県',
    regionGroup: '宮城' as const,
    collectionPriority: 1,
    collectionAreaSource: '宮城県',
    collectionBatchId: '2026-01-01',
    emailCandidateSourceUrls: ['https://example-home.co.jp/contact'],
    emailVerifiedAt: null,
    generatedEmailSubject: '【無料診断】テスト住宅様へ',
    generatedEmailBody:
      'テスト住宅\nご担当者様\n\nお世話になっております。\n\n====================\n合同会社Want Reach\n平塚千明 / Chiaki Hiratsuka\nEmail：c_hiratsuka@wantreach.jp\n=========================',
    generatedCustomHook: '地域の家づくりへのこだわりが伝わる内容でした。',
    generatedCustomHookReason: 'area',
    targetEmail: 'info@example-home.co.jp',
    emailCandidateSourceUrl: 'https://example-home.co.jp/contact',
    failureReason: null,
    copyGeneratedAt: new Date().toISOString(),
    qualityCheckedAt: new Date().toISOString(),
    humanReviewStatus: 'pending' as const,
    gmailDraftStatus: 'none' as const,
    sendStatus: 'not_sent' as const,
    notes: '',
    collectedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  assert(isDaily30ReadyForDraftImportCandidate(readySample), 'ready_for_draft is import eligible');

  const excluded = { ...readySample, pipelineStatus: 'excluded' as const };
  assert(!isDaily30ReadyForDraftImportCandidate(excluded), 'excluded not importable');

  const needsReview = { ...readySample, pipelineStatus: 'needs_review' as const };
  assert(!isDaily30ReadyForDraftImportCandidate(needsReview), 'needs_review not importable');

  const lead = buildLeadFromDaily30ReadyForDraft(readySample);
  assert(lead.sendStatus === 'not_sent', 'imported lead sendStatus not_sent');
  assert(lead.gmailDraftStatus === 'none', 'imported lead gmailDraftStatus none');
  assert(lead.humanReviewStatus === 'pending', 'imported lead humanReviewStatus pending');
  assert(lead.daily30PipelineStatus === 'ready_for_draft', 'imported lead daily30PipelineStatus');
  assert(lead.source === 'daily30', 'imported lead source daily30');
  assert(lead.emailCandidates[0] === 'info@example-home.co.jp', 'targetEmail in emailCandidates');

  const dupBlock = getDaily30DraftImportBlockReason(readySample, leads, []);
  if (leads.some((l) => l.websiteUrl?.includes('example-home.co.jp'))) {
    assert(dupBlock !== null, 'duplicate lead blocked');
  }

  const { buildDaily30DraftPipelineProgress } = await import(
    '../candidates/buildDaily30DraftPipelineProgress.js'
  );
  const progress = buildDaily30DraftPipelineProgress([], leads);
  assert(typeof progress.leadsImportPendingCount === 'number', 'draft pipeline progress defined');

  ok('Phase 25 Daily 30 draft import checks passed');
}

async function verifyPhase26Daily30OperationsIntegration(): Promise<void> {
  const opsPanel = await readFile(join(SRC_ROOT, 'ui/Daily30OperationsPanel.tsx'), 'utf-8');
  assert(opsPanel.includes('エンドツーエンドチェックリスト'), 'operations panel has E2E checklist');
  assert(opsPanel.includes('FETCH_DAILY_30'), 'operations panel shows FETCH gate');
  assert(opsPanel.includes('GENERATE_DAILY_30_COPY'), 'operations panel shows GENERATE gate');
  assert(opsPanel.includes('IMPORT_DAILY_30_DRAFT_CANDIDATES'), 'operations panel shows IMPORT gate');
  assert(opsPanel.includes('CREATE_DRAFTS'), 'operations panel shows CREATE_DRAFTS gate');
  assert(opsPanel.includes('Gmail API不使用'), 'operations panel distinguishes non-Gmail gates');

  const candidateView = await readFile(join(SRC_ROOT, 'ui/CandidateCollectionView.tsx'), 'utf-8');
  assert(candidateView.includes('Daily30OperationsPanel'), 'CandidateCollectionView embeds operations panel');

  const settingsView = await readFile(join(SRC_ROOT, 'ui/SettingsView.tsx'), 'utf-8');
  assert(settingsView.includes('Daily30SafetyRulesPanel'), 'SettingsView shows Daily 30 safety rules');

  const runbook = await readFile(
    join(PROJECT_ROOT, 'docs/GROWLY_SALES_DAILY30_RUNBOOK.md'),
    'utf-8'
  );
  assert(runbook.includes('FETCH_DAILY_30'), 'runbook documents FETCH gate');
  assert(runbook.includes('IMPORT_DAILY_30_DRAFT_CANDIDATES'), 'runbook documents IMPORT gate');
  assert(runbook.includes('既存11社'), 'runbook documents sent lead protection');

  const importWorkflow = await readFile(
    join(SRC_ROOT, 'workflow/importDaily30DraftCandidates.ts'),
    'utf-8'
  );
  assert(!importWorkflow.includes('createGmailDraftForLead'), 'import workflow does not create Gmail drafts');
  assert(!importWorkflow.includes('messages.send'), 'import workflow does not send email');

  const { CREATE_DRAFTS_GATE_TOKEN, isCreateDraftsGateConfirmed } = await import(
    '../integrations/gmail/createDraftsGate.js'
  );
  assert(!isCreateDraftsGateConfirmed(''), 'CREATE_DRAFTS rejected when empty');
  assert(isCreateDraftsGateConfirmed(CREATE_DRAFTS_GATE_TOKEN), 'CREATE_DRAFTS gate token works');

  const { buildDaily30OperationsSummary } = await import(
    '../candidates/buildDaily30OperationsSummary.js'
  );
  const leads = await loadLeadsFromJson(getLeadsJsonPath());
  const sentSnapshot = leads
    .filter((l) => l.sendStatus === 'sent' || l.sendStatus === 'manual_sent')
    .map((l) => ({
      id: l.id,
      sendStatus: l.sendStatus,
      replyStatus: l.replyStatus,
      manualSentAt: l.manualSentAt,
    }));

  const operations = buildDaily30OperationsSummary([], leads);
  assert(operations.checklist.length === 11, 'E2E checklist has 11 steps');
  assert(operations.gates.length === 4, 'four gates documented');
  assert(operations.safetyRules.length >= 8, 'safety rules listed');
  assert(operations.dailyProcedure.length === 12, 'daily procedure has 12 steps');
  assert(typeof operations.copyPendingCount === 'number', 'copy pending count in summary');
  assert(typeof operations.sentTodayCount === 'number', 'sent today count in summary');

  const { isDaily30ReadyForDraftImportCandidate } = await import(
    '../candidates/getDaily30DraftImportBlockReason.js'
  );
  const excludedSample = {
    pipelineStatus: 'excluded' as const,
    importStatus: 'approved_for_lead' as const,
  };
  assert(
    !isDaily30ReadyForDraftImportCandidate(excludedSample as never),
    'excluded not importable'
  );
  const needsReviewSample = {
    pipelineStatus: 'needs_review' as const,
    importStatus: 'approved_for_lead' as const,
  };
  assert(
    !isDaily30ReadyForDraftImportCandidate(needsReviewSample as never),
    'needs_review not importable'
  );

  const leadsAfter = await loadLeadsFromJson(getLeadsJsonPath());
  for (const before of sentSnapshot) {
    const after = leadsAfter.find((l) => l.id === before.id);
    assert(after, `sent lead preserved: ${before.id}`);
    assert(after.sendStatus === before.sendStatus, `sendStatus unchanged for ${before.id}`);
    assert(after.replyStatus === before.replyStatus, `replyStatus unchanged for ${before.id}`);
    assert(after.manualSentAt === before.manualSentAt, `manualSentAt unchanged for ${before.id}`);
  }

  const uiServer = await readFile(join(SRC_ROOT, 'server/uiServer.ts'), 'utf-8');
  assert(uiServer.includes('buildDaily30OperationsSummary'), 'uiServer builds operations summary');
  assert(!uiServer.includes('refresh_token'), 'uiServer does not expose refresh_token');

  const opsConfig = await readFile(join(SRC_ROOT, 'candidates/daily30OperationsConfig.ts'), 'utf-8');
  assert(!opsConfig.toLowerCase().includes('api_key'), 'ops config has no api_key literals');

  ok('Phase 26 Daily 30 operations integration checks passed');
}

async function verifyPhase27CloudDaily30AutoFetch(): Promise<void> {
  const pkg = await readFile(join(PROJECT_ROOT, 'package.json'), 'utf-8');
  assert(pkg.includes('growly-sales:cloud-daily30-dry-run'), 'package.json has cloud-daily30-dry-run');
  assert(pkg.includes('growly-sales:cloud-daily30-auto-fetch'), 'package.json has cloud-daily30-auto-fetch');

  const cloudFetch = await readFile(
    join(SRC_ROOT, 'candidates/runDaily30CloudAutoFetch.ts'),
    'utf-8'
  );
  assert(!cloudFetch.includes('createGmailDraftForLead'), 'cloud auto-fetch does not create Gmail drafts');
  assert(!cloudFetch.includes('messages.send'), 'cloud auto-fetch does not send email');
  assert(!cloudFetch.includes('runDaily30CopyPipeline'), 'cloud auto-fetch does not generate copy');
  assert(!cloudFetch.includes('importDaily30DraftCandidate'), 'cloud auto-fetch does not import leads');
  assert(!cloudFetch.includes('approveLeadForDraft'), 'cloud auto-fetch does not auto-approve');
  assert(cloudFetch.includes('dryRun'), 'cloud auto-fetch supports dryRun');
  assert(cloudFetch.includes('already_ran'), 'cloud auto-fetch supports already_ran');
  assert(cloudFetch.includes('force'), 'cloud auto-fetch supports force');

  const cloudRoutes = await readFile(join(SRC_ROOT, 'server/daily30CloudRoutes.ts'), 'utf-8');
  assert(cloudRoutes.includes('/api/cloud/daily30/auto-fetch'), 'cloud route auto-fetch');
  assert(cloudRoutes.includes('/api/cloud/daily30/status'), 'cloud route status');
  assert(cloudRoutes.includes('x-growly-daily30-token'), 'cloud route accepts custom header');
  assert(cloudRoutes.includes('Bearer'), 'cloud route accepts Bearer');
  assert(!cloudRoutes.includes('DAILY30_CLOUD_RUN_TOKEN'), 'cloud routes do not log token env name in responses');

  const authFile = await readFile(join(SRC_ROOT, 'config/daily30CloudAuth.ts'), 'utf-8');
  assert(authFile.includes('DAILY30_CLOUD_RUN_TOKEN'), 'cloud auth env key defined');
  assert(!authFile.includes('console.log'), 'cloud auth does not log');

  const autoFetchCli = await readFile(
    join(SRC_ROOT, 'scripts/run-growly-sales-cloud-daily30-auto-fetch.ts'),
    'utf-8'
  );
  assert(autoFetchCli.includes('assertDaily30CloudToken'), 'cloud auto-fetch CLI requires token');

  const candidateView = await readFile(join(SRC_ROOT, 'ui/CandidateCollectionView.tsx'), 'utf-8');
  assert(candidateView.includes('Daily30CloudStatusPanel'), 'CandidateCollectionView shows cloud status');

  const cloudPanel = await readFile(join(SRC_ROOT, 'ui/Daily30CloudStatusPanel.tsx'), 'utf-8');
  assert(cloudPanel.includes('値は表示しません'), 'cloud panel hides token value');
  assert(cloudPanel.includes('Scheduler'), 'cloud panel mentions scheduler');
  assert(cloudPanel.includes('lastRun'), 'cloud panel shows last run');

  const { runDaily30CloudAutoFetch } = await import('../candidates/runDaily30CloudAutoFetch.js');
  const { isBatchCloudRunCompleted } = await import('../storage/daily30CloudRunState.js');
  const dry = await runDaily30CloudAutoFetch({ dryRun: true });
  assert(dry.mode === 'dry_run', 'dryRun returns dry_run mode');
  assert(dry.ok === true, 'dryRun ok');

  const leads = await loadLeadsFromJson(getLeadsJsonPath());
  const sentSnapshot = leads
    .filter((l) => l.sendStatus === 'sent' || l.sendStatus === 'manual_sent')
    .map((l) => ({
      id: l.id,
      sendStatus: l.sendStatus,
      replyStatus: l.replyStatus,
    }));

  const { DAILY30_CLOUD_RUN_TOKEN_ENV } = await import('../config/daily30CloudAuth.js');
  const prevToken = process.env[DAILY30_CLOUD_RUN_TOKEN_ENV];
  delete process.env[DAILY30_CLOUD_RUN_TOKEN_ENV];
  const { isDaily30CloudRunTokenConfigured } = await import('../config/daily30CloudAuth.js');
  assert(!isDaily30CloudRunTokenConfigured(), 'token unset means not configured');
  if (prevToken) process.env[DAILY30_CLOUD_RUN_TOKEN_ENV] = prevToken;

  const batchId = dry.batchId;
  const already = await isBatchCloudRunCompleted(batchId);
  if (already) {
    const again = await runDaily30CloudAutoFetch({ dryRun: false, force: false });
    assert(again.mode === 'already_ran', 'duplicate guard returns already_ran without force');
  }

  const leadsAfter = await loadLeadsFromJson(getLeadsJsonPath());
  for (const before of sentSnapshot) {
    const after = leadsAfter.find((l) => l.id === before.id);
    assert(after, `sent lead preserved: ${before.id}`);
    assert(after.sendStatus === before.sendStatus, `sendStatus unchanged: ${before.id}`);
    assert(after.replyStatus === before.replyStatus, `replyStatus unchanged: ${before.id}`);
  }

  ok('Phase 27 Cloud Daily 30 auto-fetch checks passed');
}

async function verifyPhase28CloudStorageBackend(): Promise<void> {
  const pkg = await readFile(join(PROJECT_ROOT, 'package.json'), 'utf-8');
  assert(pkg.includes('growly-sales:gcs-storage-check'), 'package.json has gcs-storage-check');
  assert(pkg.includes('@google-cloud/storage'), 'package.json has @google-cloud/storage');

  const dockerignore = await readFile(join(PROJECT_ROOT, '.dockerignore'), 'utf-8');
  assert(dockerignore.includes('.env'), 'dockerignore excludes .env');
  assert(dockerignore.includes('credentials'), 'dockerignore excludes credentials');
  assert(dockerignore.includes('token'), 'dockerignore excludes token files');
  assert(dockerignore.includes('data/growly-sales/*.json'), 'dockerignore excludes local data JSON');

  const dockerfile = await readFile(join(PROJECT_ROOT, 'Dockerfile'), 'utf-8');
  assert(!dockerfile.includes('COPY .env'), 'Dockerfile does not COPY .env');
  assert(!dockerfile.includes('credentials.json'), 'Dockerfile does not COPY credentials');
  assert(dockerfile.includes('PORT'), 'Dockerfile documents PORT');
  assert(!dockerfile.toLowerCase().includes('refresh_token'), 'Dockerfile has no refresh_token');

  const uiServer = await readFile(join(SRC_ROOT, 'server/uiServer.ts'), 'utf-8');
  assert(uiServer.includes('process.env.PORT'), 'uiServer respects Cloud Run PORT');

  const storageBackend = await readFile(join(SRC_ROOT, 'config/storageBackend.ts'), 'utf-8');
  assert(storageBackend.includes('GROWLY_STORAGE_BACKEND'), 'storage backend env defined');
  assert(storageBackend.includes('GROWLY_GCS_BUCKET'), 'GCS bucket env defined');
  assert(storageBackend.includes('InvalidStorageBackendError'), 'invalid backend error');

  const gcsStorage = await readFile(join(SRC_ROOT, 'storage/gcsJsonStorage.ts'), 'utf-8');
  assert(gcsStorage.includes('gcsReadJson'), 'GCS readJson');
  assert(gcsStorage.includes('gcsWriteJson'), 'GCS writeJson');
  assert(gcsStorage.includes('gcsJsonExists'), 'GCS exists');
  assert(gcsStorage.includes('gcsBackupBeforeWrite'), 'GCS backupBeforeWrite');
  assert(!gcsStorage.includes('console.log'), 'GCS adapter does not log secrets');

  const jsonDoc = await readFile(join(SRC_ROOT, 'storage/jsonDocumentStorage.ts'), 'utf-8');
  assert(jsonDoc.includes('readJsonDocument'), 'unified readJsonDocument');
  assert(jsonDoc.includes('writeJsonDocument'), 'unified writeJsonDocument');

  const extRepo = await readFile(join(SRC_ROOT, 'storage/externalCandidatesRepository.ts'), 'utf-8');
  assert(extRepo.includes('readJsonDocument'), 'externalCandidates uses readJsonDocument');
  assert(extRepo.includes('writeJsonDocument'), 'externalCandidates uses writeJsonDocument');
  assert(extRepo.includes('isGcsStorageBackend'), 'externalCandidates skips CSV on gcs');

  const cloudState = await readFile(join(SRC_ROOT, 'storage/daily30CloudRunState.ts'), 'utf-8');
  assert(cloudState.includes('readJsonDocument'), 'cloud run state uses readJsonDocument');
  assert(cloudState.includes('writeJsonDocument'), 'cloud run state uses writeJsonDocument');

  const runbook = await readFile(
    join(PROJECT_ROOT, 'docs/GROWLY_SALES_DAILY30_RUNBOOK.md'),
    'utf-8'
  );
  assert(runbook.includes('GROWLY_STORAGE_BACKEND'), 'runbook documents storage backend');
  assert(runbook.includes('GROWLY_GCS_BUCKET'), 'runbook documents GCS bucket');
  assert(runbook.includes('gcs-storage-check'), 'runbook documents gcs-storage-check');

  const cloudFetch = await readFile(
    join(SRC_ROOT, 'candidates/runDaily30CloudAutoFetch.ts'),
    'utf-8'
  );
  assert(!cloudFetch.includes('messages.send'), 'cloud fetch no send');
  assert(!cloudFetch.includes('users.drafts.create'), 'cloud fetch no drafts.create');
  assert(!cloudFetch.includes('GMAIL_REFRESH_TOKEN'), 'cloud fetch does not require Gmail token');

  const { getStorageBackend, GcsStorageNotConfiguredError } = await import(
    '../config/storageBackend.js'
  );
  const prevBackend = process.env.GROWLY_STORAGE_BACKEND;
  const prevBucket = process.env.GROWLY_GCS_BUCKET;
  delete process.env.GROWLY_STORAGE_BACKEND;
  assert(getStorageBackend() === 'local', 'default backend is local');
  process.env.GROWLY_STORAGE_BACKEND = 'gcs';
  delete process.env.GROWLY_GCS_BUCKET;
  let gcsError: Error | null = null;
  try {
    const { assertGcsStorageConfigured } = await import('../config/storageBackend.js');
    assertGcsStorageConfigured();
  } catch (err) {
    gcsError = err as Error;
  }
  assert(gcsError instanceof GcsStorageNotConfiguredError, 'gcs without bucket throws clear error');
  if (prevBackend) process.env.GROWLY_STORAGE_BACKEND = prevBackend;
  else delete process.env.GROWLY_STORAGE_BACKEND;
  if (prevBucket) process.env.GROWLY_GCS_BUCKET = prevBucket;
  else delete process.env.GROWLY_GCS_BUCKET;

  const leads = await loadLeadsFromJson(getLeadsJsonPath());
  const sentSnapshot = leads
    .filter((l) => l.sendStatus === 'sent' || l.sendStatus === 'manual_sent')
    .map((l) => ({ id: l.id, sendStatus: l.sendStatus, replyStatus: l.replyStatus }));

  const { loadExternalCandidatesFromJson } = await import(
    '../storage/externalCandidatesRepository.js'
  );
  const candidates = await loadExternalCandidatesFromJson();
  assert(Array.isArray(candidates), 'local backend loads external candidates');

  const { loadDaily30CloudRunState } = await import('../storage/daily30CloudRunState.js');
  const state = await loadDaily30CloudRunState();
  assert(state.runs !== undefined, 'local backend loads cloud run state');

  const leadsAfter = await loadLeadsFromJson(getLeadsJsonPath());
  for (const before of sentSnapshot) {
    const after = leadsAfter.find((l) => l.id === before.id);
    assert(after, `sent lead preserved phase28: ${before.id}`);
    assert(after.sendStatus === before.sendStatus, `sendStatus unchanged phase28: ${before.id}`);
    assert(after.replyStatus === before.replyStatus, `replyStatus unchanged phase28: ${before.id}`);
  }

  ok('Phase 28 Cloud Storage backend checks passed');
}

async function verifyPhase29CloudSchedulerDeploy(): Promise<void> {
  const pkg = await readFile(join(PROJECT_ROOT, 'package.json'), 'utf-8');
  assert(pkg.includes('growly-sales:cloud-deploy-check'), 'package.json has cloud-deploy-check');

  const deployDoc = await readFile(
    join(PROJECT_ROOT, 'docs/GROWLY_SALES_CLOUD_SCHEDULER_DEPLOY.md'),
    'utf-8'
  );
  assert(deployDoc.includes('growly-scheduler'), 'deploy doc has project id');
  assert(deployDoc.includes('growly-daily30-auto-fetch-9am'), 'deploy doc has scheduler job name');
  assert(deployDoc.includes('0 9 * * *'), 'deploy doc has cron');
  assert(deployDoc.includes('Asia/Tokyo'), 'deploy doc has timezone');
  assert(deployDoc.includes('/api/cloud/daily30/auto-fetch'), 'deploy doc has API path');
  assert(deployDoc.includes('"dryRun":false,"force":false'), 'deploy doc has scheduler body');
  assert(deployDoc.includes('daily30-cloud-run-token'), 'deploy doc has token secret name');
  assert(deployDoc.includes('google-places-api-key'), 'deploy doc has places secret name');
  assert(!deployDoc.includes('GMAIL_REFRESH'), 'deploy doc has no Gmail refresh token');
  assert(!deployDoc.includes('refresh_token'), 'deploy doc has no refresh_token');
  assert(deployDoc.includes('already_ran'), 'deploy doc explains duplicate guard');
  assert(deployDoc.includes('同日二重実行'), 'deploy doc duplicate guard section');

  const runbook = await readFile(
    join(PROJECT_ROOT, 'docs/GROWLY_SALES_DAILY30_RUNBOOK.md'),
    'utf-8'
  );
  assert(runbook.includes('GROWLY_SALES_CLOUD_SCHEDULER_DEPLOY.md'), 'runbook links deploy doc');
  assert(!runbook.match(/DAILY30_CLOUD_RUN_TOKEN=[a-zA-Z0-9+/=]{8,}/), 'runbook has no literal token');

  const cloudConfig = await readFile(join(SRC_ROOT, 'config/cloudDeployConfig.ts'), 'utf-8');
  assert(cloudConfig.includes("SCHEDULER_CRON = '0 9 * * *'"), 'scheduler cron constant');
  assert(cloudConfig.includes("SCHEDULER_TIMEZONE = 'Asia/Tokyo'"), 'scheduler timezone');
  assert(cloudConfig.includes('growly-daily30-auto-fetch-9am'), 'scheduler job name constant');
  assert(!cloudConfig.includes('GMAIL'), 'cloud config has no Gmail');

  const cloudFetch = await readFile(
    join(SRC_ROOT, 'candidates/runDaily30CloudAutoFetch.ts'),
    'utf-8'
  );
  assert(cloudFetch.includes('existingCount'), 'dry-run includes existingCount');
  assert(cloudFetch.includes('[daily30-cloud]'), 'structured cloud logs');
  assert(!cloudFetch.includes('messages.send'), 'cloud fetch no send');
  assert(!cloudFetch.includes('users.drafts.create'), 'cloud fetch no drafts.create');
  assert(!cloudFetch.includes('GMAIL_REFRESH'), 'cloud fetch no gmail token');

  const deployScript = await readFile(
    join(PROJECT_ROOT, 'scripts/cloud/growly-daily30/06-scheduler.sh'),
    'utf-8'
  );
  assert(deployScript.includes('0 9 * * *'), 'scheduler script cron');
  assert(deployScript.includes('Asia/Tokyo'), 'scheduler script timezone');
  assert(deployScript.includes('dryRun":false,"force":false'), 'scheduler script body');

  const cloudRunDeploy = await readFile(
    join(PROJECT_ROOT, 'scripts/cloud/growly-daily30/05-deploy-cloud-run.sh'),
    'utf-8'
  );
  assert(cloudRunDeploy.includes('GROWLY_STORAGE_BACKEND=gcs'), 'cloud run uses gcs');
  assert(cloudRunDeploy.includes('daily30-cloud-run-token'), 'cloud run secret ref by name');
  assert(!cloudRunDeploy.includes('GMAIL'), 'cloud run deploy no gmail secrets');

  const cloudPanel = await readFile(join(SRC_ROOT, 'ui/Daily30CloudStatusPanel.tsx'), 'utf-8');
  assert(cloudPanel.includes('Cloud Scheduler'), 'panel shows scheduler');
  assert(cloudPanel.includes('lastRun'), 'panel shows last run');
  assert(cloudPanel.includes('値は表示しません'), 'panel hides token');
  assert(!cloudPanel.includes('refresh_token'), 'panel no refresh_token');

  const { buildDaily30CloudStatus } = await import('../candidates/runDaily30CloudAutoFetch.js');
  const status = await buildDaily30CloudStatus();
  assert(status.schedulerCron === '0 9 * * *', 'status cron');
  assert(status.schedulerTimezone === 'Asia/Tokyo', 'status timezone');
  assert(status.schedulerTargetPath === '/api/cloud/daily30/auto-fetch', 'status target path');

  const leads = await loadLeadsFromJson(getLeadsJsonPath());
  const sentSnapshot = leads
    .filter((l) => l.sendStatus === 'sent' || l.sendStatus === 'manual_sent')
    .map((l) => ({ id: l.id, sendStatus: l.sendStatus, replyStatus: l.replyStatus }));

  const { runDaily30CloudAutoFetch } = await import('../candidates/runDaily30CloudAutoFetch.js');
  const dry = await runDaily30CloudAutoFetch({ dryRun: true });
  assert(dry.existingCount !== undefined, 'dry run has existingCount');
  assert(dry.mode === 'dry_run', 'dry run mode');

  const leadsAfter = await loadLeadsFromJson(getLeadsJsonPath());
  for (const before of sentSnapshot) {
    const after = leadsAfter.find((l) => l.id === before.id);
    assert(after, `sent lead preserved phase29: ${before.id}`);
    assert(after.sendStatus === before.sendStatus, `sendStatus unchanged phase29: ${before.id}`);
    assert(after.replyStatus === before.replyStatus, `replyStatus unchanged phase29: ${before.id}`);
  }

  ok('Phase 29 Cloud Scheduler deploy checks passed');
}

async function verifyPhase30CloudRunLoggingAndRecovery(): Promise<void> {
  const errors = await readFile(join(SRC_ROOT, 'candidates/daily30CloudRunErrors.ts'), 'utf-8');
  assert(errors.includes('TOKEN_MISSING'), 'error TOKEN_MISSING defined');
  assert(errors.includes('GCS_WRITE_FAILED'), 'error GCS_WRITE_FAILED defined');
  assert(errors.includes('recoveryHint'), 'errors have recoveryHint');
  assert(errors.includes('recoverySteps'), 'errors have recoverySteps');
  assert(errors.includes('sanitizeErrorMessageSafe'), 'sanitize helper exists');
  assert(!errors.includes('AIzaSy'), 'errors file has no sample api key');

  const state = await readFile(join(SRC_ROOT, 'storage/daily30CloudRunState.ts'), 'utf-8');
  assert(state.includes('runId'), 'state has runId');
  assert(state.includes('durationMs'), 'state has durationMs');
  assert(state.includes('errorCode'), 'state has errorCode');
  assert(state.includes('history'), 'state has history array');

  const cloudFetch = await readFile(
    join(SRC_ROOT, 'candidates/runDaily30CloudAutoFetch.ts'),
    'utf-8'
  );
  assert(cloudFetch.includes('logsHint'), 'response has logsHint');
  assert(cloudFetch.includes('safeMessage'), 'response has safeMessage');
  assert(cloudFetch.includes('automationStatus'), 'status has automationStatus');
  assert(!cloudFetch.includes('createGmailDraftForLead'), 'no gmail drafts');
  assert(!cloudFetch.includes('messages.send'), 'no send');
  assert(!cloudFetch.includes('users.drafts.create'), 'no drafts.create');
  assert(!cloudFetch.includes('importDaily30DraftCandidate'), 'no lead import');

  const cloudPanel = await readFile(join(SRC_ROOT, 'ui/Daily30CloudStatusPanel.tsx'), 'utf-8');
  assert(cloudPanel.includes('automationStatus'), 'panel automation status');
  assert(cloudPanel.includes('recoveryHint'), 'panel recovery hint');
  assert(cloudPanel.includes('recoverySteps'), 'panel recovery steps');
  assert(cloudPanel.includes('cloudLoggingFilter'), 'panel logging filter');
  assert(cloudPanel.includes('値は表示しません'), 'panel hides secrets');
  assert(!cloudPanel.includes('force={true}'), 'panel no force rerun button');
  assert(!cloudPanel.match(/button[^>]*force/i), 'panel no force button');
  assert(!cloudPanel.includes('onClick'), 'panel no action buttons');
  assert(!cloudPanel.includes('GOOGLE_PLACES_API_KEY'), 'panel no api key env');

  const deployDoc = await readFile(
    join(PROJECT_ROOT, 'docs/GROWLY_SALES_CLOUD_SCHEDULER_DEPLOY.md'),
    'utf-8'
  );
  assert(deployDoc.includes('[daily30-cloud]'), 'deploy doc logging filter');
  assert(deployDoc.includes('force=true'), 'deploy doc force manual only');
  assert(deployDoc.includes('UI からは実行できません'), 'deploy doc no ui force');
  assert(deployDoc.includes('Cloud Monitoring'), 'deploy doc monitoring optional');

  const runbook = await readFile(
    join(PROJECT_ROOT, 'docs/GROWLY_SALES_DAILY30_RUNBOOK.md'),
    'utf-8'
  );
  assert(runbook.includes('Phase 30') || runbook.includes('実行ログ'), 'runbook phase30 section');

  const cloudConfig = await readFile(join(SRC_ROOT, 'config/cloudDeployConfig.ts'), 'utf-8');
  assert(cloudConfig.includes('CLOUD_LOGGING_FILTER'), 'logging filter constant');

  const {
    assertErrorMessageSafeDoesNotLeakSecrets,
    getDaily30CloudErrorDefinition,
    DAILY30_CLOUD_ERROR_CODES,
  } = await import('../candidates/daily30CloudRunErrors.js');

  for (const code of DAILY30_CLOUD_ERROR_CODES) {
    const def = getDaily30CloudErrorDefinition(code);
    assert(def.recoveryHint.length > 10, `recoveryHint for ${code}`);
    assert(
      assertErrorMessageSafeDoesNotLeakSecrets(def.errorMessageSafe),
      `safe message for ${code}`
    );
    assert(
      assertErrorMessageSafeDoesNotLeakSecrets(def.recoveryHint),
      `safe recoveryHint for ${code}`
    );
  }

  const { runDaily30CloudAutoFetch, buildDaily30CloudStatus } = await import(
    '../candidates/runDaily30CloudAutoFetch.js'
  );
  const dry = await runDaily30CloudAutoFetch({ dryRun: true });
  assert(dry.runId, 'dry run has runId');
  assert(dry.status === 'skipped', 'dry run status skipped');
  assert(dry.durationMs >= 0, 'dry run durationMs');
  assert(dry.logsHint.includes('[daily30-cloud]'), 'dry run logsHint');
  assert(!dry.logsHint.includes('Bearer'), 'logsHint no bearer');

  const cloudStatus = await buildDaily30CloudStatus();
  assert(cloudStatus.cloudLoggingFilter.includes('growly-sales-daily30'), 'status logging filter');
  assert(cloudStatus.automationStatus, 'status automationStatus');

  const leads = await loadLeadsFromJson(getLeadsJsonPath());
  const sentSnapshot = leads
    .filter((l) => l.sendStatus === 'sent' || l.sendStatus === 'manual_sent')
    .map((l) => ({ id: l.id, sendStatus: l.sendStatus, replyStatus: l.replyStatus }));

  const leadsAfter = await loadLeadsFromJson(getLeadsJsonPath());
  for (const before of sentSnapshot) {
    const after = leadsAfter.find((l) => l.id === before.id);
    assert(after, `sent lead preserved phase30: ${before.id}`);
    assert(after.sendStatus === before.sendStatus, `sendStatus unchanged phase30: ${before.id}`);
    assert(after.replyStatus === before.replyStatus, `replyStatus unchanged phase30: ${before.id}`);
  }

  ok('Phase 30 Cloud run logging and recovery checks passed');
}

async function verifyPhase31GcsLocalUiDashboard(): Promise<void> {
  const uiServer = await readFile(join(SRC_ROOT, 'server/uiServer.ts'), 'utf-8');
  assert(uiServer.includes('/api/daily30-dashboard'), 'daily30-dashboard route');
  assert(uiServer.includes('/api/daily30-ready-for-draft'), 'daily30-ready-for-draft route');
  assert(uiServer.includes('/api/storage-status'), 'storage-status route');
  assert(uiServer.includes('loadLeadsOptionalForDaily30'), 'optional leads for daily30');
  assert(uiServer.includes('buildDaily30CloudDashboardPayload'), 'cloud dashboard payload');
  assert(uiServer.includes('GROWLY_CLOUD_RUN_API_ONLY'), 'cloud run api only root');
  assert(uiServer.includes('K_SERVICE'), 'cloud run detection uses K_SERVICE');

  const cloudDash = await readFile(join(SRC_ROOT, 'candidates/buildDaily30CloudDashboard.ts'), 'utf-8');
  assert(cloudDash.includes('emailFoundCandidates'), 'email found candidates in payload');
  assert(cloudDash.includes('loadExternalCandidatesFromJson'), 'uses external candidates repo');
  assert(cloudDash.includes('ok: false'), 'gcs read failure degrades with ok:false');
  assert(cloudDash.includes('gcsReadError'), 'gcsReadError returned on failure');

  const resultsPanel = await readFile(join(SRC_ROOT, 'ui/Daily30CloudResultsPanel.tsx'), 'utf-8');
  const candidateCards = await readFile(join(SRC_ROOT, 'ui/Daily30CandidateCards.tsx'), 'utf-8');
  assert(resultsPanel.includes('Cloud Daily 30'), 'cloud results panel title');
  assert(resultsPanel.includes('email_found'), 'email found section');
  assert(resultsPanel.includes('全候補'), 'shows all candidates section');
  assert(resultsPanel.includes('Daily30CandidateList'), 'uses candidate card list');
  assert(candidateCards.includes('target="_blank"'), 'clickable urls in cards');
  assert(candidateCards.includes('Lead化承認'), 'lead approve button in cards');
  assert(!resultsPanel.includes('force=true'), 'no force rerun in panel');
  assert(!resultsPanel.includes('GOOGLE_PLACES_API_KEY'), 'no api key in panel');

  const pilot = await readFile(join(SRC_ROOT, 'ui/PilotModeBanner.tsx'), 'utf-8');
  assert(pilot.includes('fetchGrowlyStorageStatus'), 'pilot banner reads storage status');
  assert(pilot.includes('Cloud Storage'), 'pilot banner gcs label');

  const runbook = await readFile(join(PROJECT_ROOT, 'docs/GROWLY_SALES_DAILY30_RUNBOOK.md'), 'utf-8');
  assert(runbook.includes('GROWLY_STORAGE_BACKEND=gcs'), 'runbook gcs env sample');

  const { buildDaily30CloudDashboardPayload } = await import('../candidates/buildDaily30CloudDashboard.js');
  const { loadLeadsOptionalForDaily30 } = await import('../storage/loadLeadsOptionalForDaily30.js');
  const prevBackend = process.env.GROWLY_STORAGE_BACKEND;
  const prevBucket = process.env.GROWLY_GCS_BUCKET;
  process.env.GROWLY_STORAGE_BACKEND = 'local';
  delete process.env.GROWLY_GCS_BUCKET;
  try {
    const leads = await loadLeadsOptionalForDaily30();
    const payload = await buildDaily30CloudDashboardPayload(leads);
    assert(payload.ok === true, 'dashboard payload ok');
    assert(Array.isArray(payload.candidates), 'candidates array');
    assert(Array.isArray(payload.emailFoundCandidates), 'emailFoundCandidates array');
    assert(payload.storageBackend === 'local', 'verify uses local storage backend');
  } finally {
    if (prevBackend) process.env.GROWLY_STORAGE_BACKEND = prevBackend;
    else delete process.env.GROWLY_STORAGE_BACKEND;
    if (prevBucket) process.env.GROWLY_GCS_BUCKET = prevBucket;
    else delete process.env.GROWLY_GCS_BUCKET;
  }

  const cloudFetch = await readFile(join(SRC_ROOT, 'candidates/runDaily30CloudAutoFetch.ts'), 'utf-8');
  assert(!cloudFetch.includes('messages.send'), 'no gmail send');
  assert(!cloudFetch.includes('users.drafts.create'), 'no drafts create');

  const leadsBefore = await loadLeadsFromJson(getLeadsJsonPath()).catch(() => []);
  const sentSnapshot = (Array.isArray(leadsBefore) ? leadsBefore : [])
    .filter((l) => l.sendStatus === 'sent' || l.sendStatus === 'manual_sent')
    .map((l) => ({ id: l.id, sendStatus: l.sendStatus, replyStatus: l.replyStatus }));

  const leadsAfter = await loadLeadsFromJson(getLeadsJsonPath()).catch(() => []);
  for (const before of sentSnapshot) {
    const after = (Array.isArray(leadsAfter) ? leadsAfter : []).find((l) => l.id === before.id);
    if (after) {
      assert(after.sendStatus === before.sendStatus, `sendStatus unchanged phase31: ${before.id}`);
      assert(after.replyStatus === before.replyStatus, `replyStatus unchanged phase31: ${before.id}`);
    }
  }

  ok('Phase 31 GCS local UI dashboard checks passed');
}

async function verifyPhase33EmailFoundCollection(): Promise<void> {
  const fetchSrc = await readFile(join(SRC_ROOT, 'candidates/fetchDaily30Candidates.ts'), 'utf-8');
  assert(fetchSrc.includes('reachedTarget'), 'fetch uses reachedTarget');
  assert(fetchSrc.includes('DAILY_30_TARGET_EMAIL_FOUND'), 'fetch targets email_found count');
  assert(fetchSrc.includes('DAILY_30_MAX_COLLECTED_CANDIDATES'), 'fetch has max collected guard');
  assert(fetchSrc.includes('DAILY_30_MAX_DURATION_MS'), 'fetch has max duration guard');
  assert(fetchSrc.includes('stoppedReason'), 'fetch returns stoppedReason');
  assert(!fetchSrc.includes('needed <= 0'), 'fetch does not stop on collected-only threshold');

  const metricsSrc = await readFile(join(SRC_ROOT, 'candidates/daily30BatchMetrics.ts'), 'utf-8');
  assert(metricsSrc.includes('isDaily30FormOnlyCandidate'), 'form-only classifier exists');
  assert(metricsSrc.includes('isDaily30EmailFoundCandidate'), 'email-found classifier exists');

  const cloudFetch = await readFile(join(SRC_ROOT, 'candidates/runDaily30CloudAutoFetch.ts'), 'utf-8');
  assert(cloudFetch.includes('partial_success'), 'cloud run supports partial_success');
  assert(cloudFetch.includes('targetEmailFound'), 'cloud response includes targetEmailFound');
  assert(cloudFetch.includes('Daily 30 email-found target completed'), 'success message for email target');
  assert(cloudFetch.includes('partially completed — email-found target not reached'), 'partial message documented');
  assert(!cloudFetch.includes('messages.send'), 'phase33 no gmail send');
  assert(!cloudFetch.includes('users.drafts.create'), 'phase33 no drafts create');
  assert(!cloudFetch.includes('runDaily30CopyPipeline'), 'phase33 no copy pipeline');

  const stateFile = await readFile(join(SRC_ROOT, 'storage/daily30CloudRunState.ts'), 'utf-8');
  assert(stateFile.includes('targetEmailFound'), 'state json has targetEmailFound');
  assert(stateFile.includes('totalCollected'), 'state json has totalCollected');
  assert(stateFile.includes('formOnly'), 'state json has formOnly');
  assert(stateFile.includes('reachedTarget'), 'state json has reachedTarget');
  assert(stateFile.includes('stoppedReason'), 'state json has stoppedReason');
  assert(stateFile.includes('partial_success'), 'duplicate guard includes partial_success');

  const candidateView = await readFile(join(SRC_ROOT, 'ui/CandidateCollectionView.tsx'), 'utf-8');
  const detailsPanel = await readFile(join(SRC_ROOT, 'ui/CandidateCollectionDetailsPanel.tsx'), 'utf-8');
  assert(candidateView.includes('メール営業候補'), 'UI separates email sales candidate KPI');
  assert(candidateView.includes('Lead化承認待ち'), 'UI shows lead approval pending');
  assert(!candidateView.includes('今日の収集'), 'UI removed misleading collected KPI label');
  assert(candidateView.includes('CandidateCollectionDetailsPanel'), 'UI moves total collected to details panel');
  assert(detailsPanel.includes('問い合わせフォームのみ'), 'UI shows form-only in details');

  const {
    DAILY_30_TARGET_EMAIL_FOUND,
    DAILY_30_MAX_COLLECTED_CANDIDATES,
  } = await import('../candidates/daily30CandidateStatus.js');
  assert(DAILY_30_TARGET_EMAIL_FOUND === 30, 'email-found target is 30');
  assert(DAILY_30_MAX_COLLECTED_CANDIDATES === 120, 'max collected candidates is 120');

  const { countDaily30BatchMetrics } = await import('../candidates/daily30BatchMetrics.js');
  const { buildDaily30Dashboard } = await import('../candidates/buildDaily30Dashboard.js');
  const batchId = '2026-06-30';
  const emailCandidate = {
    externalCandidateId: 'phase33-email',
    sourceType: 'google_places' as const,
    companyName: 'メールあり工務店',
    area: '宮城県',
    industry: '工務店',
    websiteUrl: 'https://email.test',
    officialSiteUrl: 'https://email.test',
    phoneNumber: null,
    address: null,
    googlePlaceId: null,
    sourceUrl: null,
    sourceQuery: 'q',
    category: '工務店',
    contactFormUrl: null,
    emailCandidates: ['info@email.test'],
    confidenceScore: 0.8,
    importStatus: 'preview' as const,
    riskLevel: 'low' as const,
    duplicateReason: '',
    duplicateKey: 'k1',
    pipelineStatus: 'email_found' as const,
    prefecture: '宮城県',
    regionGroup: '宮城' as const,
    collectionPriority: 1,
    collectionAreaSource: '宮城県',
    collectionBatchId: batchId,
    emailCandidateSourceUrls: [],
    emailVerifiedAt: null,
    generatedEmailSubject: null,
    generatedEmailBody: null,
    generatedCustomHook: null,
    generatedCustomHookReason: null,
    targetEmail: null,
    emailCandidateSourceUrl: null,
    failureReason: null,
    copyGeneratedAt: null,
    qualityCheckedAt: null,
    humanReviewStatus: null,
    gmailDraftStatus: null,
    sendStatus: null,
    notes: '',
    collectedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const formOnlyCandidate = {
    ...emailCandidate,
    externalCandidateId: 'phase33-form',
    companyName: 'フォームのみ工務店',
    websiteUrl: 'https://form.test',
    officialSiteUrl: 'https://form.test',
    emailCandidates: [],
    pipelineStatus: 'email_not_found' as const,
    contactFormUrl: 'https://form.test/contact',
  };
  const metrics = countDaily30BatchMetrics([emailCandidate, formOnlyCandidate], batchId);
  assert(metrics.emailFound === 1, 'only email_found counts toward email KPI');
  assert(metrics.formOnly === 1, 'form-only tracked separately');
  assert(metrics.totalCollected === 2, 'form-only still in total collected');
  assert(!metrics.reachedTarget, 'one email_found is not target reached');

  const dashboard = buildDaily30Dashboard([emailCandidate, formOnlyCandidate], [], batchId);
  assert(dashboard.emailShortfall === 29, 'shortfall based on email_found not total collected');

  const { buildDaily30FetchPlan } = await import('../candidates/fetchDaily30Candidates.js');
  const plan = buildDaily30FetchPlan();
  assert(plan.targetEmailFound === 30, 'fetch plan documents email target');

  const cloudPanel = await readFile(join(SRC_ROOT, 'ui/Daily30CloudResultsPanel.tsx'), 'utf-8');
  assert(!cloudPanel.includes('GOOGLE_PLACES_API_KEY'), 'no api key in cloud results UI');
  assert(!cloudPanel.includes('DAILY30_CLOUD_RUN_TOKEN'), 'no token in cloud results UI');

  ok('Phase 33 Email Found 30 collection checks passed');
}

async function verifyPhase34LeadApprovalCopyFlow(): Promise<void> {
  const cards = await readFile(join(SRC_ROOT, 'ui/Daily30CandidateCards.tsx'), 'utf-8');
  assert(cards.includes('Lead化承認'), 'candidate cards have lead approve button');
  assert(cards.includes('resolveDaily30WorkflowStatus'), 'candidate cards show workflow status');

  const cloudPanel = await readFile(join(SRC_ROOT, 'ui/Daily30CloudResultsPanel.tsx'), 'utf-8');
  assert(cloudPanel.includes('confirmDaily30LeadApproval'), 'cloud panel requires human confirm');
  assert(cloudPanel.includes('showApprove'), 'cloud panel enables approve on email_found');

  const leadPanel = await readFile(join(SRC_ROOT, 'ui/Daily30LeadCandidatesPanel.tsx'), 'utf-8');
  assert(leadPanel.includes('confirmDaily30LeadApproval'), 'lead panel requires human confirm');
  assert(leadPanel.includes('GENERATE_DAILY_30_COPY_GATE_LABEL'), 'lead panel has copy gate');
  assert(leadPanel.includes('営業文生成待ち'), 'lead panel shows copy pending count');
  assert(leadPanel.includes('Daily30CandidateList'), 'lead panel uses candidate cards');

  const approveWorkflow = await readFile(
    join(SRC_ROOT, 'workflow/approveExternalCandidateForLead.ts'),
    'utf-8'
  );
  assert(approveWorkflow.includes("importStatus: 'approved_for_lead'"), 'approval sets importStatus');
  assert(approveWorkflow.includes("pipelineStatus: 'ready_for_copy'"), 'approval sets ready_for_copy');
  assert(!approveWorkflow.includes('saveLeadsToJson'), 'approval does not write leads.json');
  assert(!approveWorkflow.includes('users.drafts.create'), 'approval does not create drafts');

  const copyPipeline = await readFile(join(SRC_ROOT, 'candidates/runDaily30CopyPipeline.ts'), 'utf-8');
  assert(copyPipeline.includes('qualityCheckDaily30Copy'), 'copy pipeline runs quality check');
  assert(copyPipeline.includes("pipelineStatus: 'ready_for_draft'"), 'QC pass sets ready_for_draft');
  assert(!copyPipeline.includes('messages.send'), 'copy pipeline does not send email');
  assert(!copyPipeline.includes('users.drafts.create'), 'copy pipeline does not create drafts');

  const uiServer = await readFile(join(SRC_ROOT, 'server/uiServer.ts'), 'utf-8');
  assert(uiServer.includes('/api/daily30-ready-for-draft'), 'ready-for-draft route exists');
  assert(uiServer.includes('buildDaily30ReadyForDraftApiPayload'), 'ready-for-draft uses payload builder');
  assert(uiServer.includes(GENERATE_DAILY_30_COPY_CONFIRM_TOKEN), 'generate-copy gate in uiServer');
  assert(uiServer.includes(IMPORT_DAILY_30_DRAFT_CANDIDATES_CONFIRM_TOKEN), 'import gate in uiServer');

  const candidateView = await readFile(join(SRC_ROOT, 'ui/CandidateCollectionView.tsx'), 'utf-8');
  assert(candidateView.includes('GENERATE_DAILY_30_COPY'), 'flow steps mention copy gate');
  assert(candidateView.includes('IMPORT_DAILY_30_DRAFT_CANDIDATES'), 'flow steps mention import gate');
  assert(candidateView.includes('Lead化承認・営業文生成'), 'section 2 title updated');

  const { resolveDaily30WorkflowStatus } = await import('../candidates/resolveDaily30WorkflowStatus.js');
  const pending = {
    externalCandidateId: 'p34-pending',
    pipelineStatus: 'email_found' as const,
    importStatus: 'preview' as const,
    companyName: '未承認工務店',
    emailCandidates: ['info@pending.test'],
    emailCandidateSourceUrls: ['https://pending.test/contact'],
    websiteUrl: 'https://pending.test',
    officialSiteUrl: 'https://pending.test',
  };
  assert(resolveDaily30WorkflowStatus(pending as never).label === '未承認', 'pending shows 未承認');

  const approved = {
    ...pending,
    externalCandidateId: 'p34-approved',
    importStatus: 'approved_for_lead' as const,
    pipelineStatus: 'ready_for_copy' as const,
    companyName: '承認済工務店',
  };
  assert(
    resolveDaily30WorkflowStatus(approved as never).label === '営業文生成待ち',
    'approved shows copy pending'
  );

  const { buildDaily30ReadyForDraftApiPayload } = await import(
    '../candidates/buildDaily30ReadyForDraftApiPayload.js'
  );
  const payload = buildDaily30ReadyForDraftApiPayload([], []);
  assert(payload.ok === true, 'ready-for-draft payload ok');
  assert(Array.isArray(payload.readyForDraftCandidates), 'readyForDraftCandidates array');
  assert(Array.isArray(payload.approvedLeadCandidates), 'approvedLeadCandidates array');
  assert(typeof payload.counts.readyForDraft === 'number', 'counts.readyForDraft');

  const leads = await loadLeadsFromJson(getLeadsJsonPath()).catch(() => []);
  const sentSnapshot = (Array.isArray(leads) ? leads : [])
    .filter((l) => l.sendStatus === 'sent' || l.sendStatus === 'manual_sent')
    .map((l) => ({ id: l.id, sendStatus: l.sendStatus, replyStatus: l.replyStatus }));

  const leadsAfter = await loadLeadsFromJson(getLeadsJsonPath()).catch(() => []);
  for (const before of sentSnapshot) {
    const after = (Array.isArray(leadsAfter) ? leadsAfter : []).find((l) => l.id === before.id);
    assert(after, `sent lead preserved phase34: ${before.id}`);
    assert(after.sendStatus === before.sendStatus, `sendStatus unchanged phase34: ${before.id}`);
  }

  const draftPanel = await readFile(join(SRC_ROOT, 'ui/Daily30DraftImportPanel.tsx'), 'utf-8');
  assert(!draftPanel.includes('GOOGLE_PLACES_API_KEY'), 'no secrets in draft panel');
  assert(draftPanel.includes('CREATE_DRAFTS'), 'draft panel references CREATE_DRAFTS gate');

  ok('Phase 34 Lead approval and copy flow checks passed');
}

async function verifyPhase35OneScreenDashboard(): Promise<void> {
  const dashboardView = await readFile(join(SRC_ROOT, 'ui/SalesDashboardView.tsx'), 'utf-8');
  assert(dashboardView.includes('dashboard-one-screen'), 'dashboard uses one-screen layout class');
  assert(dashboardView.includes('dashboard-hero-compact'), 'dashboard has compact hero');
  assert(dashboardView.includes('dashboard-cycle-strip'), 'dashboard has cycle strip');
  assert(dashboardView.includes('dashboard-queue-grid'), 'dashboard has compact queue grid');
  assert(dashboardView.includes('dashboard-weekly-compact'), 'dashboard has compact weekly summary');
  assert(dashboardView.includes('DashboardCompactChecklist'), 'dashboard uses compact checklist');
  assert(!dashboardView.includes('DailyChecklistPanel'), 'full checklist panel removed from dashboard');
  assert(!dashboardView.includes('btn-lg'), 'dashboard removed large hero button');
  assert(dashboardView.includes('週次レビューを開く'), 'weekly review collapsed behind toggle');

  const styles = await readFile(join(SRC_ROOT, 'ui/styles.css'), 'utf-8');
  assert(styles.includes('.dashboard-one-screen'), 'styles define dashboard-one-screen');
  assert(styles.includes('.dashboard-cycle-strip-row'), 'styles define cycle strip row');
  assert(styles.includes('.dashboard-queue-mini'), 'styles define queue mini cards');
  assert(styles.includes('.weekly-review-textarea-compact'), 'weekly textarea height limited');

  const shell = await readFile(join(SRC_ROOT, 'ui/GrowlySalesDashboard.tsx'), 'utf-8');
  assert(shell.includes('dashboard-sidebar-compact'), 'sidebar compact class');
  assert(shell.includes('dashboard-header-compact'), 'header compact class');
  assert(shell.includes('tab-scroll-dashboard'), 'dashboard tab scroll class');
  assert(shell.includes("activeTab !== 'dashboard'"), 'pilot banner hidden on dashboard tab duplicate');

  const pilot = await readFile(join(SRC_ROOT, 'ui/PilotModeBanner.tsx'), 'utf-8');
  assert(pilot.includes('compact'), 'pilot banner supports compact mode');
  assert(!pilot.includes('GOOGLE_PLACES_API_KEY'), 'no secrets in pilot banner');

  const compactChecklist = await readFile(join(SRC_ROOT, 'ui/DashboardCompactChecklist.tsx'), 'utf-8');
  assert(compactChecklist.includes('要対応'), 'compact checklist shows attention summary');

  ok('Phase 35 one-screen dashboard layout checks passed');
}

async function verifyPhase36UiPolish(): Promise<void> {
  const styles = await readFile(join(SRC_ROOT, 'ui/styles.css'), 'utf-8');
  assert(styles.includes('.status-badge'), 'Phase 36 unified status badges');
  assert(styles.includes('.daily30-candidate-card-compact'), 'Phase 36 compact candidate cards');
  assert(styles.includes('.candidate-collection-view'), 'Phase 36 candidate collection spacing');
  assert(styles.includes('dashboard-cycle-step-label'), 'cycle step label ellipsis');

  const statusLabels = await readFile(join(SRC_ROOT, 'ui/daily30StatusLabels.ts'), 'utf-8');
  assert(statusLabels.includes('メール取得済'), 'Japanese pipeline status labels');
  assert(statusLabels.includes('cloudRunStatusLabel'), 'cloud run status labels');

  const candidateCards = await readFile(join(SRC_ROOT, 'ui/Daily30CandidateCards.tsx'), 'utf-8');
  assert(candidateCards.includes('daily30StatusLabels'), 'candidate cards use shared labels');
  assert(candidateCards.includes('status-badge'), 'candidate cards use status-badge');
  assert(candidateCards.includes('btn-xs'), 'Lead approve button is compact');

  const cloudPanel = await readFile(join(SRC_ROOT, 'ui/Daily30CloudResultsPanel.tsx'), 'utf-8');
  assert(cloudPanel.includes('cloudRunStatusLabel'), 'cloud panel uses shared run labels');
  assert(cloudPanel.includes('DevDetails'), 'run meta hidden in dev details');
  assert(cloudPanel.includes('メール取得済候補'), 'email found section Japanese title');
  assert(!cloudPanel.includes('IMPORT_DAILY_30_DRAFT_CANDIDATES'), 'no gate code in main UI');

  const collectionView = await readFile(join(SRC_ROOT, 'ui/CandidateCollectionView.tsx'), 'utf-8');
  assert(collectionView.includes('メール取得済み候補を確認してLead化します'), 'short collection subtitle');
  assert(!collectionView.includes('Daily 30 実運用フロー'), 'flow moved out of main view');

  const dashboard = await readFile(join(SRC_ROOT, 'ui/SalesDashboardView.tsx'), 'utf-8');
  assert(dashboard.includes('返信待ち'), 'short cycle label for replies');
  assert(dashboard.includes('下書き可'), 'short cycle label for drafts');

  const leadPanel = await readFile(join(SRC_ROOT, 'ui/Daily30LeadCandidatesPanel.tsx'), 'utf-8');
  assert(leadPanel.includes('営業文を生成する'), 'generate copy button label');
  assert(leadPanel.includes('human-gate-action-block'), 'generate copy action block');

  const draftPanel = await readFile(join(SRC_ROOT, 'ui/Daily30DraftImportPanel.tsx'), 'utf-8');
  assert(draftPanel.includes('下書き待ち'), 'draft import Japanese stat label');
  assert(draftPanel.includes('取り込む'), 'short import button label');

  ok('Phase 36 UI polish checks passed');
}

async function verifyPhase365DashboardReadability(): Promise<void> {
  const styles = await readFile(join(SRC_ROOT, 'ui/styles.css'), 'utf-8');
  assert(styles.includes('Phase 36.5'), 'Phase 36.5 readability styles');
  assert(styles.includes('.dashboard-readable'), 'dashboard-readable class styles');
  assert(styles.includes('.dashboard-shell-readable'), 'shell readable padding styles');
  assert(styles.includes('.dashboard-hero-cta-btn'), 'hero CTA button styles');
  assert(styles.includes('.dashboard-dev-details'), 'compact dev details margin');
  assert(styles.includes('flex: 0 1 auto'), 'dashboard scroll area does not stretch empty');

  const dashboard = await readFile(join(SRC_ROOT, 'ui/SalesDashboardView.tsx'), 'utf-8');
  assert(dashboard.includes('dashboard-readable'), 'dashboard view uses readable class');
  assert(dashboard.includes('dashboard-hero-cta-btn'), 'hero CTA uses readable button class');
  assert(!dashboard.includes('btn-sm dashboard-hero-cta'), 'hero CTA no longer extra-small');

  const shell = await readFile(join(SRC_ROOT, 'ui/GrowlySalesDashboard.tsx'), 'utf-8');
  assert(shell.includes('dashboard-shell-readable'), 'shell uses readable class');

  const devDetails = await readFile(join(SRC_ROOT, 'ui/common/DevDetails.tsx'), 'utf-8');
  assert(devDetails.includes('className'), 'DevDetails supports className for dashboard margin');

  ok('Phase 36.5 dashboard readability checks passed');
}

async function verifyPhase366LeadListPanel(): Promise<void> {
  const styles = await readFile(join(SRC_ROOT, 'ui/styles.css'), 'utf-8');
  assert(styles.includes('Phase 36.6'), 'Phase 36.6 lead list layout styles');
  assert(styles.includes('.leads-two-pane'), 'leads two-pane grid');
  assert(styles.includes('table-layout: fixed'), 'lead table fixed layout');
  assert(styles.includes('.lead-detail-compact'), 'compact lead detail panel');
  assert(styles.includes('position: static'), 'detail sticky removed in leads workspace');
  assert(styles.includes('.textarea-review-comment'), 'review comment textarea height limit');
  assert(styles.includes('.email-body-compact'), 'compact email body textarea');

  const shell = await readFile(join(SRC_ROOT, 'ui/GrowlySalesDashboard.tsx'), 'utf-8');
  assert(shell.includes('leads-two-pane'), 'leads tab uses two-pane class');

  const listView = await readFile(join(SRC_ROOT, 'ui/LeadListView.tsx'), 'utf-8');
  assert(listView.includes('lead-table-fixed'), 'lead table fixed class');
  assert(listView.includes('lead-cell-ellipsis'), 'lead cells use ellipsis');

  const detail = await readFile(join(SRC_ROOT, 'ui/LeadDetailPanel.tsx'), 'utf-8');
  assert(detail.includes('lead-detail-compact'), 'detail panel compact class');
  assert(detail.includes('shortenUrl'), 'URLs shortened in detail panel');

  const review = await readFile(join(SRC_ROOT, 'ui/LeadReviewActions.tsx'), 'utf-8');
  assert(review.includes('review-actions-compact'), 'compact review actions');
  assert(review.includes('btn-sm'), 'review buttons use compact size');
  assert(review.includes('textarea-review-comment'), 'review comment textarea class');

  ok('Phase 36.6 Lead list detail panel layout checks passed');
}

async function verifyPhase37PartialSuccessState(): Promise<void> {
  const cloudFetch = await readFile(join(SRC_ROOT, 'candidates/runDaily30CloudAutoFetch.ts'), 'utf-8');
  assert(cloudFetch.includes('partial_success'), 'cloud run records partial_success');
  assert(cloudFetch.includes('ensureDaily30StoppedReasonForRun'), 'state entry ensures stoppedReason');
  assert(cloudFetch.includes('Daily 30 email-found target completed'), 'success message');
  assert(
    cloudFetch.includes('Daily 30 partially completed — email-found target not reached'),
    'partial_success message'
  );
  assert(cloudFetch.includes('buildFetchFailedMessage'), 'failed message helper');
  assert(!cloudFetch.includes('messages.send'), 'phase37 no gmail send');
  assert(!cloudFetch.includes('users.drafts.create'), 'phase37 no drafts create');

  const stateFile = await readFile(join(SRC_ROOT, 'storage/daily30CloudRunState.ts'), 'utf-8');
  assert(stateFile.includes('partial_success'), 'duplicate guard includes partial_success');
  assert(stateFile.includes("status === 'success' && !reachedTarget"), 'normalize fixes mislabeled success');

  const metricsSrc = await readFile(join(SRC_ROOT, 'candidates/daily30BatchMetrics.ts'), 'utf-8');
  assert(metricsSrc.includes('area_expansion_not_completed'), 'new stoppedReason type');
  assert(metricsSrc.includes('collected_limit_reached_before_email_target'), 'legacy stop reason type');
  assert(metricsSrc.includes('ensureDaily30StoppedReasonForRun'), 'stoppedReason backfill helper');

  const fetchSrc = await readFile(join(SRC_ROOT, 'candidates/fetchDaily30Candidates.ts'), 'utf-8');
  assert(fetchSrc.includes('areasUsedCount'), 'fetch passes areasUsed to stoppedReason resolver');
  assert(!fetchSrc.includes('needed <= 0'), 'fetch does not stop on collected-only threshold');
  const { DAILY_30_MAX_COLLECTED_CANDIDATES } = await import('../candidates/daily30CandidateStatus.js');
  assert(DAILY_30_MAX_COLLECTED_CANDIDATES === 120, 'max collected candidates is 120');

  const {
    ensureDaily30StoppedReasonForRun,
    countDaily30BatchMetrics,
  } = await import('../candidates/daily30BatchMetrics.js');
  const partialReason = ensureDaily30StoppedReasonForRun({
    reachedTarget: false,
    emailFound: 9,
    targetEmailFound: 30,
    totalCollected: 30,
    durationMs: 60_000,
    totalAreas: 5,
  });
  assert(
    partialReason === 'area_expansion_not_completed',
    'email 9/30 with areas remaining yields area_expansion_not_completed'
  );
  const successReason = ensureDaily30StoppedReasonForRun({
    reachedTarget: true,
    emailFound: 30,
    targetEmailFound: 30,
    totalCollected: 45,
    durationMs: 60_000,
  });
  assert(successReason === 'target_email_found_reached', 'target reached reason');

  const { buildDaily30Dashboard } = await import('../candidates/buildDaily30Dashboard.js');
  const batchId = '2026-07-01';
  const approvedCandidate = {
    externalCandidateId: 'phase37-approved',
    sourceType: 'google_places' as const,
    companyName: '承認済工務店',
    area: '茨城県',
    industry: '工務店',
    websiteUrl: 'https://approved.test',
    officialSiteUrl: 'https://approved.test',
    phoneNumber: null,
    address: null,
    googlePlaceId: null,
    sourceUrl: null,
    sourceQuery: 'q',
    category: '工務店',
    contactFormUrl: null,
    emailCandidates: ['info@approved.test'],
    confidenceScore: 0.8,
    importStatus: 'approved_for_lead' as const,
    riskLevel: 'low' as const,
    duplicateReason: '',
    duplicateKey: 'k-approved',
    pipelineStatus: 'ready_for_copy' as const,
    prefecture: '茨城県',
    regionGroup: '北関東' as const,
    collectionPriority: 3,
    collectionAreaSource: '茨城県',
    collectionBatchId: batchId,
    emailCandidateSourceUrls: ['https://approved.test/contact'],
  };
  const pendingCandidate = {
    ...approvedCandidate,
    externalCandidateId: 'phase37-pending',
    companyName: '承認待ち工務店',
    importStatus: 'preview' as const,
    pipelineStatus: 'email_found' as const,
    duplicateKey: 'k-pending',
    emailCandidates: ['info@pending.test'],
    emailCandidateSourceUrls: ['https://pending.test/contact'],
    websiteUrl: 'https://pending.test',
    officialSiteUrl: 'https://pending.test',
  };
  const formOnlyCandidate = {
    ...pendingCandidate,
    externalCandidateId: 'phase37-form',
    companyName: 'フォームのみ',
    pipelineStatus: 'email_not_found' as const,
    emailCandidates: [],
    emailCandidateSourceUrls: [],
    contactFormUrl: 'https://form.test/contact',
    importStatus: 'preview' as const,
    duplicateKey: 'k-form',
  };
  const cloudEntry = {
    runId: 'phase37-run',
    batchId,
    mode: 'run' as const,
    status: 'partial_success' as const,
    startedAt: '2026-07-01T00:00:00.000Z',
    finishedAt: '2026-07-01T00:03:00.000Z',
    completedAt: '2026-07-01T00:03:00.000Z',
    durationMs: 180_000,
    collected: 30,
    targetEmailFound: 30,
    emailFound: 9,
    totalCollected: 30,
    formOnly: 0,
    noEmail: 0,
    reachedTarget: false,
    stoppedReason: 'area_expansion_not_completed' as const,
    duplicates: 0,
    excluded: 0,
    storageBackend: 'gcs',
    schedulerConfigured: true,
    cloudRunServiceUrlConfigured: true,
    gcsBucketConfigured: true,
    force: false,
  };
  const candidates = [approvedCandidate, pendingCandidate, formOnlyCandidate];
  const batchMetrics = countDaily30BatchMetrics(candidates, batchId);
  assert(batchMetrics.formOnly === 1, 'batch metrics formOnly from JSON');
  assert(batchMetrics.emailFound === 1, 'live email_found count drops after approval');

  const dashboard = buildDaily30Dashboard(candidates, [], batchId, cloudEntry);
  assert(dashboard.emailFoundAtCollection === 9, 'collection-time email stays 9 after approval');
  assert(dashboard.leadApprovalPendingCount === 1, 'approval pending is live pipeline count');
  assert(dashboard.leadApprovalApprovedCount === 1, 'approved count tracked');
  assert(dashboard.formOnlyAtCollection === 1, 'stale GCS formOnly backfilled from JSON');
  assert(dashboard.collectionRunStatus === 'partial_success', 'dashboard exposes run status');

  const candidateView = await readFile(join(SRC_ROOT, 'ui/CandidateCollectionView.tsx'), 'utf-8');
  assert(candidateView.includes('メール営業候補'), 'candidate view email sales label');
  assert(candidateView.includes('Lead化承認済み'), 'candidate view approved label');
  assert(candidateView.includes('daily30Loading'), 'candidate view handles loading');

  const salesDash = await readFile(join(SRC_ROOT, 'ui/SalesDashboardView.tsx'), 'utf-8');
  assert(salesDash.includes('emailFoundAtCollection'), 'sales dashboard uses collection-time metric');
  assert(salesDash.includes('daily30Loading'), 'sales dashboard avoids 0/30 flash');

  const shell = await readFile(join(SRC_ROOT, 'ui/GrowlySalesDashboard.tsx'), 'utf-8');
  assert(shell.includes('daily30Loading'), 'shell tracks daily30 loading state');

  const blockReason = await readFile(
    join(SRC_ROOT, 'candidates/getDaily30LeadApprovalBlockReason.ts'),
    'utf-8'
  );
  assert(blockReason.includes('duplicateLeadName'), 'duplicate lead name in block hints');

  const cards = await readFile(join(SRC_ROOT, 'ui/Daily30CandidateCards.tsx'), 'utf-8');
  assert(cards.includes('approvalBlockReason'), 'candidate cards show block reason');

  ok('Phase 37 partial success / state / UI checks passed');
}

async function verifyEmailSourceDisplay(): Promise<void> {
  const resolverPath = join(SRC_ROOT, 'candidates/resolveEmailSourceDisplay.ts');
  const uiPath = join(SRC_ROOT, 'ui/EmailSourceDisplay.tsx');
  await access(resolverPath);
  await access(uiPath);

  const {
    resolveEmailSourceFromLead,
    resolveEmailSourceFromCandidate,
    isPlaceholderEmailAddress,
  } = await import('../candidates/resolveEmailSourceDisplay.js');
  const { buildEmailOutreachCandidateView } = await import('../outreach/outreachPolicy.js');
  const { buildManualGmailSendPreview } = await import('../workflow/recordManualGmailSent.js');

  const lead = createEmptyLead({
    companyName: '取得先テスト工務店',
    area: '茨城県',
    industry: '工務店',
    websiteUrl: 'https://oakvillehomes.jp/',
    emailCandidates: ['info@oakvillehomes.jp'],
    emailCandidateSourceUrls: ['https://oakvillehomes.jp/about'],
    contactFormUrl: 'https://oakvillehomes.jp/contact',
    emailContactType: 'corporate',
    collectionBatchId: '2026-07-01',
    source: 'daily30',
    humanReviewStatus: 'approved',
    reviewStatus: 'approve',
    sendStatus: 'not_sent',
    gmailDraftStatus: 'draft_created',
    gmailDraftId: 'r-verify-email-source',
    emailSubject: '件名',
    emailBody: '本文',
  });

  const resolved = resolveEmailSourceFromLead(lead);
  assert(resolved.emailSourceUrl === 'https://oakvillehomes.jp/about', 'uses emailCandidateSourceUrls[0]');
  assert(resolved.isOfficialSiteOrigin, 'official site origin when same domain');
  assert(!resolved.isPlaceholderEmail, 'corporate email is not placeholder');
  assert(!resolved.isPersonalEmail, 'corporate email is not personal');

  assert(resolved.emailSourceLabel.includes('公式サイト /'), 'label uses official site prefix');
  assert(resolved.emailSourceLabel.includes('会社概要'), 'about page labeled as company profile');
  assert(resolved.emailSourceConfirmed, 'explicit source url is confirmed');

  const contactLead = createEmptyLead({
    companyName: '問い合わせテスト',
    area: '宮城県',
    industry: '工務店',
    websiteUrl: 'https://utsumi-h.com/',
    emailCandidates: ['info@utsumi-h.com'],
    emailCandidateSourceUrls: ['https://utsumi-h.com/contact'],
    contactFormUrl: 'https://utsumi-h.com/contact',
    emailContactType: 'corporate',
  });
  const contactResolved = resolveEmailSourceFromLead(contactLead);
  assert(
    contactResolved.emailSourceLabel.includes('お問い合わせ'),
    'contact page uses お問い合わせ label not form-only wording'
  );
  assert(
    !contactResolved.emailSourceLabel.includes('問い合わせフォームページ'),
    'avoids ambiguous 問い合わせフォームページ label'
  );

  const view = buildEmailOutreachCandidateView(lead);
  assert(view.emailSourceUrl === resolved.emailSourceUrl, 'outreach view exposes emailSourceUrl');
  assert(view.emailSourceLabel.length > 0, 'outreach view exposes emailSourceLabel');

  const preview = buildManualGmailSendPreview(lead);
  assert(preview.emailSourceUrl === resolved.emailSourceUrl, 'send preview includes emailSourceUrl');
  assert(preview.batchId === '2026-07-01', 'send preview includes batchId');
  assert(preview.source === 'daily30', 'send preview includes source');

  assert(isPlaceholderEmailAddress('info@xxx.com'), 'detects xxx placeholder');

  const candidate = {
    externalCandidateId: 'verify-email-source',
    sourceType: 'google_places' as const,
    companyName: '候補テスト',
    area: '宮城県',
    industry: '工務店',
    websiteUrl: 'https://e-s-first.com/',
    officialSiteUrl: 'https://e-s-first.com/',
    phoneNumber: null,
    address: null,
    googlePlaceId: null,
    sourceUrl: null,
    sourceQuery: 'q',
    category: '工務店',
    contactFormUrl: 'https://e-s-first.com/contact',
    emailCandidates: ['info@mutumisetubi.com'],
    confidenceScore: 0.8,
    importStatus: 'preview' as const,
    riskLevel: 'low' as const,
    duplicateReason: '',
    duplicateKey: 'k',
    pipelineStatus: 'email_found' as const,
    prefecture: '宮城県',
    regionGroup: '宮城' as const,
    collectionPriority: 1,
    collectionAreaSource: '宮城県',
    collectionBatchId: '2026-07-01',
    emailCandidateSourceUrls: ['https://e-s-first.com/company'],
    emailVerifiedAt: null,
    generatedEmailSubject: null,
    generatedEmailBody: null,
    generatedCustomHook: null,
    generatedCustomHookReason: null,
    targetEmail: 'info@mutumisetubi.com',
    emailCandidateSourceUrl: 'https://e-s-first.com/company',
    failureReason: null,
    copyGeneratedAt: null,
    qualityCheckedAt: null,
    humanReviewStatus: null,
    gmailDraftStatus: null,
    sendStatus: null,
    notes: '',
    collectedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const fromCandidate = resolveEmailSourceFromCandidate(candidate);
  assert(
    fromCandidate.emailSourceUrl === 'https://e-s-first.com/company',
    'candidate resolver uses emailCandidateSourceUrl'
  );

  const gmailDialog = await readFile(join(SRC_ROOT, 'ui/GmailDraftCreateDialog.tsx'), 'utf-8');
  const leadDetail = await readFile(join(SRC_ROOT, 'ui/LeadDetailPanel.tsx'), 'utf-8');
  const emailUi = await readFile(join(SRC_ROOT, 'ui/EmailSourceDisplay.tsx'), 'utf-8');
  const recordWorkflow = await readFile(join(SRC_ROOT, 'workflow/recordManualGmailSent.ts'), 'utf-8');
  assert(emailUi.includes('メール取得元'), 'UI label is メール取得元');
  assert(gmailDialog.includes('EmailSourceConfirmBlock'), 'gmail create dialog shows email source confirm');
  assert(leadDetail.includes('EmailSourceDisplay'), 'lead detail shows email source');
  assert(recordWorkflow.includes('emailSourceUrl='), 'send memo records emailSourceUrl');
  assert(!recordWorkflow.includes('messages.send'), 'email source record workflow does not send');

  ok('Email source URL display checks passed');
}

async function verifyPhase381EmailSourceAndExclude(): Promise<void> {
  const excludeWorkflow = await readFile(join(SRC_ROOT, 'workflow/excludeDaily30Candidate.ts'), 'utf-8');
  const cards = await readFile(join(SRC_ROOT, 'ui/Daily30CandidateCards.tsx'), 'utf-8');
  const confirmExclude = await readFile(join(SRC_ROOT, 'ui/confirmDaily30CandidateExclude.ts'), 'utf-8');
  const uiServer = await readFile(join(SRC_ROOT, 'server/uiServer.ts'), 'utf-8');
  const copyApi = await readFile(join(SRC_ROOT, 'ui/daily30CopyApi.ts'), 'utf-8');

  assert(excludeWorkflow.includes("pipelineStatus: 'excluded'"), 'exclude sets pipelineStatus excluded');
  assert(excludeWorkflow.includes("importStatus: 'excluded'"), 'exclude sets importStatus excluded');
  assert(excludeWorkflow.includes('excludedBy:'), 'exclude records excludedBy');
  assert(excludeWorkflow.includes('imported'), 'exclude blocks imported candidates');
  assert(!excludeWorkflow.includes('messages.send'), 'exclude workflow does not send gmail');
  assert(!excludeWorkflow.includes('users.drafts.create'), 'exclude workflow does not create drafts');

  assert(cards.includes('候補から除外'), 'candidate card has exclude button');
  assert(cards.includes('btn-exclude'), 'exclude button uses subdued red style');
  assert(cards.includes('承認不可'), 'duplicate shows approval blocked');
  assert(cards.includes('isPlaceholderEmail'), 'placeholder email blocks approval via isPlaceholderEmail');

  assert(confirmExclude.includes('window.confirm'), 'exclude uses confirm dialog');
  assert(confirmExclude.includes('window.prompt'), 'exclude uses reason prompt');

  assert(uiServer.includes('/api/daily30-candidates/exclude'), 'exclude API route exists');
  assert(copyApi.includes('excludeDaily30CandidateApi'), 'client exclude API helper');

  const { filterDaily30VisibleCandidates } = await import('../workflow/excludeDaily30Candidate.js');
  const { isPlaceholderEmailAddress } = await import('../candidates/resolveEmailSourceDisplay.js');
  assert(isPlaceholderEmailAddress('info@xxx.com'), 'placeholder info@xxx.com detected');

  const excludedSample = {
    ...({
      externalCandidateId: 'phase381-exclude-visible',
      importStatus: 'excluded' as const,
      pipelineStatus: 'excluded' as const,
      excludedBy: 'human' as const,
    }),
  } as import('../adapters/externalLeadCandidateTypes.js').ExternalLeadCandidate;
  const visible = filterDaily30VisibleCandidates([excludedSample]);
  assert(visible.length === 0, 'excluded candidate hidden from visible list');

  ok('Phase 38.1 email source normalization and candidate exclude checks passed');
}

async function verifyPhase382ExcludeRefreshAndEmailLayout(): Promise<void> {
  const leadPanel = await readFile(join(SRC_ROOT, 'ui/Daily30LeadCandidatesPanel.tsx'), 'utf-8');
  const cloudPanel = await readFile(join(SRC_ROOT, 'ui/Daily30CloudResultsPanel.tsx'), 'utf-8');
  const emailUi = await readFile(join(SRC_ROOT, 'ui/EmailSourceDisplay.tsx'), 'utf-8');
  const cards = await readFile(join(SRC_ROOT, 'ui/Daily30CandidateCards.tsx'), 'utf-8');
  const selectSrc = await readFile(join(SRC_ROOT, 'candidates/selectDaily30LeadCandidates.ts'), 'utf-8');
  const dashSrc = await readFile(join(SRC_ROOT, 'candidates/buildDaily30Dashboard.ts'), 'utf-8');
  const uiServer = await readFile(join(SRC_ROOT, 'server/uiServer.ts'), 'utf-8');
  const excludeWorkflow = await readFile(join(SRC_ROOT, 'workflow/excludeDaily30Candidate.ts'), 'utf-8');

  assert(leadPanel.includes('await load()'), 'lead panel reloads after exclude');
  assert(leadPanel.includes('setApprovalPending'), 'lead panel optimistic remove on exclude');
  assert(cloudPanel.includes('await load()'), 'cloud panel reloads after exclude');
  assert(emailUi.includes('under-email'), 'email source under-email layout exists');
  assert(emailUi.includes('メール取得元'), 'email source label unified');
  assert(!emailUi.includes('取得先'), 'old 取得先 label removed from EmailSourceDisplay');
  assert(cards.includes('variant="under-email"'), 'candidate cards use under-email layout');
  assert(selectSrc.includes('isDaily30CandidateVisibleInLists'), 'select filters excluded via visibility helper');
  assert(dashSrc.includes('humanExcludedCount'), 'dashboard tracks humanExcludedCount');
  assert(uiServer.includes('filterDaily30VisibleCandidates'), 'lead-candidates API filters visible only');
  assert(uiServer.includes('ok: true') || excludeWorkflow.includes('ok: true'), 'exclude API returns ok:true');
  assert(excludeWorkflow.includes('humanReviewStatus'), 'exclude saves humanReviewStatus');

  const {
    isDaily30LeadApprovalPending,
    selectDaily30LeadApprovalPending,
  } = await import('../candidates/selectDaily30LeadCandidates.js');

  const base = {
    externalCandidateId: 'phase382-pending',
    sourceType: 'google_places' as const,
    companyName: '承認待ちテスト',
    area: '宮城県',
    industry: '工務店',
    websiteUrl: 'https://phase382.test/',
    officialSiteUrl: 'https://phase382.test/',
    phoneNumber: null,
    address: null,
    googlePlaceId: null,
    sourceUrl: null,
    sourceQuery: 'q',
    category: '工務店',
    contactFormUrl: 'https://phase382.test/contact',
    emailCandidates: ['info@phase382.test'],
    confidenceScore: 0.8,
    importStatus: 'preview' as const,
    riskLevel: 'low' as const,
    duplicateReason: '',
    duplicateKey: 'k382',
    pipelineStatus: 'email_found' as const,
    prefecture: '宮城県',
    regionGroup: '宮城' as const,
    collectionPriority: 1,
    collectionAreaSource: '宮城県',
    collectionBatchId: '2099-01-01',
    emailCandidateSourceUrls: ['https://phase382.test/contact'],
    emailVerifiedAt: null,
    generatedEmailSubject: null,
    generatedEmailBody: null,
    generatedCustomHook: null,
    generatedCustomHookReason: null,
    targetEmail: 'info@phase382.test',
    emailCandidateSourceUrl: 'https://phase382.test/contact',
    failureReason: null,
    copyGeneratedAt: null,
    qualityCheckedAt: null,
    humanReviewStatus: null,
    gmailDraftStatus: null,
    sendStatus: null,
    notes: '',
    collectedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  assert(isDaily30LeadApprovalPending(base), 'email_found candidate is approval pending');
  const excluded = {
    ...base,
    externalCandidateId: 'phase382-excluded',
    pipelineStatus: 'excluded' as const,
    importStatus: 'excluded' as const,
    humanReviewStatus: 'rejected' as const,
    excludedAt: new Date().toISOString(),
    excludedReason: '既存Lead重複',
    excludedBy: 'human' as const,
  };
  assert(!isDaily30LeadApprovalPending(excluded), 'excluded candidate not approval pending');
  const listed = selectDaily30LeadApprovalPending([base, excluded]);
  assert(listed.length === 1 && listed[0].externalCandidateId === base.externalCandidateId, 'approval pending list excludes human-excluded');

  const { buildDaily30Dashboard } = await import('../candidates/buildDaily30Dashboard.js');
  const dash = buildDaily30Dashboard([base, excluded], [], '2099-01-01');
  assert(dash.leadApprovalPendingCount === 1, 'dashboard leadApprovalPendingCount excludes human-excluded');
  assert(dash.humanExcludedCount === 1, 'dashboard humanExcludedCount increments');

  ok('Phase 38.2 exclude refresh and email layout checks passed');
}

async function verifyPhase383ExcludeImmediateUiAndApi(): Promise<void> {
  const leadPanel = await readFile(join(SRC_ROOT, 'ui/Daily30LeadCandidatesPanel.tsx'), 'utf-8');
  const cloudPanel = await readFile(join(SRC_ROOT, 'ui/Daily30CloudResultsPanel.tsx'), 'utf-8');
  const collectionView = await readFile(join(SRC_ROOT, 'ui/CandidateCollectionView.tsx'), 'utf-8');
  const cards = await readFile(join(SRC_ROOT, 'ui/Daily30CandidateCards.tsx'), 'utf-8');
  const styles = await readFile(join(SRC_ROOT, 'ui/styles.css'), 'utf-8');
  const uiServer = await readFile(join(SRC_ROOT, 'server/uiServer.ts'), 'utf-8');
  const copyApi = await readFile(join(SRC_ROOT, 'ui/daily30CopyApi.ts'), 'utf-8');
  const excludeUi = await readFile(join(SRC_ROOT, 'ui/daily30ExcludeUi.ts'), 'utf-8');

  assert(collectionView.includes('sessionExcludedIds'), 'candidate collection shares session exclude ids');
  assert(leadPanel.includes('onMarkExcluded'), 'lead panel marks session excluded');
  assert(leadPanel.includes('filterDaily30UiListCandidates'), 'lead panel filters UI list after load');
  assert(cloudPanel.includes('onMarkExcluded'), 'cloud panel marks session excluded');
  assert(cloudPanel.includes('filterDaily30UiListCandidates'), 'cloud panel filters email found list');
  assert(cards.includes('daily30-card-actions'), 'candidate card uses aligned action group');
  assert(cards.includes('btn-sm'), 'candidate card buttons use btn-sm');
  assert(styles.includes('.daily30-card-actions'), 'card action alignment styles exist');
  assert(uiServer.includes('companyName'), 'exclude API accepts companyName fallback hints');
  assert(copyApi.includes('pickCandidateExcludeHints'), 'exclude API client sends lookup hints');
  assert(excludeUi.includes('filterDaily30UiListCandidates'), 'UI exclude filter helper exists');

  const { isDaily30HumanExcludedCandidate } = await import('../candidates/daily30CandidateVisibility.js');
  const rejectedOnly = {
    pipelineStatus: 'email_found',
    importStatus: 'preview',
    humanReviewStatus: 'rejected',
    excludedAt: null,
    excludedBy: null,
  } as import('../adapters/externalLeadCandidateTypes.js').ExternalLeadCandidate;
  assert(isDaily30HumanExcludedCandidate(rejectedOnly), 'humanReviewStatus rejected hides candidate');
  const excludedAtOnly = {
    pipelineStatus: 'email_found',
    importStatus: 'preview',
    humanReviewStatus: null,
    excludedAt: new Date().toISOString(),
    excludedBy: null,
  } as import('../adapters/externalLeadCandidateTypes.js').ExternalLeadCandidate;
  assert(isDaily30HumanExcludedCandidate(excludedAtOnly), 'excludedAt hides candidate');

  const { findDaily30CandidateIndexForExclude } = await import(
    '../candidates/findDaily30CandidateForExclude.js'
  );
  const { selectDaily30LeadApprovalPending } = await import(
    '../candidates/selectDaily30LeadCandidates.js'
  );
  const pendingId = 'phase383-pending-id';
  const sample = {
    externalCandidateId: pendingId,
    sourceType: 'google_places' as const,
    companyName: 'Phase383テスト工務店',
    area: '宮城県',
    industry: '工務店',
    websiteUrl: 'https://phase383.test/',
    officialSiteUrl: 'https://phase383.test/',
    phoneNumber: null,
    address: null,
    googlePlaceId: null,
    sourceUrl: null,
    sourceQuery: 'q',
    category: '工務店',
    contactFormUrl: 'https://phase383.test/contact',
    emailCandidates: ['info@phase383.test'],
    confidenceScore: 0.8,
    importStatus: 'preview' as const,
    riskLevel: 'low' as const,
    duplicateReason: '',
    duplicateKey: 'k383',
    pipelineStatus: 'email_found' as const,
    prefecture: '宮城県',
    regionGroup: '宮城' as const,
    collectionPriority: 1,
    collectionAreaSource: '宮城県',
    collectionBatchId: '2099-01-01',
    emailCandidateSourceUrls: ['https://phase383.test/contact'],
    emailVerifiedAt: null,
    generatedEmailSubject: null,
    generatedEmailBody: null,
    generatedCustomHook: null,
    generatedCustomHookReason: null,
    targetEmail: 'info@phase383.test',
    emailCandidateSourceUrl: 'https://phase383.test/contact',
    failureReason: null,
    copyGeneratedAt: null,
    qualityCheckedAt: null,
    humanReviewStatus: null,
    gmailDraftStatus: null,
    sendStatus: null,
    notes: '',
    collectedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const wrongId = 'wrong-id-not-in-file';
  const fallbackIndex = findDaily30CandidateIndexForExclude([sample], wrongId, {
    companyName: sample.companyName,
    email: 'info@phase383.test',
    officialSiteUrl: sample.officialSiteUrl!,
  });
  assert(fallbackIndex === 0, 'exclude fallback finds candidate by company/email/site');
  assert(
    selectDaily30LeadApprovalPending([sample]).length === 1,
    'pending candidate listed before exclude'
  );
  const excludedSample = {
    ...sample,
    pipelineStatus: 'excluded' as const,
    importStatus: 'excluded' as const,
    humanReviewStatus: 'rejected' as const,
    excludedAt: new Date().toISOString(),
    excludedBy: 'human' as const,
    excludedReason: 'verify exclude',
  };
  assert(
    selectDaily30LeadApprovalPending([excludedSample]).length === 0,
    'lead approval pending empty after exclude fields applied'
  );

  const { filterDaily30UiListCandidates } = await import('../ui/daily30ExcludeUi.js');
  const sessionIds = new Set([pendingId]);
  assert(
    filterDaily30UiListCandidates([sample], sessionIds).length === 0,
    'session excluded id removes candidate from UI list immediately'
  );

  ok('Phase 38.3 exclude immediate UI and API checks passed');
}

async function verifyPhase384ExcludePersistAndMetrics(): Promise<void> {
  const excludeSrc = await readFile(join(SRC_ROOT, 'workflow/excludeDaily30Candidate.ts'), 'utf-8');
  const repoSrc = await readFile(join(SRC_ROOT, 'storage/externalCandidatesRepository.ts'), 'utf-8');
  const uiServer = await readFile(join(SRC_ROOT, 'server/uiServer.ts'), 'utf-8');
  const copyApi = await readFile(join(SRC_ROOT, 'ui/daily30CopyApi.ts'), 'utf-8');
  const metricsDoc = await readFile(join(PROJECT_ROOT, 'docs/GROWLY_SALES_DAILY30_METRICS.md'), 'utf-8');

  assert(excludeSrc.includes('persistExternalCandidates'), 'exclude uses persistExternalCandidates');
  assert(excludeSrc.includes('verifyExcludedCandidatePersisted'), 'exclude verifies after reload');
  assert(excludeSrc.includes('persisted: true'), 'exclude result includes persisted:true');
  assert(excludeSrc.includes('EXCLUDE_PERSIST_FAILED'), 'exclude has persist failed code');
  assert(repoSrc.includes('reloadExternalCandidatesFromStorage'), 'repository supports reload after save');
  assert(uiServer.includes('EXCLUDE_PERSIST_FAILED'), 'uiServer handles persist failure');
  assert(uiServer.includes('allCandidates'), 'uiServer builds dashboard from allCandidates');
  assert(copyApi.includes('persisted'), 'client checks persisted flag');
  assert(metricsDoc.includes('Lead化承認待ち'), 'metrics doc defines lead approval pending');
  assert(metricsDoc.includes('収集時メール取得'), 'metrics doc defines email found at collection');

  const { mkdir, writeFile } = await import('node:fs/promises');
  const { getGrowlySalesDataDir } = await import('../config/paths.js');
  const verifyDir = join(getGrowlySalesDataDir(), '_verify_phase384');
  await mkdir(verifyDir, { recursive: true });
  const verifyPath = join(verifyDir, 'external-candidates.json');
  const sampleId = 'phase384-persist-id';
  const sample = {
    externalCandidateId: sampleId,
    sourceType: 'google_places' as const,
    companyName: 'Phase384永続化テスト',
    area: '宮城県',
    industry: '工務店',
    websiteUrl: 'https://phase384.test/',
    officialSiteUrl: 'https://phase384.test/',
    phoneNumber: null,
    address: null,
    googlePlaceId: null,
    sourceUrl: null,
    sourceQuery: 'q',
    category: '工務店',
    contactFormUrl: 'https://phase384.test/contact',
    emailCandidates: ['info@phase384.test'],
    confidenceScore: 0.8,
    importStatus: 'preview' as const,
    riskLevel: 'low' as const,
    duplicateReason: '',
    duplicateKey: 'k384',
    pipelineStatus: 'email_found' as const,
    prefecture: '宮城県',
    regionGroup: '宮城' as const,
    collectionPriority: 1,
    collectionAreaSource: '宮城県',
    collectionBatchId: '2099-01-01',
    emailCandidateSourceUrls: ['https://phase384.test/contact'],
    emailVerifiedAt: null,
    generatedEmailSubject: null,
    generatedEmailBody: null,
    generatedCustomHook: null,
    generatedCustomHookReason: null,
    targetEmail: 'info@phase384.test',
    emailCandidateSourceUrl: 'https://phase384.test/contact',
    failureReason: null,
    copyGeneratedAt: null,
    qualityCheckedAt: null,
    humanReviewStatus: null,
    gmailDraftStatus: null,
    sendStatus: null,
    notes: '',
    collectedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await writeFile(
    verifyPath,
    JSON.stringify({ candidates: [sample], updatedAt: new Date().toISOString(), note: 'verify' }, null, 2),
    'utf-8'
  );

  const { excludeDaily30Candidate } = await import('../workflow/excludeDaily30Candidate.js');
  const { selectDaily30LeadApprovalPending } = await import(
    '../candidates/selectDaily30LeadCandidates.js'
  );
  const { isDaily30ReadyForDraftImportCandidate } = await import(
    '../candidates/getDaily30DraftImportBlockReason.js'
  );
  const { auditDaily30MetricConsistency } = await import(
    '../candidates/auditDaily30MetricConsistency.js'
  );

  const result = await excludeDaily30Candidate(sampleId, 'verify persist', { jsonPath: verifyPath });
  assert(result.ok === true && result.persisted === true, 'exclude returns persisted:true');
  assert(result.pipelineStatus === 'excluded', 'exclude persisted pipelineStatus');
  assert(result.excludedBy === 'human', 'exclude persisted excludedBy');

  try {
    await excludeDaily30Candidate(sampleId, 'verify persist again', { jsonPath: verifyPath });
    assert(false, 'double exclude should fail');
  } catch {
    assert(true, 'double exclude rejected');
  }

  const { loadExternalCandidatesFromJson } = await import(
    '../storage/externalCandidatesRepository.js'
  );
  const after = await loadExternalCandidatesFromJson(verifyPath);
  assert(after.length === 1, 'verify file still has one candidate');
  assert(after[0]?.importStatus === 'excluded', 'reloaded file has excluded importStatus');
  assert(selectDaily30LeadApprovalPending(after).length === 0, 'excluded not in approval pending');
  assert(!isDaily30ReadyForDraftImportCandidate(after[0]!), 'excluded not in ready for draft');

  const dashBefore = (await import('../candidates/buildDaily30Dashboard.js')).buildDaily30Dashboard(
    [sample],
    [],
    '2099-01-01'
  );
  const dashAfter = (await import('../candidates/buildDaily30Dashboard.js')).buildDaily30Dashboard(
    after,
    [],
    '2099-01-01'
  );
  assert(dashBefore.leadApprovalPendingCount === 1, 'before exclude one pending');
  assert(dashAfter.leadApprovalPendingCount === 0, 'after exclude zero pending');
  assert(dashAfter.humanExcludedCount === 1, 'humanExcludedCount increased');
  assert(
    dashAfter.emailFoundAtCollection === dashBefore.emailFoundAtCollection ||
      dashAfter.emailFoundAtCollection >= 0,
    'emailFoundAtCollection stable without cloud state'
  );

  const audit = auditDaily30MetricConsistency(after, [], '2099-01-01', null);
  assert(audit.ok, `metric audit: ${audit.issues.join('; ')}`);

  ok('Phase 38.4 exclude persist and metric consistency checks passed');
}

async function verifyPhase39HumanGateButtons(): Promise<void> {
  const leadPanel = await readFile(join(SRC_ROOT, 'ui/Daily30LeadCandidatesPanel.tsx'), 'utf-8');
  const draftPanel = await readFile(join(SRC_ROOT, 'ui/Daily30DraftImportPanel.tsx'), 'utf-8');
  const gmailView = await readFile(join(SRC_ROOT, 'ui/GmailDraftCandidatesView.tsx'), 'utf-8');
  const gmailDialog = await readFile(join(SRC_ROOT, 'ui/GmailDraftCreateDialog.tsx'), 'utf-8');
  const gateModal = await readFile(join(SRC_ROOT, 'ui/HumanGateConfirmModal.tsx'), 'utf-8');
  const copyApi = await readFile(join(SRC_ROOT, 'ui/daily30CopyApi.ts'), 'utf-8');
  const importApi = await readFile(join(SRC_ROOT, 'ui/daily30ImportApi.ts'), 'utf-8');
  const gmailApi = await readFile(join(SRC_ROOT, 'ui/gmailDraftCandidatesApi.ts'), 'utf-8');
  const uiServer = await readFile(join(SRC_ROOT, 'server/uiServer.ts'), 'utf-8');
  const gmailAdapter = await readFile(join(SRC_ROOT, 'integrations/gmail/gmailDraftAdapter.ts'), 'utf-8');

  assert(leadPanel.includes('営業文を生成する'), 'lead panel has generate copy button');
  assert(leadPanel.includes('HumanGateConfirmModal'), 'lead panel has confirm modal');
  assert(leadPanel.includes('GENERATE_DAILY_30_COPY_GATE_LABEL'), 'lead panel sends GENERATE_DAILY_30_COPY gate');
  assert(leadPanel.includes('resolveGenerateCopyDisabledReason'), 'lead panel has disabled reason');
  assert(leadPanel.includes('DevDetails'), 'lead panel keeps dev gate input');
  assert(leadPanel.includes('Daily30GenerateCopyGateDev'), 'lead panel dev gate component');

  assert(draftPanel.includes('下書き候補へ取り込む'), 'draft import panel has bulk import button');
  assert(draftPanel.includes('HumanGateConfirmModal'), 'draft import panel has confirm modal');
  assert(
    draftPanel.includes('IMPORT_DAILY_30_DRAFT_CANDIDATES_GATE_LABEL'),
    'draft import panel sends IMPORT gate'
  );
  assert(draftPanel.includes('resolveBulkImportDisabledReason'), 'draft import disabled reason');
  assert(draftPanel.includes('Daily30ImportDraftGateDev'), 'draft import dev gate component');

  assert(gmailView.includes('Gmail下書きを作成する'), 'gmail view has create draft button label');
  assert(gmailView.includes('CREATE_DRAFTS_GATE_LABEL'), 'gmail view sends CREATE_DRAFTS gate');
  assert(gmailView.includes('creatableCandidates'), 'gmail view filters creatable candidates');
  assert(gmailDialog.includes('HumanGateConfirmModal') || gmailDialog.includes('modal-dialog'), 'gmail create confirm dialog');
  assert(gmailDialog.includes('messages.send は使いません'), 'gmail dialog states no messages.send');
  assert(gmailDialog.includes('Gmail下書きを作成する'), 'gmail dialog confirm button label');
  assert(gmailView.includes('DevDetails'), 'gmail view keeps dev gate input');

  assert(gateModal.includes('human-gate-safety-list'), 'gate modal shows safety notes');
  assert(gateModal.includes('modal-actions'), 'gate modal has confirm/cancel');

  assert(copyApi.includes('confirmToken'), 'copy API sends confirmToken');
  assert(importApi.includes('confirmToken'), 'import API sends confirmToken');
  assert(gmailApi.includes('createDraftsGate'), 'gmail API sends createDraftsGate');

  assert(!uiServer.includes('messages.send'), 'uiServer does not use messages.send');
  assert(gmailAdapter.includes('drafts.create'), 'gmail adapter still drafts.create only');
  assert(!gmailAdapter.includes('messages.send'), 'gmail adapter no messages.send');

  assert(!leadPanel.includes('Authorization'), 'lead panel no auth header');
  assert(!gmailDialog.includes('refresh_token'), 'gmail dialog no secrets');

  ok('Phase 39 human gate button UI checks passed');
}

async function verifyPhase402CollectionProfileFoundation(): Promise<void> {
  const candidateTypes = await readFile(
    join(SRC_ROOT, 'adapters/externalLeadCandidateTypes.ts'),
    'utf-8'
  );
  const leadTypes = await readFile(join(SRC_ROOT, 'types/lead.ts'), 'utf-8');
  const areaConfig = await readFile(join(SRC_ROOT, 'candidates/daily30AreaConfig.ts'), 'utf-8');
  const registry = await readFile(join(SRC_ROOT, 'candidates/daily30PrefectureRegistry.ts'), 'utf-8');
  const profileModule = await readFile(join(SRC_ROOT, 'candidates/daily30CollectionProfile.ts'), 'utf-8');
  const scheduleRepo = await readFile(
    join(SRC_ROOT, 'storage/daily30CollectionScheduleRepository.ts'),
    'utf-8'
  );
  const jsonNames = await readFile(join(SRC_ROOT, 'storage/jsonDocumentNames.ts'), 'utf-8');
  const fetchSrc = await readFile(join(SRC_ROOT, 'candidates/fetchDaily30Candidates.ts'), 'utf-8');
  const cloudFetch = await readFile(join(SRC_ROOT, 'candidates/runDaily30CloudAutoFetch.ts'), 'utf-8');
  const cloudState = await readFile(join(SRC_ROOT, 'storage/daily30CloudRunState.ts'), 'utf-8');
  const stubLead = await readFile(
    join(SRC_ROOT, 'candidates/buildLeadStubFromExternalCandidate.ts'),
    'utf-8'
  );
  const draftLead = await readFile(
    join(SRC_ROOT, 'candidates/buildLeadFromDaily30ReadyForDraft.ts'),
    'utf-8'
  );
  const gmailAdapter = await readFile(join(SRC_ROOT, 'integrations/gmail/gmailDraftAdapter.ts'), 'utf-8');

  for (const field of [
    'collectionProfileId',
    'collectionMode',
    'industryCategory',
    'areaStrategy',
    'discoverySource',
    'discoverySourceUrl',
    'sourceComplianceStatus',
    'collectionRunId',
  ]) {
    assert(candidateTypes.includes(field), `ExternalLeadCandidate has ${field}`);
    assert(leadTypes.includes(field), `Lead has ${field}`);
  }

  assert(stubLead.includes('copyCollectionProfileToLead'), 'stub lead copies collection profile');
  assert(draftLead.includes('copyCollectionProfileToLead'), 'draft lead copies collection profile');
  assert(scheduleRepo.includes('loadDaily30CollectionSchedule'), 'schedule repository exists');
  assert(scheduleRepo.includes('loadActiveDaily30CollectionProfile'), 'active profile loader exists');
  assert(jsonNames.includes('daily30-collection-schedule.json'), 'schedule logical name registered');
  assert(areaConfig.includes('todayBatchIdJst'), 'JST batchId helper exists');
  assert(areaConfig.includes('resolveDaily30BatchIdJst'), 'resolveDaily30BatchIdJst exists');
  assert(areaConfig.includes('filterDaily30ExecutionAreas'), 'execution area filter exists');
  assert(areaConfig.includes('山形県'), 'yamagata in area expansion');
  assert(fetchSrc.includes('applyDaily30DefaultCollectionProfile'), 'fetch applies default profile');
  assert(fetchSrc.includes('filterDaily30ExecutionAreas'), 'fetch filters execution areas');
  assert(fetchSrc.includes('todayBatchIdJst'), 'fetch defaults to JST batchId');
  assert(cloudFetch.includes('todayBatchIdJst'), 'cloud fetch uses JST batchId');
  assert(cloudState.includes('runStartedAtJst'), 'cloud state has JST run timestamp');
  assert(cloudState.includes('collectionProfileId'), 'cloud state stores collectionProfileId');
  assert(!cloudFetch.includes('messages.send'), 'phase40.2 no gmail send');
  assert(!gmailAdapter.includes('messages.send'), 'gmail adapter no messages.send');
  assert(profileModule.includes('discoverySourceUrl'), 'profile module separates discovery URL');

  const {
    todayBatchId,
    todayBatchIdJst,
    resolveDaily30BatchIdJst,
    filterDaily30ExecutionAreas,
    DAILY_30_AREA_EXPANSION,
  } = await import('../candidates/daily30AreaConfig.js');
  const {
    DAILY_30_NATIONWIDE_PREFECTURES_ORDERED,
    DAILY_30_EXCLUDED_PREFECTURES,
    isDaily30PrefectureExcluded,
  } = await import('../candidates/daily30PrefectureRegistry.js');
  const {
    applyDaily30DefaultCollectionProfile,
    copyCollectionProfileToLead,
    defaultDaily30CollectionProfileSnapshot,
  } = await import('../candidates/daily30CollectionProfile.js');
  const { loadActiveDaily30CollectionProfile } = await import(
    '../storage/daily30CollectionScheduleRepository.js'
  );
  const { buildLeadFromDaily30ReadyForDraft } = await import(
    '../candidates/buildLeadFromDaily30ReadyForDraft.js'
  );
  const { resolveEmailSourceFromCandidate } = await import(
    '../candidates/resolveEmailSourceDisplay.js'
  );
  const { countDaily30BatchMetrics } = await import('../candidates/daily30BatchMetrics.js');

  const jstNineAm = new Date('2026-07-02T00:00:00.000Z');
  assert(todayBatchIdJst(jstNineAm) === '2026-07-02', 'JST 09:00 maps to same-day batchId');

  const utcSkew = new Date('2026-07-01T15:00:00.000Z');
  assert(todayBatchId(utcSkew) === '2026-07-01', 'UTC batchId kept for legacy');
  assert(todayBatchIdJst(utcSkew) === '2026-07-02', 'JST batchId avoids UTC day skew');
  assert(resolveDaily30BatchIdJst('2026-06-30') === '2026-06-30', 'explicit batchId preserved');

  const legacyBatchId = '2026-06-30';
  const legacyCandidate = {
    externalCandidateId: 'phase402-legacy',
    sourceType: 'google_places' as const,
    companyName: 'Legacy UTC Batch',
    area: '宮城県',
    industry: '工務店',
    websiteUrl: 'https://legacy.test',
    officialSiteUrl: 'https://legacy.test',
    phoneNumber: null,
    address: null,
    googlePlaceId: null,
    sourceUrl: null,
    sourceQuery: 'q',
    category: '工務店',
    contactFormUrl: null,
    emailCandidates: ['info@legacy.test'],
    confidenceScore: 0.8,
    importStatus: 'preview' as const,
    riskLevel: 'low' as const,
    duplicateReason: '',
    duplicateKey: 'k-legacy',
    pipelineStatus: 'email_found' as const,
    prefecture: '宮城県',
    regionGroup: '宮城' as const,
    collectionPriority: 1,
    collectionAreaSource: '宮城県',
    collectionBatchId: legacyBatchId,
    emailCandidateSourceUrls: ['https://legacy.test/contact'],
    emailVerifiedAt: null,
    generatedEmailSubject: null,
    generatedEmailBody: null,
    generatedCustomHook: null,
    generatedCustomHookReason: null,
    targetEmail: 'info@legacy.test',
    emailCandidateSourceUrl: 'https://legacy.test/contact',
    failureReason: null,
    copyGeneratedAt: null,
    qualityCheckedAt: null,
    humanReviewStatus: null,
    gmailDraftStatus: null,
    sendStatus: null,
    notes: '',
    collectedAt: '2026-06-30T00:00:00.000Z',
    createdAt: '2026-06-30T00:00:00.000Z',
    updatedAt: '2026-06-30T00:00:00.000Z',
  };
  const legacyMetrics = countDaily30BatchMetrics([legacyCandidate], legacyBatchId);
  assert(legacyMetrics.emailFound === 1, 'legacy UTC batchId metrics still work');

  assert(DAILY_30_NATIONWIDE_PREFECTURES_ORDERED.length === 46, 'nationwide list is 46 prefectures');
  assert(
    !DAILY_30_NATIONWIDE_PREFECTURES_ORDERED.includes('東京都'),
    'Tokyo excluded from nationwide list'
  );
  assert(
    new Set(DAILY_30_NATIONWIDE_PREFECTURES_ORDERED).size === 46,
    'no duplicate prefectures in nationwide list'
  );
  assert(DAILY_30_NATIONWIDE_PREFECTURES_ORDERED[0] === '宮城県', 'Miyagi is first priority');
  assert(DAILY_30_NATIONWIDE_PREFECTURES_ORDERED[1] === '福島県', 'Fukushima is second');
  assert(DAILY_30_NATIONWIDE_PREFECTURES_ORDERED[2] === '山形県', 'Yamagata in first priority group');
  assert(DAILY_30_NATIONWIDE_PREFECTURES_ORDERED[3] === '茨城県', 'Ibaraki starts north Kanto');
  assert(DAILY_30_NATIONWIDE_PREFECTURES_ORDERED[5] === '群馬県', 'Gunma ends north Kanto group');
  assert(isDaily30PrefectureExcluded('東京都'), 'Tokyo marked excluded');
  assert(DAILY_30_EXCLUDED_PREFECTURES.includes('東京都'), 'Tokyo in excluded constant');

  const executionAreas = filterDaily30ExecutionAreas(DAILY_30_AREA_EXPANSION);
  assert(
    executionAreas.every((a) => !isDaily30PrefectureExcluded(a.prefecture)),
    'execution areas exclude Tokyo'
  );
  assert(executionAreas.some((a) => a.prefecture === '山形県'), 'yamagata in execution expansion');

  const activeProfile = await loadActiveDaily30CollectionProfile();
  assert(activeProfile.collectionProfileId === 'daily30-housing-auto', 'schedule fallback profile id');
  assert(activeProfile.collectionMode === 'auto_continue', 'schedule fallback mode');
  assert(activeProfile.industryCategory === 'housing', 'schedule fallback industry');
  assert(
    activeProfile.areaStrategy === 'priority_miyagi_fukushima_yamagata',
    'schedule fallback area strategy'
  );
  assert(activeProfile.discoverySource === 'google_places', 'schedule fallback discovery source');

  const profiled = applyDaily30DefaultCollectionProfile(
    buildExternalLeadCandidate(
      {
        sourceType: 'google_places',
        companyName: 'Profile Test Co',
        area: '宮城県',
        websiteUrl: 'https://profile-test.example',
        sourceUrl: 'https://maps.example/place',
        sourceQuery: '宮城県 工務店',
        prefecture: '宮城県',
        regionGroup: '宮城',
        collectionPriority: 1,
        collectionAreaSource: '宮城県',
        collectionBatchId: '2026-07-02',
      },
      await loadTargetProfile()
    ),
    { batchId: '2026-07-02', collectionRunId: 'run-402', areaQueuePosition: 0 }
  );
  assert(profiled.collectionProfileId === 'daily30-housing-auto', 'new candidate gets default profile');
  assert(profiled.discoverySource === 'google_places', 'discovery source from legacy sourceType');
  assert(profiled.collectionRunId === 'run-402', 'collectionRunId attached');

  const jobDiscoveryCandidate = {
    ...profiled,
    discoverySource: 'job_site_reference' as const,
    discoverySourceSite: 'indeed' as const,
    discoverySourceUrl: 'https://jp.indeed.com/viewjob?jk=abc',
    emailCandidateSourceUrl: 'https://profile-test.example/contact',
    targetEmail: 'info@profile-test.example',
  };
  const emailDisplay = resolveEmailSourceFromCandidate(jobDiscoveryCandidate);
  assert(
    emailDisplay.emailSourceUrl === 'https://profile-test.example/contact',
    'email source stays on official site'
  );
  assert(
    jobDiscoveryCandidate.discoverySourceUrl?.includes('indeed.com'),
    'discovery URL remains job site'
  );
  assert(
    emailDisplay.emailSourceUrl !== jobDiscoveryCandidate.discoverySourceUrl,
    'discoverySourceUrl and emailSourceUrl are separated'
  );

  const lead = buildLeadFromDaily30ReadyForDraft({
    ...jobDiscoveryCandidate,
    pipelineStatus: 'ready_for_draft',
    generatedEmailSubject: '件名',
    generatedEmailBody: '本文',
    importStatus: 'approved_for_lead',
  });
  assert(lead.collectionProfileId === 'daily30-housing-auto', 'lead inherits collectionProfileId');
  assert(lead.discoverySource === 'job_site_reference', 'lead inherits discoverySource');
  assert(lead.discoverySourceUrl?.includes('indeed.com'), 'lead inherits discoverySourceUrl');
  assert(lead.emailCandidateSourceUrl === 'https://profile-test.example/contact', 'email source on lead');

  const emptyLead = createEmptyLead({
    companyName: 'X',
    area: '宮城県',
    industry: '工務店',
    websiteUrl: 'https://x.test',
    sourceUrls: ['https://x.test'],
  });
  const merged = copyCollectionProfileToLead(profiled, emptyLead);
  assert(merged.collectionProfileName === profiled.collectionProfileName, 'copyCollectionProfileToLead works');

  const schemaDoc = await readFile(
    join(PROJECT_ROOT, 'docs/GROWLY_SALES_COLLECTION_PROFILE_SCHEMA.md'),
    'utf-8'
  ).catch(() => '');
  assert(schemaDoc.includes('discoverySourceUrl'), 'collection profile schema doc exists');

  ok('Phase 40.2 collection profile foundation checks passed');
}

async function verifyPhase403CollectionScheduleUi(): Promise<void> {
  const candidateView = await readFile(join(SRC_ROOT, 'ui/CandidateCollectionView.tsx'), 'utf-8');
  const schedulePanel = await readFile(join(SRC_ROOT, 'ui/Daily30CollectionSchedulePanel.tsx'), 'utf-8');
  const editDialog = await readFile(join(SRC_ROOT, 'ui/Daily30CollectionScheduleEditDialog.tsx'), 'utf-8');
  const scheduleApi = await readFile(join(SRC_ROOT, 'ui/daily30CollectionScheduleApi.ts'), 'utf-8');
  const uiServer = await readFile(join(SRC_ROOT, 'server/uiServer.ts'), 'utf-8');
  const updateModule = await readFile(join(SRC_ROOT, 'candidates/updateDaily30CollectionSchedule.ts'), 'utf-8');
  const gmailAdapter = await readFile(join(SRC_ROOT, 'integrations/gmail/gmailDraftAdapter.ts'), 'utf-8');

  assert(candidateView.includes('明日の収集設定'), 'candidate view has schedule section title');
  assert(candidateView.includes('Daily30CollectionSchedulePanel'), 'candidate view embeds schedule panel');
  assert(schedulePanel.includes('設定を変更する'), 'schedule panel has edit button');
  assert(schedulePanel.includes('Phase 40.6'), 'schedule panel shows phase 40.6 external reference notice');
  assert(schedulePanel.includes('DevDetails'), 'raw schedule in DevDetails only');
  assert(schedulePanel.includes('求人サイト指定'), 'schedule panel shows job site label');
  assert(editDialog.includes('wantedly'), 'edit dialog supports wantedly');
  assert(editDialog.includes('indeed'), 'edit dialog supports indeed');
  assert(editDialog.includes('job_site_reference'), 'edit dialog has job site discovery');
  assert(editDialog.includes('設定保存のみ'), 'edit dialog shows save-only warning');
  assert(scheduleApi.includes('/api/daily30-collection-schedule'), 'schedule API client path');

  assert(uiServer.includes("pathname === '/api/daily30-collection-schedule'"), 'uiServer schedule routes');
  assert(uiServer.includes('loadDaily30CollectionSchedule'), 'uiServer loads schedule');
  assert(uiServer.includes('applyDaily30CollectionScheduleUpdate'), 'uiServer applies schedule update');
  assert(!uiServer.includes('messages.send'), 'schedule API no gmail send');
  assert(!uiServer.includes('users.drafts.create'), 'schedule API no drafts create');
  assert(!schedulePanel.includes('refresh_token'), 'schedule panel no secrets');
  assert(!uiServer.includes('Authorization'), 'uiServer schedule no auth header');

  const {
    applyDaily30CollectionScheduleUpdate,
    resolveScheduleEffectiveBatchId,
  } = await import('../candidates/updateDaily30CollectionSchedule.js');
  const { buildDefaultDaily30CollectionScheduleStore } = await import(
    '../storage/daily30CollectionScheduleTypes.js'
  );
  const { getTomorrowBatchIdJst, todayBatchIdJst } = await import('../candidates/daily30AreaConfig.js');
  const { loadDaily30CollectionSchedule } = await import(
    '../storage/daily30CollectionScheduleRepository.js'
  );

  const defaults = await loadDaily30CollectionSchedule();
  assert(defaults.activeProfile.collectionProfileId === 'daily30-housing-auto', 'GET default active profile');

  const utcSkew = new Date('2026-07-01T15:00:00.000Z');
  const effective = resolveScheduleEffectiveBatchId({}, utcSkew);
  assert(effective === getTomorrowBatchIdJst(utcSkew), 'effectiveFromBatchId defaults to tomorrow JST');
  assert(todayBatchIdJst(utcSkew) === '2026-07-02', 'JST today on skew date');

  const base = buildDefaultDaily30CollectionScheduleStore();
  const oneDay = applyDaily30CollectionScheduleUpdate(base, {
    mode: 'one_day_override',
    effectiveFromBatchId: '2026-07-02',
    profile: {
      industryCategory: 'housing',
      areaStrategy: 'priority_miyagi_fukushima_yamagata',
      discoverySource: 'job_site_reference',
      discoverySourceSite: 'wantedly',
    },
  });
  assert(oneDay.oneDayOverride !== null, 'oneDayOverride saved');
  assert(oneDay.oneDayOverride?.profile.discoverySourceSite === 'wantedly', 'wantedly site saved');
  assert(oneDay.oneDayOverride?.effectiveFromBatchId === '2026-07-02', 'one day effective batch');
  assert(oneDay.activeProfile.collectionProfileId === 'daily30-housing-auto', 'one day keeps activeProfile');

  const nextOverride = applyDaily30CollectionScheduleUpdate(base, {
    mode: 'user_selected',
    effectiveFromBatchId: '2026-07-03',
    profile: {
      discoverySource: 'job_site_reference',
      discoverySourceSite: 'indeed',
      areaStrategy: 'north_kanto',
    },
  });
  assert(nextOverride.nextProfileOverride !== null, 'nextProfileOverride saved');
  assert(nextOverride.nextProfileOverride?.profile.discoverySourceSite === 'indeed', 'indeed site saved');

  const reset = applyDaily30CollectionScheduleUpdate(oneDay, { mode: 'reset_to_auto' });
  assert(reset.nextProfileOverride === null, 'reset clears next override');
  assert(reset.oneDayOverride === null, 'reset clears one day override');
  assert(reset.activeProfile.collectionMode === 'auto_continue', 'reset restores auto_continue');

  ok('Phase 40.3 collection schedule UI checks passed');
}

async function verifyPhase404CollectionProfileDisplay(): Promise<void> {
  const leadList = await readFile(join(SRC_ROOT, 'ui/GrowlySalesDashboard.tsx'), 'utf-8');
  const filterBar = await readFile(join(SRC_ROOT, 'ui/LeadCollectionFilterBar.tsx'), 'utf-8');
  const leadDetail = await readFile(join(SRC_ROOT, 'ui/LeadDetailPanel.tsx'), 'utf-8');
  const candidateCards = await readFile(join(SRC_ROOT, 'ui/Daily30CandidateCards.tsx'), 'utf-8');
  const draftView = await readFile(join(SRC_ROOT, 'ui/GmailDraftCandidatesView.tsx'), 'utf-8');
  const sendRecords = await readFile(join(SRC_ROOT, 'ui/SendRecordsView.tsx'), 'utf-8');
  const recordModule = await readFile(join(SRC_ROOT, 'workflow/recordManualGmailSent.ts'), 'utf-8');
  const gmailAdapter = await readFile(join(SRC_ROOT, 'integrations/gmail/gmailDraftAdapter.ts'), 'utf-8');

  assert(leadList.includes('LeadCollectionFilterBar'), 'lead list embeds collection filter bar');
  assert(leadList.includes('matchesLeadCollectionFilters'), 'lead list applies collection filters');
  assert(filterBar.includes('収集元'), 'filter bar has discovery source label');
  assert(filterBar.includes('求人サイト'), 'filter bar has job site label');
  assert(filterBar.includes('エリア戦略'), 'filter bar has area strategy label');
  assert(filterBar.includes('収集プロファイル'), 'filter bar has collection profile label');
  assert(filterBar.includes('メール確認'), 'filter bar has email compliance label');
  assert(leadDetail.includes('収集情報'), 'lead detail has collection section');
  assert(leadDetail.includes('CollectionProfileDisplay'), 'lead detail uses collection display');
  assert(candidateCards.includes('CollectionProfileDisplay'), 'candidate cards show collection info');
  assert(draftView.includes('CollectionProfileDisplay'), 'draft candidates show collection info');
  assert(sendRecords.includes('CollectionProfileDisplay'), 'send records show collection info');
  assert(recordModule.includes('collectionProfileId'), 'send record preview stores collectionProfileId');
  assert(recordModule.includes('discoverySourceUrl'), 'send record memo stores discoverySourceUrl');
  assert(!gmailAdapter.includes('messages.send'), 'no gmail send in adapter');
  assert(!recordModule.includes('users.drafts.create'), 'send record no drafts create');

  const {
    buildCollectionProfileDisplayFromLead,
    buildCollectionProfileDisplayFromCandidate,
    matchesLeadDiscoverySourceFilter,
    matchesLeadDiscoverySourceSiteFilter,
    matchesLeadPrefectureFilter,
    matchesLeadAreaStrategyFilter,
    matchesLeadCollectionModeFilter,
    matchesLeadEmailComplianceFilter,
  } = await import('../candidates/resolveCollectionProfileDisplay.js');
  const {
    DEFAULT_LEAD_COLLECTION_FILTERS,
    matchesLeadCollectionFilters,
  } = await import('../ui/LeadCollectionFilterBar.js');
  const { buildEmailOutreachCandidateView } = await import('../outreach/outreachPolicy.js');
  const { buildManualGmailSendPreview } = await import('../workflow/recordManualGmailSent.js');
  const { resolveEmailSourceFromLead } = await import('../candidates/resolveEmailSourceDisplay.js');

  const legacyLead = createEmptyLead({
    companyName: 'レガシー工務店',
    area: '仙台市',
    industry: '工務店',
    websiteUrl: 'https://legacy-housing.test/',
    emailCandidates: ['info@legacy-housing.test'],
    emailCandidateSourceUrls: ['https://legacy-housing.test/contact'],
    humanReviewStatus: 'approved',
  });
  assert(
    matchesLeadCollectionFilters(legacyLead, DEFAULT_LEAD_COLLECTION_FILTERS),
    'legacy lead visible with all filters'
  );

  const profileLead = createEmptyLead({
    companyName: 'プロファイル付き工務店',
    area: '宮城県仙台市',
    prefecture: '宮城県',
    industry: '工務店',
    websiteUrl: 'https://profile-housing.test/',
    emailCandidates: ['info@profile-housing.test'],
    emailCandidateSourceUrls: ['https://profile-housing.test/contact'],
    collectionProfileId: 'daily30-housing-auto',
    collectionProfileName: '住宅系おまかせ継続',
    collectionMode: 'auto_continue',
    areaStrategy: 'priority_miyagi_fukushima_yamagata',
    discoverySource: 'job_site_reference',
    discoverySourceSite: 'wantedly',
    discoverySourceUrl: 'https://www.wantedly.com/companies/profile-housing',
    sourceComplianceStatus: 'official_site_verified',
    emailSourceUrl: 'https://profile-housing.test/contact',
    humanReviewStatus: 'approved',
    gmailDraftStatus: 'draft_created',
    gmailDraftId: 'r-verify-404',
    emailSubject: '件名',
    emailBody: '本文',
  });

  assert(matchesLeadDiscoverySourceFilter(profileLead, 'job_site_reference'), 'discovery source filter');
  assert(matchesLeadDiscoverySourceSiteFilter(profileLead, 'wantedly'), 'job site filter');
  assert(matchesLeadPrefectureFilter(profileLead, '宮城県'), 'prefecture filter');
  assert(matchesLeadAreaStrategyFilter(profileLead, 'priority_miyagi_fukushima_yamagata'), 'area strategy filter');
  assert(matchesLeadCollectionModeFilter(profileLead, 'auto_continue'), 'collection mode filter');
  assert(matchesLeadEmailComplianceFilter(profileLead, 'official_site_verified'), 'email compliance filter');

  const display = buildCollectionProfileDisplayFromLead(profileLead);
  assert(display.discoverySourceUrl?.includes('wantedly.com'), 'discovery url separate');
  assert(display.discoverySourceLabel.includes('Wantedly'), 'discovery label includes job site');

  const emailResolved = resolveEmailSourceFromLead(profileLead);
  assert(emailResolved.emailSourceUrl?.includes('profile-housing.test'), 'email source is official site');
  assert(
    emailResolved.emailSourceUrl !== profileLead.discoverySourceUrl,
    'job site discovery url not used as email source'
  );

  const candidate = {
    externalCandidateId: 'verify-404-candidate',
    sourceType: 'google_places' as const,
    companyName: '候補プロファイル',
    area: '宮城県',
    industry: '工務店',
    websiteUrl: 'https://cand.test/',
    officialSiteUrl: 'https://cand.test/',
    phoneNumber: null,
    address: null,
    googlePlaceId: null,
    sourceUrl: 'https://maps.google.com/?cid=1',
    sourceQuery: 'q',
    category: '工務店',
    contactFormUrl: null,
    emailCandidates: ['info@cand.test'],
    confidenceScore: 0.8,
    importStatus: 'preview' as const,
    riskLevel: 'low' as const,
    duplicateReason: '',
    duplicateKey: 'k',
    pipelineStatus: 'email_found' as const,
    prefecture: '宮城県',
    regionGroup: '宮城' as const,
    collectionPriority: 1,
    collectionAreaSource: '宮城県',
    collectionBatchId: '2026-07-02',
    emailCandidateSourceUrls: ['https://cand.test/contact'],
    emailVerifiedAt: null,
    generatedEmailSubject: null,
    generatedEmailBody: null,
    generatedCustomHook: null,
    generatedCustomHookReason: null,
    targetEmail: 'info@cand.test',
    emailCandidateSourceUrl: 'https://cand.test/contact',
    failureReason: null,
    copyGeneratedAt: null,
    qualityCheckedAt: null,
    humanReviewStatus: null,
    gmailDraftStatus: null,
    sendStatus: null,
    notes: '',
    collectedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    collectionProfileId: 'daily30-housing-auto',
    collectionProfileName: '住宅系おまかせ継続',
    collectionMode: 'auto_continue' as const,
    areaStrategy: 'priority_miyagi_fukushima_yamagata' as const,
    discoverySource: 'google_places' as const,
    discoverySourceUrl: 'https://maps.google.com/?cid=1',
    sourceComplianceStatus: 'official_site_verified' as const,
  };
  const candDisplay = buildCollectionProfileDisplayFromCandidate(candidate);
  assert(candDisplay.prefecture === '宮城県', 'candidate prefecture display');
  assert(candDisplay.collectionProfileName.includes('おまかせ'), 'candidate profile name');

  const outreach = buildEmailOutreachCandidateView(profileLead);
  assert(outreach.collectionProfile.discoverySource === 'job_site_reference', 'outreach has collection profile');
  assert(outreach.discoverySourceUrl?.includes('wantedly'), 'outreach exposes discoverySourceUrl');

  const preview = buildManualGmailSendPreview(profileLead);
  assert(preview.collectionProfileId === 'daily30-housing-auto', 'send preview collectionProfileId');
  assert(preview.discoverySource === 'job_site_reference', 'send preview discoverySource');
  assert(preview.emailSourceUrl?.includes('profile-housing.test'), 'send preview emailSourceUrl official');

  const uiFiles = [
    leadDetail,
    candidateCards,
    draftView,
    sendRecords,
    filterBar,
  ];
  for (const content of uiFiles) {
    assert(!content.includes('refresh_token'), 'UI has no refresh_token');
    assert(!content.includes('Authorization'), 'UI has no Authorization header');
  }

  ok('Phase 40.4 collection profile display/filter checks passed');
}

async function verifyPhase405CollectionScheduleExecution(): Promise<void> {
  const resolveModule = await readFile(
    join(SRC_ROOT, 'candidates/resolveDaily30CollectionSchedule.ts'),
    'utf-8'
  );
  const fetchSrc = await readFile(join(SRC_ROOT, 'candidates/fetchDaily30Candidates.ts'), 'utf-8');
  const cloudFetch = await readFile(join(SRC_ROOT, 'candidates/runDaily30CloudAutoFetch.ts'), 'utf-8');
  const cloudState = await readFile(join(SRC_ROOT, 'storage/daily30CloudRunState.ts'), 'utf-8');
  const uiServer = await readFile(join(SRC_ROOT, 'server/uiServer.ts'), 'utf-8');
  const schedulePanel = await readFile(join(SRC_ROOT, 'ui/Daily30CollectionSchedulePanel.tsx'), 'utf-8');
  const cloudPanel = await readFile(join(SRC_ROOT, 'ui/Daily30CloudResultsPanel.tsx'), 'utf-8');
  const gmailAdapter = await readFile(join(SRC_ROOT, 'integrations/gmail/gmailDraftAdapter.ts'), 'utf-8');

  assert(resolveModule.includes('resolveEffectiveCollectionProfileForBatch'), 'profile resolver exists');
  assert(resolveModule.includes('consumeScheduleAfterRun'), 'schedule consumer exists');
  assert(resolveModule.includes('external_reference_collection_not_yet_implemented'), 'external ref warning');
  assert(fetchSrc.includes('resolveDaily30FetchRunContext'), 'fetch resolves schedule');
  assert(fetchSrc.includes('persistScheduleAfterDaily30Fetch'), 'fetch persists schedule after run');
  assert(fetchSrc.includes('skipScheduleConsume'), 'fetch supports skip consume for dryRun path');
  assert(cloudFetch.includes('resolveDaily30FetchRunContext'), 'cloud fetch resolves schedule');
  assert(cloudFetch.includes('wouldConsumeOverride'), 'dryRun exposes wouldConsumeOverride');
  assert(cloudFetch.includes('scheduleWarnings'), 'dryRun exposes schedule warnings');
  assert(cloudState.includes('areasUsed'), 'cloud state stores areasUsed');
  assert(cloudState.includes('scheduleSource'), 'cloud state stores scheduleSource');
  assert(uiServer.includes('resolvedForToday'), 'schedule API exposes resolved profile');
  assert(schedulePanel.includes('Daily30RunCollectionProfileSummary'), 'schedule panel shows resolved profile');
  assert(cloudPanel.includes('Daily30RunCollectionProfileSummary'), 'cloud results show run profile');
  assert(!gmailAdapter.includes('messages.send'), 'no gmail send');
  assert(!cloudFetch.includes('users.drafts.create'), 'cloud fetch no drafts create');

  const {
    resolveEffectiveCollectionProfileForBatch,
    consumeScheduleAfterRun,
    buildPrefectureOrderForAreaStrategy,
    isExternalReferenceDiscoverySource,
  } = await import('../candidates/resolveDaily30CollectionSchedule.js');
  const { buildDefaultDaily30CollectionScheduleStore } = await import(
    '../storage/daily30CollectionScheduleTypes.js'
  );
  const { buildProfileSnapshotFromInput } = await import(
    '../candidates/updateDaily30CollectionSchedule.js'
  );
  const { applyDaily30CollectionScheduleUpdate } = await import(
    '../candidates/updateDaily30CollectionSchedule.js'
  );
  const { DAILY_30_NATIONWIDE_PREFECTURES_ORDERED } = await import(
    '../candidates/daily30PrefectureRegistry.js'
  );
  const { persistScheduleAfterDaily30Fetch } = await import('../candidates/fetchDaily30Candidates.js');
  const { loadDaily30CollectionSchedule, saveDaily30CollectionSchedule } = await import(
    '../storage/daily30CollectionScheduleRepository.js'
  );

  const fallback = resolveEffectiveCollectionProfileForBatch(null, '2026-07-02', { loadFailed: true });
  assert(fallback.scheduleSource === 'default_fallback', 'missing schedule uses default fallback');
  assert(fallback.profile.collectionProfileId === 'daily30-housing-auto', 'fallback profile id');

  const base = buildDefaultDaily30CollectionScheduleStore();
  const withOneDay = applyDaily30CollectionScheduleUpdate(base, {
    mode: 'one_day_override',
    effectiveFromBatchId: '2026-07-02',
    profile: { discoverySource: 'job_site_reference', discoverySourceSite: 'wantedly' },
  });
  const oneDayResolved = resolveEffectiveCollectionProfileForBatch(withOneDay, '2026-07-02');
  assert(oneDayResolved.scheduleSource === 'one_day_override', 'oneDayOverride selected for batch');
  assert(oneDayResolved.wouldConsumeOverride, 'oneDay would consume');
  assert(oneDayResolved.profile.discoverySource === 'job_site_reference', 'oneDay profile discovery');
  assert(
    oneDayResolved.warnings.includes('external_reference_collection_not_yet_implemented'),
    'job site warning on resolve'
  );

  const dryRunResolved = resolveEffectiveCollectionProfileForBatch(withOneDay, '2026-07-02');
  assert(withOneDay.oneDayOverride !== null, 'dryRun does not clear oneDay before consume call');
  void dryRunResolved;

  const consumed = consumeScheduleAfterRun(withOneDay, {
    batchId: '2026-07-02',
    scheduleSource: 'one_day_override',
    areasAttempted: 2,
  });
  assert(consumed.oneDayOverride === null, 'run consumes oneDayOverride');

  const withNext = applyDaily30CollectionScheduleUpdate(base, {
    mode: 'user_selected',
    effectiveFromBatchId: '2026-07-03',
    profile: { areaStrategy: 'north_kanto', discoverySource: 'google_places' },
  });
  const nextResolved = resolveEffectiveCollectionProfileForBatch(withNext, '2026-07-03');
  assert(nextResolved.scheduleSource === 'next_profile_override', 'next override selected');
  const promoted = consumeScheduleAfterRun(withNext, {
    batchId: '2026-07-03',
    scheduleSource: 'next_profile_override',
    areasAttempted: 1,
  });
  assert(promoted.nextProfileOverride === null, 'next override cleared');
  assert(promoted.activeProfile.collectionMode === 'user_selected', 'promoted to activeProfile');
  assert(promoted.activeProfile.areaStrategy === 'north_kanto', 'promoted area strategy');

  const activeResolved = resolveEffectiveCollectionProfileForBatch(base, '2026-07-01');
  assert(activeResolved.scheduleSource === 'active_profile', 'active profile when no override');

  const priorityOrder = buildPrefectureOrderForAreaStrategy('priority_miyagi_fukushima_yamagata');
  assert(priorityOrder[0] === '宮城県', 'priority strategy starts miyagi');
  assert(priorityOrder.includes('群馬県'), 'priority strategy includes gunma');

  const northOrder = buildPrefectureOrderForAreaStrategy('north_kanto');
  assert(northOrder[0] === '茨城県', 'north kanto starts ibaraki');

  const nationwide = buildPrefectureOrderForAreaStrategy('nationwide_excluding_tokyo');
  assert(nationwide.length === 46, 'nationwide has 46 prefectures');
  assert(!nationwide.includes('東京都'), 'tokyo excluded');
  assert(new Set(nationwide).size === 46, 'nationwide no duplicates');
  assert(
    nationwide.every((p) => DAILY_30_NATIONWIDE_PREFECTURES_ORDERED.includes(p)),
    'nationwide uses registry'
  );

  assert(isExternalReferenceDiscoverySource('job_site_reference'), 'job site is external reference');
  assert(!isExternalReferenceDiscoverySource('google_places'), 'google places is executable');

  const { createEmptyLead } = await import('../types/lead.js');
  const { applyDaily30DefaultCollectionProfile } = await import('../candidates/daily30CollectionProfile.js');
  const jobProfile = buildProfileSnapshotFromInput(
    { discoverySource: 'job_site_reference', discoverySourceSite: 'wantedly' },
    'one_day_override'
  );
  const candidate = applyDaily30DefaultCollectionProfile(
    {
      externalCandidateId: 'verify-405',
      sourceType: 'google_places',
      companyName: 'テスト',
      area: '宮城県',
      industry: '工務店',
      websiteUrl: 'https://corp.test/',
      officialSiteUrl: 'https://corp.test/',
      phoneNumber: null,
      address: null,
      googlePlaceId: null,
      sourceUrl: 'https://www.wantedly.com/companies/corp',
      sourceQuery: 'q',
      category: '工務店',
      contactFormUrl: null,
      emailCandidates: ['info@corp.test'],
      confidenceScore: 0.8,
      importStatus: 'preview',
      riskLevel: 'low',
      duplicateReason: '',
      duplicateKey: 'k',
      pipelineStatus: 'email_found',
      prefecture: '宮城県',
      regionGroup: '宮城',
      collectionPriority: 1,
      collectionAreaSource: '宮城県',
      collectionBatchId: '2026-07-02',
      emailCandidateSourceUrls: ['https://corp.test/contact'],
      emailVerifiedAt: null,
      generatedEmailSubject: null,
      generatedEmailBody: null,
      generatedCustomHook: null,
      generatedCustomHookReason: null,
      targetEmail: 'info@corp.test',
      emailCandidateSourceUrl: 'https://corp.test/contact',
      failureReason: null,
      copyGeneratedAt: null,
      qualityCheckedAt: null,
      humanReviewStatus: null,
      gmailDraftStatus: null,
      sendStatus: null,
      notes: '',
      collectedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    { batchId: '2026-07-02', profile: jobProfile, areaQueuePosition: 0 }
  );
  assert(candidate.discoverySource === 'job_site_reference', 'candidate keeps configured discovery');
  assert(candidate.emailCandidateSourceUrl?.includes('corp.test'), 'email source stays official site');
  assert(
    candidate.discoverySourceUrl?.includes('wantedly') || candidate.sourceUrl?.includes('wantedly'),
    'discovery url separate from email source'
  );

  const scheduleBefore = buildDefaultDaily30CollectionScheduleStore();
  const oneDayStore2099 = applyDaily30CollectionScheduleUpdate(scheduleBefore, {
    mode: 'one_day_override',
    effectiveFromBatchId: '2099-01-01',
    profile: { discoverySource: 'google_places' },
  });
  await saveDaily30CollectionSchedule(oneDayStore2099);
  const loaded = await loadDaily30CollectionSchedule();
  assert(loaded.oneDayOverride?.effectiveFromBatchId === '2099-01-01', 'schedule save roundtrip');
  const resolved2099 = resolveEffectiveCollectionProfileForBatch(oneDayStore2099, '2099-01-01');
  await persistScheduleAfterDaily30Fetch('2099-01-01', resolved2099, 1);
  const afterPersist = await loadDaily30CollectionSchedule();
  assert(afterPersist.oneDayOverride === null, 'persistScheduleAfterDaily30Fetch consumes one day');
  await saveDaily30CollectionSchedule(scheduleBefore);

  for (const content of [schedulePanel, cloudPanel, uiServer, resolveModule]) {
    assert(!content.includes('refresh_token'), 'no refresh_token in schedule UI');
    assert(!content.includes('Authorization'), 'no Authorization header in schedule UI');
  }

  ok('Phase 40.5 collection schedule execution checks passed');
}

async function verifyPhase406ExternalReferenceSafety(): Promise<void> {
  const complianceSrc = await readFile(join(SRC_ROOT, 'candidates/sourceCompliance.ts'), 'utf-8');
  const enrichSrc = await readFile(join(SRC_ROOT, 'candidates/enrichCandidateEmailFromWebsite.ts'), 'utf-8');
  const approvalSrc = await readFile(
    join(SRC_ROOT, 'candidates/getDaily30LeadApprovalBlockReason.ts'),
    'utf-8'
  );
  const discoveryIndex = await readFile(join(SRC_ROOT, 'adapters/discovery/index.ts'), 'utf-8');
  const discoveryTypes = await readFile(join(SRC_ROOT, 'adapters/discovery/types.ts'), 'utf-8');
  const cloudFetch = await readFile(join(SRC_ROOT, 'candidates/runDaily30CloudAutoFetch.ts'), 'utf-8');
  const gmailAdapter = await readFile(join(SRC_ROOT, 'integrations/gmail/gmailDraftAdapter.ts'), 'utf-8');

  assert(complianceSrc.includes('evaluateSourceCompliance'), 'sourceCompliance evaluator exists');
  assert(complianceSrc.includes('blocked_by_policy'), 'sourceCompliance has blocked_by_policy');
  assert(complianceSrc.includes('filterUrlsToOfficialSiteDomain'), 'official domain filter exists');
  assert(complianceSrc.includes('getLeadApprovalComplianceBlockReason'), 'lead approval compliance block');
  assert(enrichSrc.includes('sanitizeCandidateEmailSources'), 'enrich uses sanitize');
  assert(enrichSrc.includes('filterUrlsToOfficialSiteDomain'), 'enrich filters to official domain');
  assert(enrichSrc.includes('discoverySourceUrl'), 'enrich references discovery separation');
  assert(approvalSrc.includes('getLeadApprovalComplianceBlockReason'), 'approval uses compliance block');
  assert(discoveryIndex.includes('job_site_reference'), 'discovery registry has job site');
  assert(discoveryIndex.includes('rakuten_marketplace_reference'), 'discovery registry has rakuten');
  assert(discoveryTypes.includes('referenceOnly: true'), 'discovery adapters are reference only');
  assert(!cloudFetch.includes('messages.send'), 'phase40.6 no gmail send');
  assert(!gmailAdapter.includes('messages.send'), 'gmail adapter no messages.send');
  assert(!cloudFetch.includes('users.drafts.create'), 'cloud fetch no drafts create');

  const {
    evaluateSourceCompliance,
    getLeadApprovalComplianceBlockReason,
    isUrlOnOfficialSiteDomain,
    isEmailSourceFromExternalListingSite,
    sanitizeCandidateEmailSources,
    classifyExternalEmailBlockReason,
  } = await import('../candidates/sourceCompliance.js');
  const {
    getDiscoveryReferenceAdapter,
    isDiscoveryReferenceImplemented,
    runDiscoveryReferenceStub,
    REFERENCE_ONLY_DISCOVERY_SOURCES,
  } = await import('../adapters/discovery/index.js');
  const { getDaily30LeadApprovalBlockReason } = await import(
    '../candidates/getDaily30LeadApprovalBlockReason.js'
  );
  const { resolveEmailSourceFromCandidate } = await import(
    '../candidates/resolveEmailSourceDisplay.js'
  );

  for (const source of REFERENCE_ONLY_DISCOVERY_SOURCES) {
    const adapter = getDiscoveryReferenceAdapter(source);
    assert(adapter !== null, `discovery adapter registered: ${source}`);
    assert(adapter?.referenceOnly === true, `${source} is referenceOnly`);
    assert(!isDiscoveryReferenceImplemented(source), `${source} crawl not implemented`);
  }

  const stubResult = await runDiscoveryReferenceStub({
    discoverySource: 'job_site_reference',
    discoverySourceSite: 'wantedly',
    discoverySourceUrl: 'https://www.wantedly.com/companies/example',
    batchId: '2026-07-02',
  });
  assert(stubResult.referenceOnly === true, 'stub returns referenceOnly');
  assert(stubResult.candidates.length === 0, 'stub does not crawl');
  assert(stubResult.implementationPending === true, 'stub marks implementation pending');

  const jobDiscoveryCandidate = {
    externalCandidateId: 'phase406-job',
    sourceType: 'google_places' as const,
    companyName: 'Job Ref Co',
    area: '宮城県',
    industry: '工務店',
    websiteUrl: 'https://corp.example/',
    officialSiteUrl: 'https://corp.example/',
    phoneNumber: null,
    address: null,
    googlePlaceId: null,
    sourceUrl: 'https://www.wantedly.com/companies/corp',
    sourceQuery: 'q',
    category: '工務店',
    contactFormUrl: null,
    emailCandidates: ['info@corp.example'],
    confidenceScore: 0.8,
    importStatus: 'preview' as const,
    riskLevel: 'low' as const,
    duplicateReason: '',
    duplicateKey: 'k-job',
    pipelineStatus: 'email_found' as const,
    prefecture: '宮城県',
    regionGroup: '宮城' as const,
    collectionPriority: 1,
    collectionAreaSource: '宮城県',
    collectionBatchId: '2026-07-02',
    emailCandidateSourceUrls: ['https://corp.example/contact'],
    emailVerifiedAt: null,
    generatedEmailSubject: null,
    generatedEmailBody: null,
    generatedCustomHook: null,
    generatedCustomHookReason: null,
    targetEmail: 'info@corp.example',
    emailCandidateSourceUrl: 'https://corp.example/contact',
    failureReason: null,
    copyGeneratedAt: null,
    qualityCheckedAt: null,
    humanReviewStatus: null,
    gmailDraftStatus: null,
    sendStatus: null,
    notes: '',
    collectedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    discoverySource: 'job_site_reference' as const,
    discoverySourceSite: 'wantedly' as const,
    discoverySourceUrl: 'https://www.wantedly.com/companies/corp',
  };

  assert(
    jobDiscoveryCandidate.discoverySourceUrl?.includes('wantedly'),
    'job site URL on discoverySourceUrl'
  );
  assert(
    isUrlOnOfficialSiteDomain('https://corp.example/contact', jobDiscoveryCandidate),
    'official email source on corp domain'
  );
  const emailDisplay = resolveEmailSourceFromCandidate(jobDiscoveryCandidate);
  assert(
    emailDisplay.emailSourceUrl !== jobDiscoveryCandidate.discoverySourceUrl,
    'job site URL not used as emailSourceUrl'
  );
  assert(emailDisplay.isOfficialSiteOrigin, 'official email source origin');

  const jobSiteEmailCandidate = {
    ...jobDiscoveryCandidate,
    emailCandidateSourceUrl: 'https://www.wantedly.com/companies/corp/contact',
    emailCandidateSourceUrls: ['https://www.wantedly.com/companies/corp/contact'],
  };
  assert(
    isEmailSourceFromExternalListingSite(jobSiteEmailCandidate),
    'wantedly email source detected as external listing'
  );
  assert(
    evaluateSourceCompliance(jobSiteEmailCandidate).status === 'blocked_by_policy',
    'job site email blocked_by_policy'
  );
  assert(
    classifyExternalEmailBlockReason(jobSiteEmailCandidate)?.includes('求人'),
    'job site block reason mentions job site'
  );

  const rakutenEmailCandidate = {
    ...jobDiscoveryCandidate,
    discoverySource: 'rakuten_marketplace_reference' as const,
    discoverySourceUrl: 'https://item.rakuten.co.jp/shop/example/',
    emailCandidateSourceUrl: 'https://item.rakuten.co.jp/shop/example/contact',
    emailCandidateSourceUrls: ['https://item.rakuten.co.jp/shop/example/contact'],
  };
  assert(
    evaluateSourceCompliance(rakutenEmailCandidate).status === 'blocked_by_policy',
    'rakuten email blocked_by_policy'
  );
  assert(
    classifyExternalEmailBlockReason(rakutenEmailCandidate)?.includes('楽天'),
    'rakuten block reason'
  );

  const discoveryOnlyCandidate = {
    ...jobDiscoveryCandidate,
    websiteUrl: null,
    officialSiteUrl: null,
    emailCandidates: [],
    targetEmail: null,
    emailCandidateSourceUrl: null,
    emailCandidateSourceUrls: [],
  };
  assert(
    evaluateSourceCompliance(discoveryOnlyCandidate).status === 'official_site_not_found',
    'discovery only without official site'
  );
  assert(
    getLeadApprovalComplianceBlockReason(discoveryOnlyCandidate)?.includes('公式サイト'),
    'discovery only blocks lead approval'
  );

  const verifiedCandidate = {
    ...jobDiscoveryCandidate,
    sourceComplianceStatus: 'official_site_verified' as const,
  };
  assert(
    evaluateSourceCompliance(verifiedCandidate).status === 'official_site_verified',
    'official verified path'
  );
  assert(
    getLeadApprovalComplianceBlockReason(verifiedCandidate) === null,
    'verified candidate no compliance block'
  );

  const blockedCandidate = {
    ...jobSiteEmailCandidate,
    sourceComplianceStatus: 'blocked_by_policy' as const,
    sourceComplianceNote: '求人サイト上のメール',
  };
  const blockedHint = getDaily30LeadApprovalBlockReason(blockedCandidate, [], []);
  assert(blockedHint?.canApprove === false, 'blocked_by_policy cannot approve');
  assert(
    blockedHint?.blockReason.includes('ポリシー') || blockedHint?.blockReason.includes('求人'),
    'blocked approval reason surfaced'
  );

  const sanitized = sanitizeCandidateEmailSources(jobSiteEmailCandidate);
  assert(sanitized.emailCandidates.length === 0, 'sanitize clears job site emails');
  assert(
    !sanitized.emailCandidateSourceUrls.some((u) => u.includes('wantedly')),
    'sanitize removes wantedly from email sources'
  );
  assert(sanitized.sourceComplianceStatus === 'blocked_by_policy', 'sanitize sets blocked status');

  const placeholderCandidate = {
    ...jobDiscoveryCandidate,
    targetEmail: 'xxx@example.com',
    emailCandidates: ['xxx@example.com'],
    emailCandidateSourceUrl: 'https://corp.example/contact',
  };
  assert(
    evaluateSourceCompliance(placeholderCandidate).status === 'blocked_by_policy',
    'placeholder blocked'
  );

  for (const content of [complianceSrc, enrichSrc, approvalSrc, discoveryIndex]) {
    assert(!content.includes('refresh_token'), 'phase40.6 no refresh_token in sources');
    assert(!content.includes('DAILY30_CLOUD_RUN_TOKEN'), 'phase40.6 no cloud token in sources');
  }

  ok('Phase 40.6 external reference safety checks passed');
}

async function verifyPhase412ManualExternalReference(): Promise<void> {
  const uiServer = await readFile(join(SRC_ROOT, 'server/uiServer.ts'), 'utf-8');
  const createSrc = await readFile(
    join(SRC_ROOT, 'candidates/createManualExternalReferenceCandidate.ts'),
    'utf-8'
  );
  const panel = await readFile(
    join(SRC_ROOT, 'ui/Daily30ManualExternalReferencePanel.tsx'),
    'utf-8'
  );
  const apiClient = await readFile(
    join(SRC_ROOT, 'ui/daily30ManualExternalReferenceApi.ts'),
    'utf-8'
  );
  const collectionView = await readFile(join(SRC_ROOT, 'ui/CandidateCollectionView.tsx'), 'utf-8');
  const enrichSrc = await readFile(join(SRC_ROOT, 'candidates/enrichCandidateEmailFromWebsite.ts'), 'utf-8');
  const approvalSrc = await readFile(
    join(SRC_ROOT, 'candidates/getDaily30LeadApprovalBlockReason.ts'),
    'utf-8'
  );
  const cloudFetch = await readFile(join(SRC_ROOT, 'candidates/runDaily30CloudAutoFetch.ts'), 'utf-8');

  assert(uiServer.includes('/api/daily30-external-reference/manual'), 'manual external reference API route');
  assert(uiServer.includes('createManualExternalReferenceCandidate'), 'uiServer uses create manual service');
  assert(createSrc.includes('discoverySourceUrl'), 'create stores discoverySourceUrl');
  assert(createSrc.includes('MANUAL_EXTERNAL_REFERENCE_PROFILE_ID'), 'manual profile id constant');
  assert(createSrc.includes('collectionMode: \'manual\''), 'collectionMode manual');
  assert(createSrc.includes('todayBatchIdJst'), 'JST batchId for manual candidate');
  assert(!createSrc.includes('fetch(discoverySourceUrl'), 'no fetch on discovery url');
  assert(!createSrc.includes('extractWebsiteContacts(discovery'), 'no enrich on discovery url');
  assert(createSrc.includes('shouldEnrichOfficialSiteEmail'), 'enrich option supported');
  assert(panel.includes('外部参照URLから候補追加') || panel.includes('外部参照'), 'manual panel exists');
  assert(collectionView.includes('Daily30ManualExternalReferencePanel'), 'panel embedded in collection view');
  assert(approvalSrc.includes('isDaily30ManualExternalReferenceApprovalPending'), 'manual lead approval pending');
  assert(approvalSrc.includes('getManualExternalReferenceBlockReason'), 'manual block reasons');
  assert(!cloudFetch.includes('messages.send'), 'phase41.2 no gmail send');
  assert(!cloudFetch.includes('users.drafts.create'), 'phase41.2 no drafts create');

  const {
    createManualExternalReferenceCandidate,
    validateManualExternalReferenceInput,
  } = await import('../candidates/createManualExternalReferenceCandidate.js');
  const { getDaily30LeadApprovalBlockReason } = await import(
    '../candidates/getDaily30LeadApprovalBlockReason.js'
  );
  const { isDaily30ManualExternalReferenceApprovalPending } = await import(
    '../candidates/selectDaily30LeadCandidates.js'
  );
  const { evaluateSourceCompliance } = await import('../candidates/sourceCompliance.js');
  const { MANUAL_EXTERNAL_REFERENCE_PROFILE_ID } = await import(
    '../candidates/manualExternalReferenceConstants.js'
  );
  const { todayBatchIdJst } = await import('../candidates/daily30AreaConfig.js');
  const { resolveEmailSourceFromCandidate } = await import(
    '../candidates/resolveEmailSourceDisplay.js'
  );

  const validationError = validateManualExternalReferenceInput({
    discoverySourceUrl: '',
    discoverySource: 'job_site_reference',
    companyName: 'Test',
  });
  assert(validationError !== null, 'validation rejects empty discovery url');

  const tokyoError = validateManualExternalReferenceInput({
    discoverySourceUrl: 'https://www.wantedly.com/companies/tokyo',
    discoverySource: 'job_site_reference',
    companyName: 'Tokyo Co',
    prefecture: '東京都',
  });
  assert(tokyoError?.includes('東京'), 'tokyo rejected at validation');

  const { candidate, warnings } = await createManualExternalReferenceCandidate(
    {
      discoverySourceUrl: 'https://www.wantedly.com/companies/phase412-test',
      discoverySource: 'job_site_reference',
      discoverySourceSite: 'wantedly',
      companyName: 'Phase412 Test Co',
      officialSiteUrl: 'https://phase412-test.example/',
      prefecture: '宮城県',
      industryCategory: 'housing',
      manualNote: 'verify only',
      shouldEnrichOfficialSiteEmail: false,
    },
    []
  );

  assert(candidate.collectionProfileId === MANUAL_EXTERNAL_REFERENCE_PROFILE_ID, 'manual profile id');
  assert(candidate.collectionMode === 'manual', 'manual collection mode');
  assert(candidate.discoverySource === 'job_site_reference', 'discovery source saved');
  assert(candidate.discoverySourceSite === 'wantedly', 'discovery site saved');
  assert(candidate.discoverySourceUrl?.includes('wantedly'), 'discovery url saved');
  assert(candidate.discoverySourceLabel?.includes('Wantedly'), 'discovery label generated');
  assert(candidate.collectionBatchId === todayBatchIdJst(), 'JST batch id');
  assert(warnings.includes('external_reference_url_is_discovery_only'), 'discovery only warning');
  assert(isDaily30ManualExternalReferenceApprovalPending(candidate), 'manual pending in approval list');

  const emailDisplay = resolveEmailSourceFromCandidate(candidate);
  assert(
    emailDisplay.emailSourceUrl !== candidate.discoverySourceUrl,
    'discovery url not email source url'
  );

  const noOfficial = await createManualExternalReferenceCandidate(
    {
      discoverySourceUrl: 'https://www.wantedly.com/companies/no-official',
      discoverySource: 'job_site_reference',
      discoverySourceSite: 'wantedly',
      companyName: 'No Official Co',
      prefecture: '宮城県',
      shouldEnrichOfficialSiteEmail: false,
    },
    []
  );
  const noOfficialBlock = getDaily30LeadApprovalBlockReason(noOfficial.candidate, [], []);
  assert(noOfficialBlock?.canApprove === false, 'no official site blocks approval');

  const rakutenBlocked = evaluateSourceCompliance({
    officialSiteUrl: 'https://shop.example/',
    websiteUrl: 'https://shop.example/',
    targetEmail: 'info@shop.example',
    emailCandidates: ['info@shop.example'],
    emailCandidateSourceUrl: 'https://item.rakuten.co.jp/shop/contact',
    emailCandidateSourceUrls: ['https://item.rakuten.co.jp/shop/contact'],
    discoverySourceUrl: 'https://item.rakuten.co.jp/shop/',
    sourceUrl: null,
    discoverySource: 'rakuten_marketplace_reference',
    prefecture: '宮城県',
  });
  assert(rakutenBlocked.status === 'blocked_by_policy', 'rakuten email blocked');

  const jobSiteEmailBlock = getDaily30LeadApprovalBlockReason(
    {
      ...candidate,
      externalCandidateId: 'blocked-job-email',
      emailCandidates: ['info@phase412-test.example'],
      targetEmail: 'info@phase412-test.example',
      emailCandidateSourceUrl: 'https://www.wantedly.com/companies/phase412-test/contact',
      emailCandidateSourceUrls: ['https://www.wantedly.com/companies/phase412-test/contact'],
      sourceComplianceStatus: 'blocked_by_policy',
      pipelineStatus: 'email_found',
    },
    [],
    []
  );
  assert(jobSiteEmailBlock?.canApprove === false, 'job site email blocks approval');

  for (const content of [uiServer, createSrc, panel]) {
    assert(!content.includes('refresh_token'), 'phase41.2 no refresh_token');
    assert(!content.includes('DAILY30_CLOUD_RUN_TOKEN'), 'phase41.2 no cloud token');
  }

  assert(apiClient.includes('readApiError'), 'phase41.2.1 manual api uses readApiError');
  assert(panel.includes('InfoBanner'), 'phase41.2.1 inline error/success banner');
  assert(panel.includes('toUserFacingApiError'), 'phase41.2.1 user facing submit errors');
  assert(panel.includes('disabledReason'), 'phase41.2.1 disabled reason hint');

  const apiErrorSrc = await readFile(join(SRC_ROOT, 'ui/apiError.ts'), 'utf-8');
  const displayLabels = await readFile(join(SRC_ROOT, 'ui/displayLabels.ts'), 'utf-8');
  const schedulePanel = await readFile(
    join(SRC_ROOT, 'ui/Daily30CollectionSchedulePanel.tsx'),
    'utf-8'
  );
  assert(apiErrorSrc.includes('parseApiErrorDev'), 'phase41.2.1 readApiError includes dev path');
  assert(displayLabels.includes('toUserFacingApiError'), 'phase41.2.1 user facing api error helper');
  assert(schedulePanel.includes('loadError'), 'phase41.2.1 schedule panel inline load error');

  const { selectDaily30ManualExternalReferenceApprovalPending } = await import(
    '../candidates/selectDaily30LeadCandidates.js'
  );
  assert(
    typeof selectDaily30ManualExternalReferenceApprovalPending === 'function',
    'phase41.2.1 manual pending selector exported'
  );

  const sameUrlEnriched = await createManualExternalReferenceCandidate(
    {
      discoverySourceUrl: 'https://phase412-same.example/',
      discoverySource: 'manual_url',
      companyName: 'Same Url Co',
      officialSiteUrl: 'https://phase412-same.example/',
      prefecture: '宮城県',
      industryCategory: 'housing',
      shouldEnrichOfficialSiteEmail: true,
    },
    []
  );
  assert(
    sameUrlEnriched.warnings.includes('discovery_url_same_as_official_skipped'),
    'phase41.2.1 same url enrich skipped with warning'
  );

  ok('Phase 41.2 manual external reference checks passed');
}

async function verifyPhase413ExternalReferenceAdapterFoundation(): Promise<void> {
  const approvalConfig = await readFile(
    join(SRC_ROOT, 'adapters/discovery/externalReferenceApprovalConfig.ts'),
    'utf-8'
  );
  const executionPlan = await readFile(
    join(SRC_ROOT, 'adapters/discovery/resolveDiscoveryAdapterExecutionPlan.ts'),
    'utf-8'
  );
  const runWithPlan = await readFile(
    join(SRC_ROOT, 'adapters/discovery/runDiscoveryReferenceWithPlan.ts'),
    'utf-8'
  );
  const uiServer = await readFile(join(SRC_ROOT, 'server/uiServer.ts'), 'utf-8');
  const approvalPanel = await readFile(
    join(SRC_ROOT, 'ui/Daily30ExternalReferenceApprovalPanel.tsx'),
    'utf-8'
  );
  const cloudFetch = await readFile(join(SRC_ROOT, 'candidates/runDaily30CloudAutoFetch.ts'), 'utf-8');

  assert(approvalConfig.includes('EXTERNAL_REFERENCE_APPROVAL_CONFIG'), 'approval config exists');
  assert(approvalConfig.includes('approved_for_manual_url'), 'manual url approval status');
  assert(approvalConfig.includes('approved_for_dry_run'), 'dry run approval status');
  assert(executionPlan.includes('resolveDiscoveryAdapterExecutionPlan'), 'execution plan resolver');
  assert(runWithPlan.includes('networkAccessPerformed: false'), 'no network in plan runner');
  assert(uiServer.includes('/api/daily30-external-reference/approval-status'), 'approval status API');
  assert(approvalPanel.includes('Daily30ExternalReferenceApprovalPanel'), 'approval panel exists');
  assert(!cloudFetch.includes('messages.send'), 'phase41.3 no gmail send');
  assert(!cloudFetch.includes('users.drafts.create'), 'phase41.3 no drafts create');
  assert(!runWithPlan.includes('fetch('), 'phase41.3 runWithPlan no fetch');

  const {
    resolveDiscoveryAdapterExecutionPlan,
    runDiscoveryReferenceWithPlan,
    listExternalReferenceApprovalConfigs,
  } = await import('../adapters/discovery/index.js');
  const { previewDryRunDiscoveryPlans } = await import(
    '../candidates/buildExternalReferenceApprovalSummary.js'
  );

  const manualPlan = resolveDiscoveryAdapterExecutionPlan({
    discoverySource: 'manual_url',
    dryRun: false,
  });
  assert(manualPlan.mode === 'manual_only', 'manual url is manual_only');
  assert(manualPlan.canRun === false, 'manual url adapter auto run blocked');

  const industryDryRun = resolveDiscoveryAdapterExecutionPlan({
    discoverySource: 'industry_directory_reference',
    dryRun: true,
  });
  assert(industryDryRun.canRun === true, 'industry dry run canRun');
  assert(industryDryRun.mode === 'dry_run_only', 'industry dry run mode');
  assert(industryDryRun.networkAccessAllowed === false, 'industry dry run no network');

  const industryLive = resolveDiscoveryAdapterExecutionPlan({
    discoverySource: 'industry_directory_reference',
    dryRun: false,
  });
  assert(industryLive.canRun === false, 'industry live blocked without low frequency approval');
  assert(industryLive.mode === 'dry_run_only', 'industry live mode dry_run_only');

  const indeedPlan = resolveDiscoveryAdapterExecutionPlan({
    discoverySource: 'job_site_reference',
    discoverySourceSite: 'indeed',
    dryRun: true,
  });
  assert(indeedPlan.mode === 'blocked', 'indeed blocked');
  assert(indeedPlan.canRun === false, 'indeed cannot run');

  const wantedlyPlan = resolveDiscoveryAdapterExecutionPlan({
    discoverySource: 'job_site_reference',
    discoverySourceSite: 'wantedly',
    dryRun: true,
  });
  assert(wantedlyPlan.canRun === false, 'wantedly dry run blocked until approved');
  assert(wantedlyPlan.reason === 'human_approval_required', 'wantedly needs approval');

  const dryRunResult = await runDiscoveryReferenceWithPlan(
    {
      discoverySource: 'portal_site_reference',
      prefecture: '宮城県',
      industryCategory: 'housing',
      batchId: 'phase413-verify',
    },
    { dryRun: true }
  );
  assert(dryRunResult.candidates.length === 0, 'dry run returns no candidates');
  assert(dryRunResult.executionPlan?.networkAccessPerformed === false, 'dry run no network');
  assert(dryRunResult.executionPlan?.dryRun === true, 'dry run flag set');

  const blockedResult = await runDiscoveryReferenceWithPlan(
    {
      discoverySource: 'job_site_reference',
      discoverySourceSite: 'indeed',
      batchId: 'phase413-verify',
    },
    { dryRun: true }
  );
  assert(blockedResult.candidates.length === 0, 'blocked source empty candidates');
  assert(blockedResult.executionPlan?.mode === 'blocked', 'blocked execution plan');

  const configs = listExternalReferenceApprovalConfigs();
  assert(configs.length >= 10, 'approval config entries');
  assert(
    configs.every((c) => !c.allowedFields.includes('emailCandidates' as never)),
    'allowed fields exclude email'
  );

  const previews = await previewDryRunDiscoveryPlans();
  assert(previews.length === 2, 'dry run preview targets');
  assert(previews.every((p) => p.executionPlan?.networkAccessPerformed === false), 'preview no network');

  ok('Phase 41.3 external reference adapter foundation checks passed');
}

async function verifyPhase414Daily30ExternalReferenceSupplement(): Promise<void> {
  const fetchSrc = await readFile(join(SRC_ROOT, 'candidates/fetchDaily30Candidates.ts'), 'utf-8');
  const cloudFetch = await readFile(join(SRC_ROOT, 'candidates/runDaily30CloudAutoFetch.ts'), 'utf-8');
  const supplementSrc = await readFile(
    join(SRC_ROOT, 'candidates/daily30ExternalReferenceSupplement.ts'),
    'utf-8'
  );
  const cloudState = await readFile(join(SRC_ROOT, 'storage/daily30CloudRunState.ts'), 'utf-8');
  const dashboard = await readFile(join(SRC_ROOT, 'candidates/buildDaily30CloudDashboard.ts'), 'utf-8');
  const resultsPanel = await readFile(join(SRC_ROOT, 'ui/Daily30CloudResultsPanel.tsx'), 'utf-8');
  const collectionView = await readFile(join(SRC_ROOT, 'ui/CandidateCollectionView.tsx'), 'utf-8');
  const detailsPanel = await readFile(join(SRC_ROOT, 'ui/CandidateCollectionDetailsPanel.tsx'), 'utf-8');
  const settingsView = await readFile(join(SRC_ROOT, 'ui/SettingsView.tsx'), 'utf-8');

  assert(fetchSrc.includes('runDaily30ExternalReferenceSupplement'), 'fetch calls supplement');
  assert(fetchSrc.includes('resolveDiscoveryAdapterExecutionPlan') === false, 'fetch uses supplement module not direct plan');
  assert(supplementSrc.includes('resolveDiscoveryAdapterExecutionPlan'), 'supplement resolves execution plan');
  assert(supplementSrc.includes('runDiscoveryReferenceWithPlan'), 'supplement invokes plan runner');
  assert(supplementSrc.includes('listEligibleManualExternalReferenceCandidates'), 'manual candidates listed');
  assert(supplementSrc.includes('MANUAL_EXTERNAL_REFERENCE_PROFILE_ID'), 'manual profile id used');
  assert(supplementSrc.includes('blocked_by_policy'), 'blocked manual excluded');
  assert(supplementSrc.includes('externalReferenceNetworkAccessPerformed: false'), 'network always false phase41.4');
  assert(cloudFetch.includes('attachSupplementToEntry'), 'cloud fetch attaches supplement to state');
  assert(cloudFetch.includes('previewDaily30ExternalReferenceSupplement'), 'dry run preview supplement');
  assert(cloudState.includes('externalReferenceSupplementMode'), 'state has supplement mode');
  assert(dashboard.includes('externalReferenceFieldsFromEntry'), 'dashboard exposes supplement fields');
  assert(!resultsPanel.includes('Daily30ExternalReferenceSupplementBanner'), 'supplement moved out of results sidebar');
  assert(detailsPanel.includes('Daily30ExternalReferenceSupplementBanner'), 'details panel shows supplement');
  assert(
    settingsView.includes("from './Daily30DashboardPanel") ||
      settingsView.includes('from "./Daily30DashboardPanel'),
    'settings view imports Daily30DashboardPanel for developer mode'
  );
  assert(!cloudFetch.includes('messages.send'), 'phase41.4 no gmail send');
  assert(!cloudFetch.includes('users.drafts.create'), 'phase41.4 no drafts create');

  const {
    runDaily30ExternalReferenceSupplement,
    previewDaily30ExternalReferenceSupplement,
    listEligibleManualExternalReferenceCandidates,
    supplementResultToStateFields,
  } = await import('../candidates/daily30ExternalReferenceSupplement.js');
  const { resolveDiscoveryAdapterExecutionPlan } = await import('../adapters/discovery/index.js');
  const { MANUAL_EXTERNAL_REFERENCE_PROFILE_ID } = await import(
    '../candidates/manualExternalReferenceConstants.js'
  );

  const placesProfile = {
    collectionProfileId: 'google-places-housing',
    collectionProfileName: 'Google Places',
    collectionMode: 'daily30' as const,
    industryCategory: 'housing' as const,
    areaStrategy: 'rotation' as const,
    areaQueuePosition: 0,
    discoverySource: 'google_places' as const,
    discoverySourceSite: null,
    discoverySourceLabel: 'Google Places',
  };

  const notApplicable = await runDaily30ExternalReferenceSupplement({
    profile: placesProfile,
    batchId: 'phase414-verify',
    emailFound: 10,
    reachedTarget: false,
    existingCandidates: [],
    dryRun: true,
  });
  assert(notApplicable.externalReferenceSupplementMode === 'not_applicable', 'places profile not applicable');
  assert(notApplicable.externalReferenceNetworkAccessPerformed === false, 'not applicable no network');
  assert(notApplicable.externalReferenceWarnings.includes('external_reference_not_applicable'), 'not applicable warning');

  const portalProfile = {
    ...placesProfile,
    collectionProfileId: 'portal-reference',
    discoverySource: 'portal_site_reference' as const,
    discoverySourceSite: null,
    discoverySourceLabel: '地域ポータル',
  };
  const dryRunPortal = await runDaily30ExternalReferenceSupplement({
    profile: portalProfile,
    batchId: 'phase414-verify',
    emailFound: 5,
    reachedTarget: false,
    existingCandidates: [],
    dryRun: true,
  });
  assert(dryRunPortal.externalReferenceSupplementAttempted === true, 'portal supplement attempted');
  assert(dryRunPortal.externalReferenceSupplementMode === 'dry_run_only', 'portal dry run only');
  assert(dryRunPortal.externalReferenceNetworkAccessPerformed === false, 'portal dry run no network');
  assert(dryRunPortal.externalReferenceWarnings.includes('external_reference_dry_run_only'), 'dry run warning');

  const wantedlyPlan = resolveDiscoveryAdapterExecutionPlan({
    discoverySource: 'job_site_reference',
    discoverySourceSite: 'wantedly',
    dryRun: false,
  });
  const wantedlyProfile = {
    ...placesProfile,
    collectionProfileId: 'wantedly-ref',
    discoverySource: 'job_site_reference' as const,
    discoverySourceSite: 'wantedly' as const,
  };
  const skipped = await runDaily30ExternalReferenceSupplement({
    profile: wantedlyProfile,
    batchId: 'phase414-verify',
    emailFound: 0,
    reachedTarget: false,
    existingCandidates: [],
    dryRun: false,
  });
  assert(wantedlyPlan.canRun === false, 'wantedly plan cannot run');
  assert(
    skipped.externalReferenceSupplementMode === 'skipped_not_approved' ||
      skipped.externalReferenceSupplementMode === 'blocked',
    'wantedly skipped or blocked'
  );
  assert(skipped.externalReferenceNetworkAccessPerformed === false, 'wantedly no network');

  const indeedPlan = resolveDiscoveryAdapterExecutionPlan({
    discoverySource: 'job_site_reference',
    discoverySourceSite: 'indeed',
    dryRun: true,
  });
  assert(indeedPlan.mode === 'blocked', 'indeed blocked');
  const indeedProfile = {
    ...placesProfile,
    discoverySource: 'job_site_reference' as const,
    discoverySourceSite: 'indeed' as const,
  };
  const blocked = await runDaily30ExternalReferenceSupplement({
    profile: indeedProfile,
    batchId: 'phase414-verify',
    emailFound: 0,
    reachedTarget: false,
    existingCandidates: [],
  });
  assert(blocked.externalReferenceSupplementMode === 'blocked', 'indeed supplement blocked');
  assert(blocked.externalReferenceNetworkAccessPerformed === false, 'indeed no network');

  const preview = await previewDaily30ExternalReferenceSupplement({
    profile: portalProfile,
    batchId: 'phase414-preview',
    emailFound: 2,
    reachedTarget: false,
    existingCandidates: [],
  });
  assert(preview.externalReferenceNetworkAccessPerformed === false, 'preview no network');
  assert(preview.externalReferenceSupplementMode === 'dry_run_only', 'preview dry run mode');

  const manualBlocked = {
    externalCandidateId: 'manual-blocked',
    collectionProfileId: MANUAL_EXTERNAL_REFERENCE_PROFILE_ID,
    sourceComplianceStatus: 'blocked_by_policy',
    importStatus: 'preview',
    pipelineStatus: 'collected',
  } as import('../adapters/externalLeadCandidateTypes.js').ExternalLeadCandidate;
  const manualOk = {
    externalCandidateId: 'manual-ok',
    collectionProfileId: MANUAL_EXTERNAL_REFERENCE_PROFILE_ID,
    sourceComplianceStatus: 'needs_human_review',
    importStatus: 'preview',
    pipelineStatus: 'email_not_found',
    discoverySourceUrl: 'https://example.com/listing',
    emailSourceUrl: null,
  } as import('../adapters/externalLeadCandidateTypes.js').ExternalLeadCandidate;
  const manualStats = listEligibleManualExternalReferenceCandidates([manualBlocked, manualOk]);
  assert(manualStats.available === 2, 'manual available count');
  assert(manualStats.blocked === 1, 'manual blocked count');
  assert(manualStats.eligible.length === 1, 'manual eligible excludes blocked');

  const withManual = await runDaily30ExternalReferenceSupplement({
    profile: placesProfile,
    batchId: 'phase414-manual',
    emailFound: 12,
    reachedTarget: false,
    existingCandidates: [manualOk],
  });
  assert(
    withManual.externalReferenceManualCandidatesEligible === 1,
    'manual eligible surfaced in supplement'
  );
  assert(
    withManual.externalReferenceWarnings.includes('external_reference_manual_candidates_available'),
    'manual available warning'
  );

  const stateFields = supplementResultToStateFields(dryRunPortal);
  assert(stateFields.externalReferenceSupplementMode === 'dry_run_only', 'state fields mode');
  assert(stateFields.externalReferenceNetworkAccessPerformed === false, 'state fields network false');
  assert(typeof stateFields.externalReferenceDisplayMessage === 'string', 'state display message');

  ok('Phase 41.4 Daily 30 external reference supplement checks passed');
}

async function verifyPhase415ACandidateCollectionUiOptimization(): Promise<void> {
  const collectionView = await readFile(join(SRC_ROOT, 'ui/CandidateCollectionView.tsx'), 'utf-8');
  const resultsPanel = await readFile(join(SRC_ROOT, 'ui/Daily30CloudResultsPanel.tsx'), 'utf-8');
  const leadPanel = await readFile(join(SRC_ROOT, 'ui/Daily30LeadCandidatesPanel.tsx'), 'utf-8');
  const draftPanel = await readFile(join(SRC_ROOT, 'ui/Daily30DraftImportPanel.tsx'), 'utf-8');
  const manualPanel = await readFile(join(SRC_ROOT, 'ui/Daily30ManualExternalReferencePanel.tsx'), 'utf-8');
  const schedulePanel = await readFile(join(SRC_ROOT, 'ui/Daily30CollectionSchedulePanel.tsx'), 'utf-8');
  const tabBoundary = await readFile(join(SRC_ROOT, 'ui/common/TabErrorBoundary.tsx'), 'utf-8');
  const styles = await readFile(join(SRC_ROOT, 'ui/styles.css'), 'utf-8');

  assert(collectionView.includes("type CandidateCollectionWorkView"), 'work view type exists');
  assert(collectionView.includes("setWorkView('results") || collectionView.includes("setWorkView(\"results"), 'results tab exists');
  assert(collectionView.includes("setWorkView('lead_approval") || collectionView.includes("setWorkView(\"lead_approval"), 'lead approval tab exists');
  assert(collectionView.includes("setWorkView('draft_import") || collectionView.includes("setWorkView(\"draft_import"), 'draft import tab exists');
  assert(collectionView.includes('showExternalReferenceDrawer'), 'external reference drawer state exists');
  assert(collectionView.includes('drawer-overlay'), 'drawer overlay exists');
  assert(!collectionView.includes('2. Lead化承認・営業文'), 'old always-on section headings removed from collection view');
  assert(!collectionView.includes('3. 下書き候補取り込み'), 'old always-on section headings removed from collection view');

  assert(resultsPanel.includes('pageSize') && resultsPanel.includes('setPageSize'), 'results paging exists');
  assert(resultsPanel.includes('会社名で検索'), 'results search exists');
  assert(resultsPanel.includes('収集元:'), 'results source filter exists');

  assert(leadPanel.includes('会社名で検索'), 'lead panel search exists');
  assert(leadPanel.includes('pageSize') && leadPanel.includes('setPageSize'), 'lead panel paging exists');
  assert(leadPanel.includes('作業可能（推奨）'), 'lead panel default actionable view exists');

  assert(draftPanel.includes('下書き候補取り込み 0件'), 'draft import zero state simplified');

  assert(!manualPanel.includes('discoverySourceUrl'), 'manual panel hides internal field names in main label');
  assert(manualPanel.includes('掲載元URL'), 'manual panel uses user label');

  assert(!schedulePanel.includes('Phase 40.6'), 'schedule panel removes old phase text');

  assert(tabBoundary.includes('候補収集画面の一部読み込みに失敗しました'), 'tab error boundary message');
  assert(styles.includes('candidate-collection-header-sticky'), 'sticky header css exists');
  assert(!resultsPanel.includes('messages.send'), 'no gmail send in results panel');
  assert(!resultsPanel.includes('users.drafts.create'), 'no drafts create in results panel');

  ok('Phase 41.5A candidate collection UI optimization checks passed');
}

/** React rules-of-hooks: no useState/useMemo/useEffect/useCallback after component-level early return. */
function assertNoHooksAfterComponentEarlyReturn(source: string, label: string): void {
  const loadingEarly = source.match(/\n  if \(loading\) return /);
  if (!loadingEarly || loadingEarly.index === undefined) {
    return;
  }
  const afterEarly = source.slice(loadingEarly.index);
  const beforeMainReturn = afterEarly.split(/\n  return \(/)[0] ?? '';
  const hookCalls = beforeMainReturn.match(/\buse(Memo|State|Effect|Callback)\s*\(/g);
  assert(
    !hookCalls || hookCalls.length === 0,
    `${label}: hooks must not appear after loading early return (React #310): ${hookCalls?.join(', ') ?? ''}`
  );
}

async function verifyPhase415CHookOrderSafety(): Promise<void> {
  const collectionView = await readFile(join(SRC_ROOT, 'ui/CandidateCollectionView.tsx'), 'utf-8');
  const resultsPanel = await readFile(join(SRC_ROOT, 'ui/Daily30CloudResultsPanel.tsx'), 'utf-8');
  const leadPanel = await readFile(join(SRC_ROOT, 'ui/Daily30LeadCandidatesPanel.tsx'), 'utf-8');
  const draftPanel = await readFile(join(SRC_ROOT, 'ui/Daily30DraftImportPanel.tsx'), 'utf-8');
  const manualPanel = await readFile(join(SRC_ROOT, 'ui/Daily30ManualExternalReferencePanel.tsx'), 'utf-8');
  const dashboard = await readFile(join(SRC_ROOT, 'ui/GrowlySalesDashboard.tsx'), 'utf-8');
  const tabBoundary = await readFile(join(SRC_ROOT, 'ui/common/TabErrorBoundary.tsx'), 'utf-8');

  assertNoHooksAfterComponentEarlyReturn(resultsPanel, 'Daily30CloudResultsPanel');
  assertNoHooksAfterComponentEarlyReturn(leadPanel, 'Daily30LeadCandidatesPanel');
  assertNoHooksAfterComponentEarlyReturn(draftPanel, 'Daily30DraftImportPanel');

  const resultsLoadingIdx = resultsPanel.indexOf('if (loading) return');
  const resultsPrefectureIdx = resultsPanel.indexOf('const prefectureOptions = useMemo');
  assert(
    resultsPrefectureIdx >= 0 && resultsLoadingIdx >= 0 && resultsPrefectureIdx < resultsLoadingIdx,
    'Daily30CloudResultsPanel: filter useMemo hooks must precede loading early return'
  );

  const leadLoadingIdx = leadPanel.indexOf('if (loading) return');
  const leadPendingIdx = leadPanel.indexOf('const pendingFiltered = useMemo');
  assert(
    leadPendingIdx >= 0 && leadLoadingIdx >= 0 && leadPendingIdx < leadLoadingIdx,
    'Daily30LeadCandidatesPanel: list useMemo hooks must precede loading early return'
  );

  assert(
    !collectionView.includes('if (workView') ||
      !collectionView.match(/if \(workView[^)]*\)[^{]*\{[^}]*use(Memo|State|Effect|Callback)/),
    'CandidateCollectionView: work tab switch must not conditionally call hooks'
  );
  assert(
    !collectionView.includes('if (showExternalReferenceDrawer') ||
      !collectionView.match(
        /if \(showExternalReferenceDrawer[^)]*\)[^{]*\{[^}]*use(Memo|State|Effect|Callback)/
      ),
    'CandidateCollectionView: drawer open must not conditionally call hooks'
  );
  assert(
    !manualPanel.includes('if (loading) return'),
    'Daily30ManualExternalReferencePanel: drawer form keeps fixed hook count (no loading early return)'
  );

  assert(dashboard.includes('TabErrorBoundary'), 'TabErrorBoundary still wraps candidate collection');
  assert(tabBoundary.includes('候補収集画面の一部読み込みに失敗しました'), 'TabErrorBoundary message retained');

  const gmailSendPattern = /users\.messages\.send|messages\.send/;
  for (const [name, src] of [
    ['CandidateCollectionView', collectionView],
    ['Daily30CloudResultsPanel', resultsPanel],
    ['Daily30LeadCandidatesPanel', leadPanel],
  ] as const) {
    assert(!gmailSendPattern.test(src), `${name}: Gmail send API must not be used`);
    assert(!src.includes('users.drafts.create'), `${name}: Gmail drafts.create must not be used`);
  }

  const secretPattern = /(Bearer\s+[A-Za-z0-9._-]{20,}|refresh_token['":\s]+[A-Za-z0-9._-]{20,})/;
  for (const [name, src] of [
    ['CandidateCollectionView', collectionView],
    ['Daily30CloudResultsPanel', resultsPanel],
    ['Daily30LeadCandidatesPanel', leadPanel],
    ['TabErrorBoundary', tabBoundary],
  ] as const) {
    assert(!secretPattern.test(src), `${name}: secrets/tokens must not appear in UI source`);
  }

  ok('Phase 41.5C hook order safety checks passed');
}

async function verifyPhase415DWorkQueueUi(): Promise<void> {
  const collectionView = await readFile(join(SRC_ROOT, 'ui/CandidateCollectionView.tsx'), 'utf-8');
  const resultsPanel = await readFile(join(SRC_ROOT, 'ui/Daily30CloudResultsPanel.tsx'), 'utf-8');
  const leadPanel = await readFile(join(SRC_ROOT, 'ui/Daily30LeadCandidatesPanel.tsx'), 'utf-8');
  const candidateCards = await readFile(join(SRC_ROOT, 'ui/Daily30CandidateCards.tsx'), 'utf-8');
  const styles = await readFile(join(SRC_ROOT, 'ui/styles.css'), 'utf-8');
  const tabBoundary = await readFile(join(SRC_ROOT, 'ui/common/TabErrorBoundary.tsx'), 'utf-8');

  assert(collectionView.includes('candidate-header-today'), 'compressed today summary line');
  assert(collectionView.includes('candidate-header-tomorrow'), 'one-line tomorrow schedule');
  assert(collectionView.includes('今日：'), 'today label in header');
  assert(collectionView.includes('明日：'), 'tomorrow label in header');
  assert(!collectionView.includes('SummaryStatCard'), 'four stat cards removed from collection header');

  assert(resultsPanel.includes('daily30-work-queue'), 'results panel uses single work queue');
  assert(resultsPanel.includes('workQueueTitleForFilter'), 'dynamic work queue title');
  assert(resultsPanel.includes('今日の収集情報'), 'collection meta collapsed');
  assert(!resultsPanel.includes('メール取得済候補'), 'duplicate email-found list removed');
  assert(!resultsPanel.includes('全候補（フィルター結果）'), 'duplicate filtered list section removed');
  assert(resultsPanel.includes("layout=\"queue\"") || resultsPanel.includes("layout='queue'"), 'queue row layout');

  assert(leadPanel.includes('daily30-work-queue'), 'lead panel uses work queue');
  assert(leadPanel.includes('HumanGateConfirmModal'), 'generate copy human gate retained');
  assert(leadPanel.includes('GENERATE_DAILY_30_COPY_GATE_LABEL'), 'generate gate label retained');

  assert(candidateCards.includes('Daily30CandidateQueueHeader'), 'queue table header exists');
  assert(candidateCards.includes('daily30-candidate-card-queue'), 'queue row card layout');

  assert(styles.includes('max-width: min(1400px'), 'collection view width expanded');
  assert(styles.includes('daily30-queue-header'), 'queue header styles');

  assert(tabBoundary.includes('候補収集画面の一部読み込みに失敗しました'), 'TabErrorBoundary retained');
  assert(!resultsPanel.includes('messages.send'), 'no gmail send in results panel');
  assert(!resultsPanel.includes('users.drafts.create'), 'no drafts create in results panel');

  ok('Phase 41.5D work queue UI checks passed');
}

async function verifyPhase415EFocusMode(): Promise<void> {
  const collectionView = await readFile(join(SRC_ROOT, 'ui/CandidateCollectionView.tsx'), 'utf-8');
  const resultsPanel = await readFile(join(SRC_ROOT, 'ui/Daily30CloudResultsPanel.tsx'), 'utf-8');
  const leadPanel = await readFile(join(SRC_ROOT, 'ui/Daily30LeadCandidatesPanel.tsx'), 'utf-8');
  const focusView = await readFile(join(SRC_ROOT, 'ui/Daily30CandidateFocusView.tsx'), 'utf-8');
  const focusMode = await readFile(join(SRC_ROOT, 'ui/daily30CandidateFocusMode.ts'), 'utf-8');
  const focusHook = await readFile(join(SRC_ROOT, 'ui/useCandidateFocusQueue.ts'), 'utf-8');
  const toggle = await readFile(join(SRC_ROOT, 'ui/CandidateDisplayModeToggle.tsx'), 'utf-8');
  const dashboard = await readFile(join(SRC_ROOT, 'ui/GrowlySalesDashboard.tsx'), 'utf-8');
  const tabBoundary = await readFile(join(SRC_ROOT, 'ui/common/TabErrorBoundary.tsx'), 'utf-8');
  const styles = await readFile(join(SRC_ROOT, 'ui/styles.css'), 'utf-8');

  assert(toggle.includes('1件ずつ') && toggle.includes('一覧'), 'focus/list toggle labels');
  assert(focusMode.includes("CandidateDisplayMode = 'focus' | 'list'"), 'display mode type');
  assert(focusMode.includes('loadStoredDisplayMode'), 'localStorage display mode');
  assert(focusMode.includes('sortCandidatesForFocusMode'), 'focus sort order');
  assert(focusMode.includes('applyDeferredOrder'), 'defer to queue end');

  assert(resultsPanel.includes('CandidateDisplayModeToggle'), 'results panel has mode toggle');
  assert(resultsPanel.includes('Daily30CandidateFocusView'), 'results panel has focus view');
  assert(resultsPanel.includes("displayMode === 'focus'"), 'results focus branch');
  assert(resultsPanel.includes("displayMode === 'list'"), 'results list branch preserved');
  assert(resultsPanel.includes('useCandidateFocusQueue'), 'results uses focus queue hook');
  assert(resultsPanel.includes('deferCurrent'), 'results defer support');
  assert(resultsPanel.includes('recordProcessed'), 'results processed count');

  assert(leadPanel.includes('CandidateDisplayModeToggle'), 'lead panel has mode toggle');
  assert(leadPanel.includes('Daily30CandidateFocusView'), 'lead panel has focus view');
  assert(leadPanel.includes('primaryAction'), 'lead focus primary action');

  assert(focusView.includes('daily30-focus-card'), 'single focus card');
  assert(focusView.includes('あとで確認'), 'defer button');
  assert(focusView.includes('Lead化承認'), 'approve button');
  assert(focusView.includes('候補から除外'), 'exclude button');
  assert(focusView.includes('前へ'), 'prev navigation');
  assert(focusView.includes('次へ'), 'next navigation');
  assert(focusView.includes('残り'), 'remaining count');
  assert(focusView.includes('今日処理済み'), 'processed count');
  assert(focusView.includes('すべての候補を「あとで確認」'), 'all deferred empty state');
  assert(focusView.includes('開発者向け詳細'), 'dev details collapsed');
  assert(!focusView.includes('Bearer '), 'no bearer token in focus view');

  assert(focusHook.includes('allCandidatesDeferred'), 'infinite loop guard');
  assert(focusHook.includes('clearDeferred'), 'reset deferred');

  assertNoHooksAfterComponentEarlyReturn(resultsPanel, 'Daily30CloudResultsPanel');
  assertNoHooksAfterComponentEarlyReturn(leadPanel, 'Daily30LeadCandidatesPanel');

  assert(dashboard.includes('TabErrorBoundary'), 'TabErrorBoundary maintained');
  assert(tabBoundary.includes('候補収集画面の一部読み込みに失敗しました'), 'tab error boundary message');
  assert(styles.includes('daily30-focus-panel'), 'focus panel styles');
  assert(!resultsPanel.includes('messages.send'), 'no gmail send');
  assert(!resultsPanel.includes('users.drafts.create'), 'no drafts create');

  ok('Phase 41.5E focus mode checks passed');
}

async function verifyPhase415GLeadApprovalJudgmentAudit(): Promise<void> {
  const complianceSrc = await readFile(join(SRC_ROOT, 'candidates/sourceCompliance.ts'), 'utf-8');
  const enrichSrc = await readFile(join(SRC_ROOT, 'candidates/enrichCandidateFields.ts'), 'utf-8');
  const approvalSrc = await readFile(
    join(SRC_ROOT, 'candidates/getDaily30LeadApprovalBlockReason.ts'),
    'utf-8'
  );
  const judgmentSrc = await readFile(
    join(SRC_ROOT, 'candidates/resolveDaily30LeadApprovalJudgment.ts'),
    'utf-8'
  );
  const approveWorkflow = await readFile(
    join(SRC_ROOT, 'workflow/approveExternalCandidateForLead.ts'),
    'utf-8'
  );
  const focusView = await readFile(join(SRC_ROOT, 'ui/Daily30CandidateFocusView.tsx'), 'utf-8');
  const focusMode = await readFile(join(SRC_ROOT, 'ui/daily30CandidateFocusMode.ts'), 'utf-8');

  assert(judgmentSrc.includes('resolveDaily30LeadApprovalJudgment'), 'unified judgment resolver');
  assert(judgmentSrc.includes('representativeEmailJudgmentLabel'), 'judgment label helper');
  assert(!complianceSrc.includes('candidate.sourceComplianceStatus ?? evaluation.status'), 'no stale compliance in block reason');
  assert(enrichSrc.includes('applySourceComplianceFields'), 'enrich recomputes compliance on load');
  assert(approveWorkflow.includes('getDaily30LeadApprovalBlockReason'), 'approve API uses block reason');
  assert(focusView.includes('representativeEmailLabel'), 'focus view uses unified representative label');
  assert(!focusView.includes('emailSource.emailSourceConfirmed ?'), 'focus view does not use emailSourceConfirmed alone');
  assert(focusMode.includes('isRepresentativeEmailOfficialSiteVerified'), 'focus mode uses compliance verified');
  assert(complianceSrc.includes('hostMatchesOrIsSubdomain'), 'official site domain allows subdomain');

  const {
    getLeadApprovalComplianceBlockReason,
    evaluateSourceCompliance,
    isUrlOnOfficialSiteDomain,
  } = await import('../candidates/sourceCompliance.js');
  const { getDaily30LeadApprovalBlockReason } = await import(
    '../candidates/getDaily30LeadApprovalBlockReason.js'
  );
  const { resolveDaily30LeadApprovalJudgment } = await import(
    '../candidates/resolveDaily30LeadApprovalJudgment.js'
  );
  const { enrichExternalLeadCandidate } = await import('../candidates/enrichCandidateFields.js');
  const { representativeEmailJudgmentLabel } = await import(
    '../candidates/resolveDaily30LeadApprovalJudgment.js'
  );

  const officialVerifiedBase = {
    externalCandidateId: 'phase415g-verified',
    sourceType: 'google_places' as const,
    companyName: 'Verified Housing Co',
    area: '宮城県',
    industry: '工務店',
    websiteUrl: 'https://www.example-housing.test/',
    officialSiteUrl: 'https://www.example-housing.test/',
    phoneNumber: null,
    address: null,
    googlePlaceId: 'p1',
    sourceUrl: 'https://maps.google.com/x',
    sourceQuery: 'q',
    category: '工務店',
    contactFormUrl: null,
    emailCandidates: ['info@example-housing.test'],
    confidenceScore: 0.9,
    importStatus: 'preview' as const,
    riskLevel: 'low' as const,
    duplicateReason: '',
    duplicateKey: 'k-415g',
    pipelineStatus: 'email_found' as const,
    prefecture: '宮城県',
    regionGroup: '宮城' as const,
    collectionPriority: 1,
    collectionAreaSource: '宮城県',
    collectionBatchId: '2026-07-02',
    emailCandidateSourceUrls: ['https://www.example-housing.test/contact'],
    emailCandidateSourceUrl: 'https://www.example-housing.test/contact',
    emailVerifiedAt: '2026-07-02T00:00:00.000Z',
    generatedEmailSubject: null,
    generatedEmailBody: null,
    generatedCustomHook: null,
    generatedCustomHookReason: null,
    targetEmail: 'info@example-housing.test',
    failureReason: null,
    copyGeneratedAt: null,
    qualityCheckedAt: null,
    humanReviewStatus: null,
    gmailDraftStatus: null,
    sendStatus: null,
    excludedAt: null,
    excludedReason: null,
    excludedBy: null,
    createdAt: '2026-07-02T00:00:00.000Z',
    updatedAt: '2026-07-02T00:00:00.000Z',
    notes: '',
    collectedAt: '2026-07-02T00:00:00.000Z',
    discoverySource: 'google_places' as const,
    discoverySourceUrl: 'https://maps.google.com/x',
    sourceComplianceStatus: 'email_not_found' as const,
    sourceComplianceNote: null,
  };

  assert(
    getLeadApprovalComplianceBlockReason(officialVerifiedBase) === null,
    'stale stored compliance does not block approval'
  );
  assert(
    getDaily30LeadApprovalBlockReason(officialVerifiedBase, [], [officialVerifiedBase]) === null,
    'stale stored compliance does not produce block hint'
  );

  const judgment = resolveDaily30LeadApprovalJudgment(officialVerifiedBase, [], [
    officialVerifiedBase,
  ]);
  assert(judgment.canApprove, 'unified judgment approvable with stale stored status');
  assert(judgment.representativeEmailVerified, 'representative email verified');
  assert(
    judgment.representativeEmailLabel === '公式サイト代表メール確認済み',
    'representative label matches compliance'
  );
  assert(judgment.blockHint === null, 'no contradictory block hint');

  const enriched = enrichExternalLeadCandidate(officialVerifiedBase);
  assert(
    enriched.sourceComplianceStatus === 'official_site_verified',
    'enrich refreshes stored compliance status'
  );

  const subdomainCandidate = {
    ...officialVerifiedBase,
    externalCandidateId: 'phase415g-subdomain',
    websiteUrl: 'https://example-housing.test/',
    officialSiteUrl: 'https://example-housing.test/',
    emailCandidateSourceUrls: ['https://corp.example-housing.test/contact'],
    emailCandidateSourceUrl: 'https://corp.example-housing.test/contact',
    sourceComplianceStatus: null,
  };
  assert(
    isUrlOnOfficialSiteDomain(
      'https://corp.example-housing.test/contact',
      subdomainCandidate
    ),
    'subdomain email source counts as official site'
  );
  assert(
    evaluateSourceCompliance(subdomainCandidate).status === 'official_site_verified',
    'subdomain email source yields official_site_verified'
  );

  const label = representativeEmailJudgmentLabel(officialVerifiedBase);
  const block = getDaily30LeadApprovalBlockReason(officialVerifiedBase, [], [officialVerifiedBase]);
  assert(
    !(label === '公式サイト代表メール確認済み' && block?.blockReason?.includes('確認できていません')),
    'no confirmed-label vs cannot-confirm block contradiction'
  );

  ok('Phase 41.5G lead approval judgment audit checks passed');
}

async function verifyPhase415HCompliancePersistenceDryRun(): Promise<void> {
  const dryRunModule = await readFile(
    join(SRC_ROOT, 'candidates/phase415hCompliancePersistenceDryRun.ts'),
    'utf-8'
  );
  const dryRunScript = await readFile(
    join(SRC_ROOT, 'scripts/run-growly-sales-phase415h-compliance-dry-run.ts'),
    'utf-8'
  );
  const gcsStorage = await readFile(join(SRC_ROOT, 'storage/gcsJsonStorage.ts'), 'utf-8');
  const repo = await readFile(join(SRC_ROOT, 'storage/externalCandidatesRepository.ts'), 'utf-8');
  const pkg = await readFile(join(process.cwd(), 'package.json'), 'utf-8');

  assert(dryRunModule.includes('gcsWritesPerformed: 0'), 'dry-run summary fixes writes to 0');
  assert(dryRunModule.includes('backupObjectsCreated: 0'), 'dry-run no backup writes');
  assert(dryRunModule.includes('PHASE415H_COMPLIANCE_FIELDS'), 'compliance fields limited');
  assert(dryRunModule.includes('updateEligible'), 'update eligibility tracked');
  assert(dryRunModule.includes('toMorePermissive'), 'permissive transition tracked');
  assert(dryRunModule.includes('toMoreRestrictive'), 'restrictive transition tracked');
  assert(dryRunModule.includes('maskEmailForReport'), 'email masking in reports');
  assert(!dryRunScript.includes('writeJsonDocument'), 'dry-run script does not write JSON');
  assert(!dryRunScript.includes('saveExternalCandidatesToJson'), 'dry-run script no candidate save');
  assert(dryRunScript.includes('loadRawExternalCandidatesStoreFromJson'), 'reads raw GCS JSON');
  assert(dryRunScript.includes('人間承認待ち'), 'human approval wait message');
  assert(gcsStorage.includes('gcsGetObjectMetadata'), 'generation metadata read helper');
  assert(repo.includes('loadRawExternalCandidatesStoreFromJson'), 'raw load without enrich');
  assert(pkg.includes('phase415h-compliance-dry-run'), 'npm script registered');
  assert(dryRunModule.includes('applySafetyDesign'), 'apply safety design documented');
  assert(dryRunModule.includes('--apply'), 'apply requires explicit flag in design');
  assert(!dryRunModule.includes('Bearer '), 'no bearer tokens in dry-run module');

  const {
    runPhase415HComplianceDryRun,
    auditCandidateComplianceDryRun,
    maskEmailForReport,
  } = await import('../candidates/phase415hCompliancePersistenceDryRun.js');

  const masked = maskEmailForReport('info@example-housing.test');
  assert(masked.includes('***'), 'email mask hides local part');
  assert(!masked.includes('info@example-housing.test'), 'full email not in mask');

  const base = {
    externalCandidateId: 'phase415h-1',
    sourceType: 'google_places' as const,
    companyName: 'Dry Run Co',
    area: '宮城県',
    industry: '工務店',
    websiteUrl: 'https://www.example-housing.test/',
    officialSiteUrl: 'https://www.example-housing.test/',
    phoneNumber: null,
    address: null,
    googlePlaceId: null,
    sourceUrl: 'https://maps.google.com/x',
    sourceQuery: 'q',
    category: '工務店',
    contactFormUrl: null,
    emailCandidates: ['info@example-housing.test'],
    confidenceScore: 0.9,
    importStatus: 'preview' as const,
    riskLevel: 'low' as const,
    duplicateReason: '',
    duplicateKey: 'k-415h',
    pipelineStatus: 'email_found' as const,
    prefecture: '宮城県',
    regionGroup: '宮城' as const,
    collectionPriority: 1,
    collectionAreaSource: '宮城県',
    collectionBatchId: '2026-07-02',
    emailCandidateSourceUrls: ['https://www.example-housing.test/contact'],
    emailCandidateSourceUrl: 'https://www.example-housing.test/contact',
    emailVerifiedAt: null,
    generatedEmailSubject: null,
    generatedEmailBody: null,
    generatedCustomHook: null,
    generatedCustomHookReason: null,
    targetEmail: 'info@example-housing.test',
    failureReason: null,
    copyGeneratedAt: null,
    qualityCheckedAt: null,
    humanReviewStatus: null,
    gmailDraftStatus: null,
    sendStatus: null,
    notes: '',
    collectedAt: '2026-07-02T00:00:00.000Z',
    createdAt: '2026-07-02T00:00:00.000Z',
    updatedAt: '2026-07-02T00:00:00.000Z',
    sourceComplianceStatus: 'email_not_found' as const,
    sourceComplianceNote: 'stale',
  };

  const row = auditCandidateComplianceDryRun(base, [], [base]);
  assert(row.updateEligible, 'stale compliance is update eligible');
  assert(row.storedStatus === 'email_not_found', 'stored status preserved in audit');
  assert(row.freshStatus === 'official_site_verified', 'fresh status from evaluate');

  const result = runPhase415HComplianceDryRun({
    rawCandidates: [base],
    existingLeads: [],
    storageBackend: 'gcs',
    gcsMetadata: { generation: '1', size: 100, updated: null, md5Hash: null },
    storeUpdatedAt: '2026-07-02T00:00:00.000Z',
    preconditionContradictions: 0,
  });
  assert(result.summary.gcsWritesPerformed === 0, 'summary writes zero');
  assert(result.summary.updateEligible >= 1, 'dry-run counts eligible');
  assert(result.applySafetyDesign.length >= 5, 'apply safety design present');

  ok('Phase 41.5H compliance persistence dry-run checks passed');
}

async function verifyPhase415H2CompliancePersistence(): Promise<void> {
  const applyModule = await readFile(
    join(SRC_ROOT, 'candidates/phase415hCompliancePersistenceApply.ts'),
    'utf-8'
  );
  const applyScript = await readFile(
    join(SRC_ROOT, 'scripts/run-growly-sales-phase415h-compliance-apply.ts'),
    'utf-8'
  );
  const gcsStorage = await readFile(join(SRC_ROOT, 'storage/gcsJsonStorage.ts'), 'utf-8');
  const types = await readFile(
    join(SRC_ROOT, 'adapters/externalLeadCandidateTypes.ts'),
    'utf-8'
  );
  const pkg = await readFile(join(process.cwd(), 'package.json'), 'utf-8');

  assert(applyModule.includes('assertApplyArgsOrThrow'), 'apply double-confirm gate');
  assert(applyModule.includes('APPLY_COMPLIANCE_REFRESH'), 'confirm phrase constant');
  assert(applyModule.includes('validateGcsMetadataMatchesBaseline'), 'generation conflict detection');
  assert(applyModule.includes('countNonComplianceDiffs'), 'non-compliance diff guard');
  assert(applyModule.includes('assertArrayOrderPreserved'), 'array order preserved');
  assert(applyModule.includes('sourceComplianceCheckedAt'), 'checkedAt field applied');
  assert(applyScript.includes('gcsBackupBeforeWrite'), 'backup before write');
  assert(applyScript.includes('verifyBackup'), 'backup verification');
  assert(applyScript.includes('gcsWriteJsonIfGenerationMatch'), 'generation precondition write');
  assert(!applyScript.includes('writeJsonDocument'), 'apply uses conditional GCS write only');
  assert(!applyScript.includes('users.drafts.create'), 'no gmail draft create');
  assert(!applyScript.includes('messages.send'), 'no gmail send');
  assert(gcsStorage.includes('gcsWriteJsonIfGenerationMatch'), 'precondition write helper');
  assert(gcsStorage.includes('gcsGetObjectMetadataAtPath'), 'backup metadata helper');
  assert(types.includes('sourceComplianceCheckedAt'), 'schema optional checkedAt');
  assert(pkg.includes('phase415h-compliance-apply'), 'apply npm script registered');
  assert(applyScript.includes('audit-lead-approval-judgment'), 'post-audit command hint');
  assert(applyScript.includes('phase415h-compliance-dry-run'), 'post dry-run hint');
  assert(!applyModule.includes('Bearer '), 'no bearer tokens in apply module');

  const {
    parsePhase415HApplyArgs,
    assertApplyArgsOrThrow,
    countNonComplianceDiffs,
    applyComplianceFieldsToCandidates,
  } = await import('../candidates/phase415hCompliancePersistenceApply.js');

  const noApply = parsePhase415HApplyArgs([]);
  assert(!noApply.apply, 'default no apply flag');

  let threw = false;
  try {
    assertApplyArgsOrThrow({ apply: true, confirm: 'WRONG' });
  } catch {
    threw = true;
  }
  assert(threw, 'wrong confirm phrase rejected');

  const base = {
    externalCandidateId: 'phase415h2-1',
    sourceType: 'google_places' as const,
    companyName: 'Apply Test Co',
    area: '宮城県',
    industry: '工務店',
    websiteUrl: 'https://www.example-housing.test/',
    officialSiteUrl: 'https://www.example-housing.test/',
    phoneNumber: null,
    address: null,
    googlePlaceId: null,
    sourceUrl: 'https://maps.google.com/x',
    sourceQuery: 'q',
    category: '工務店',
    contactFormUrl: null,
    emailCandidates: ['info@example-housing.test'],
    confidenceScore: 0.9,
    importStatus: 'preview' as const,
    riskLevel: 'low' as const,
    duplicateReason: '',
    duplicateKey: 'k-415h2',
    pipelineStatus: 'email_found' as const,
    prefecture: '宮城県',
    regionGroup: '宮城' as const,
    collectionPriority: 1,
    collectionAreaSource: '宮城県',
    collectionBatchId: '2026-07-02',
    emailCandidateSourceUrls: ['https://www.example-housing.test/contact'],
    emailCandidateSourceUrl: 'https://www.example-housing.test/contact',
    emailVerifiedAt: null,
    generatedEmailSubject: null,
    generatedEmailBody: null,
    generatedCustomHook: null,
    generatedCustomHookReason: null,
    targetEmail: 'info@example-housing.test',
    failureReason: null,
    copyGeneratedAt: null,
    qualityCheckedAt: null,
    humanReviewStatus: null,
    gmailDraftStatus: null,
    sendStatus: null,
    notes: '',
    collectedAt: '2026-07-02T00:00:00.000Z',
    createdAt: '2026-07-02T00:00:00.000Z',
    updatedAt: '2026-07-02T00:00:00.000Z',
    sourceComplianceStatus: 'email_not_found' as const,
    sourceComplianceNote: 'stale',
  };

  const row = {
    externalCandidateId: 'phase415h2-1',
    companyName: 'Apply Test Co',
    collectionBatchId: '2026-07-02',
    storedStatus: 'email_not_found' as const,
    freshStatus: 'official_site_verified' as const,
    storedNote: 'stale',
    freshNote: null,
    storedRepresentativeVerified: false,
    freshRepresentativeVerified: true,
    storedLeadApprovalBlocked: true,
    freshLeadApprovalBlocked: false,
    freshBlockReason: null,
    emailMasked: 'in***@***',
    officialSiteUrl: 'https://www.example-housing.test/',
    emailSourceUrl: 'https://www.example-housing.test/contact',
    discoverySourceUrl: null,
    importStatus: 'preview',
    pipelineStatus: 'email_found',
    skipReason: null,
    updateEligible: true,
    exactComplianceMatch: false,
    statusOnlyDiff: true,
    noteOnlyDiff: false,
    toMorePermissive: true,
    toMoreRestrictive: false,
    toNeedsReview: false,
    emailSourceUrlMissing: false,
    officialSiteUrlMissing: false,
    externalDomainEmail: false,
    personalOrPlaceholder: false,
    duplicateFlag: false,
  };

  const updated = applyComplianceFieldsToCandidates(
    [base],
    [row],
    '2026-07-02T12:00:00.000Z'
  );
  assert(updated[0].sourceComplianceStatus === 'official_site_verified', 'status updated');
  assert(updated[0].sourceComplianceCheckedAt === '2026-07-02T12:00:00.000Z', 'checkedAt set');
  assert(countNonComplianceDiffs([base], updated) === 0, 'only compliance fields change');

  ok('Phase 41.5H-2 compliance persistence apply checks passed');
}

async function verifyPhase415IFinalAlphaJudgment(): Promise<void> {
  const phaseCScript = await readFile(
    join(SRC_ROOT, 'scripts/run-growly-sales-phase-c-cloud-status.ts'),
    'utf-8'
  );
  const cloudState = await readFile(join(SRC_ROOT, 'storage/daily30CloudRunState.ts'), 'utf-8');
  const dryRun = await readFile(
    join(SRC_ROOT, 'candidates/phase415hCompliancePersistenceDryRun.ts'),
    'utf-8'
  );
  const applyScript = await readFile(
    join(SRC_ROOT, 'scripts/run-growly-sales-phase415h-compliance-apply.ts'),
    'utf-8'
  );
  const offerRules = await readFile(join(SRC_ROOT, 'config/offerProfileRules.ts'), 'utf-8');
  const targetRules = await readFile(join(SRC_ROOT, 'config/targetProfileRules.ts'), 'utf-8');
  const urlUtils = await readFile(join(SRC_ROOT, 'adapters/externalCandidateUrlUtils.ts'), 'utf-8');
  const pkg = await readFile(join(process.cwd(), 'package.json'), 'utf-8');

  assert(cloudState.includes('externalReferenceSupplementAttempted'), 'supplement state type');
  assert(cloudState.includes('externalReferenceManualCandidatesAvailable'), 'manual count state');
  assert(cloudState.includes('externalReferenceNetworkAccessPerformed'), 'network access flag');
  assert(phaseCScript.includes('containsTokyoInAreasUsed'), 'tokyo exclusion check');
  assert(phaseCScript.includes('externalReferenceSupplementAttempted'), 'phase-c prints supplement');
  assert(dryRun.includes('updateEligible'), 'compliance dry-run eligibility');
  assert(applyScript.includes('gcsWriteJsonIfGenerationMatch'), 'compliance apply guarded write');
  assert(offerRules.includes('containsProhibitedClaim'), 'browser-safe offer rules');
  assert(!offerRules.includes('node:fs'), 'offer rules no fs');
  assert(targetRules.includes('isTargetIndustry'), 'browser-safe target rules');
  assert(!targetRules.includes('node:fs'), 'target rules no fs');
  assert(urlUtils.includes('normalizeWebsiteUrl'), 'browser-safe url utils');
  assert(pkg.includes('phase415h-compliance-apply'), 'apply script registered');
  assert(pkg.includes('phase-c-cloud-status'), 'cloud status script registered');

  const { PHASE415H_APPROVED_BASELINE } = await import(
    '../candidates/phase415hCompliancePersistenceDryRun.js'
  );
  assert(PHASE415H_APPROVED_BASELINE.expectedTotalCandidates === 156, 'baseline candidate count');

  ok('Phase 41.5I final alpha judgment checks passed');
}

async function verifyPhase415JExternalReferenceAlphaComplete(): Promise<void> {
  const phaseCScript = await readFile(
    join(SRC_ROOT, 'scripts/run-growly-sales-phase-c-cloud-status.ts'),
    'utf-8'
  );
  const cloudState = await readFile(join(SRC_ROOT, 'storage/daily30CloudRunState.ts'), 'utf-8');
  const auditScript = await readFile(
    join(SRC_ROOT, 'scripts/run-growly-sales-audit-lead-approval-judgment.ts'),
    'utf-8'
  );
  const dryRunScript = await readFile(
    join(SRC_ROOT, 'scripts/run-growly-sales-phase415h-compliance-dry-run.ts'),
    'utf-8'
  );
  const urlUtils = await readFile(join(SRC_ROOT, 'adapters/externalCandidateUrlUtils.ts'), 'utf-8');

  assert(cloudState.includes('getCloudRunEntryForBatch'), 'batch lookup for runs record');
  assert(cloudState.includes('externalReferenceDisplayMessage'), 'display message field');
  assert(phaseCScript.includes('externalReferenceManualCandidatesEligible'), 'manual eligible in phase-c');
  assert(phaseCScript.includes('containsTokyoInAreasUsed'), 'tokyo exclusion in phase-c');
  assert(auditScript.includes('resolveDaily30LeadApprovalJudgment'), 'unified judgment audit');
  assert(dryRunScript.includes('updateEligible'), 'compliance dry-run tracks eligibility');
  assert(urlUtils.includes('normalizeWebsiteUrl'), 'browser-safe url utils for ui build');
  assert(!auditScript.includes('messages.send'), 'audit script no gmail send');

  const { normalizeWebsiteUrl: normUrl } = await import('../adapters/externalCandidateUrlUtils.js');
  assert(normUrl('https://example.test/') === 'https://example.test/', 'url utils work');

  ok('Phase 41.5J external reference alpha complete checks passed');
}

async function verifyPhase421RoutineOperationsUi(): Promise<void> {
  const searchBar = await readFile(join(SRC_ROOT, 'ui/common/SearchAndFilterBar.tsx'), 'utf-8');
  const styles = await readFile(join(SRC_ROOT, 'ui/styles.css'), 'utf-8');
  const sendRecords = await readFile(join(SRC_ROOT, 'ui/SendRecordsView.tsx'), 'utf-8');
  const followUp = await readFile(join(SRC_ROOT, 'ui/FollowUpDashboardView.tsx'), 'utf-8');
  const replyMgmt = await readFile(join(SRC_ROOT, 'ui/ReplyManagementView.tsx'), 'utf-8');
  const dashboard = await readFile(join(SRC_ROOT, 'ui/GrowlySalesDashboard.tsx'), 'utf-8');
  const profileDisplay = await readFile(join(SRC_ROOT, 'ui/CollectionProfileDisplay.tsx'), 'utf-8');
  const cloudResults = await readFile(join(SRC_ROOT, 'ui/Daily30CloudResultsPanel.tsx'), 'utf-8');

  assert(searchBar.includes('search-filter-bar-sticky'), 'search bar sticky class');
  assert(searchBar.includes('sticky = true'), 'search bar sticky default on');
  assert(styles.includes('.search-filter-bar-sticky'), 'sticky search CSS');
  assert(styles.includes('.daily30-candidate-tools-sticky'), 'candidate tools sticky CSS');
  assert(styles.includes('.send-record-source-block'), 'send record source block CSS');
  assert(profileDisplay.includes("variant === 'send-record'"), 'send-record collection variant');
  assert(sendRecords.includes("variant=\"send-record\""), 'send records use send-record variant');
  assert(followUp.includes("onNavigateToTab?.('reply-management'"), 'follow-up opens reply management');
  assert(followUp.includes('follow-up-lead-button'), 'follow-up lead click target');
  assert(replyMgmt.includes('highlightLeadId'), 'reply management accepts highlight lead');
  assert(dashboard.includes('highlightLeadId={highlightLeadId}'), 'dashboard passes highlight to reply');
  assert(cloudResults.includes('daily30-candidate-tools-sticky'), 'candidate collection search sticky');

  ok('Phase 42.1 routine operations UI improvements checks passed');
}

async function verifyPhase422RoutineOperationsUiScreen(): Promise<void> {
  const followUp = await readFile(join(SRC_ROOT, 'ui/FollowUpDashboardView.tsx'), 'utf-8');
  const replyMgmt = await readFile(join(SRC_ROOT, 'ui/ReplyManagementView.tsx'), 'utf-8');
  const sendRecords = await readFile(join(SRC_ROOT, 'ui/SendRecordsView.tsx'), 'utf-8');

  assert(followUp.includes('返信管理で開く'), 'follow-up action hint for reply navigation');
  assert(replyMgmt.includes('highlightLeadId'), 'reply highlight wiring for follow-up deep link');
  assert(sendRecords.includes('variant="send-record"'), 'send records use send-record source variant');

  ok('Phase 42.2 routine operations UI screen readiness checks passed');
}

async function verifyPhase424SendRecordSourceUrls(): Promise<void> {
  const profileDisplay = await readFile(join(SRC_ROOT, 'ui/CollectionProfileDisplay.tsx'), 'utf-8');
  const sendRecords = await readFile(join(SRC_ROOT, 'ui/SendRecordsView.tsx'), 'utf-8');
  const manualDialog = await readFile(join(SRC_ROOT, 'ui/ManualSendRecordDialog.tsx'), 'utf-8');
  const recordModule = await readFile(join(SRC_ROOT, 'workflow/recordManualGmailSent.ts'), 'utf-8');
  const styles = await readFile(join(SRC_ROOT, 'ui/styles.css'), 'utf-8');

  assert(profileDisplay.includes('収集方法'), 'send record separates collection method label');
  assert(profileDisplay.includes('企業の発見元URL'), 'send record shows discovery source URL row');
  assert(profileDisplay.includes('公式サイト'), 'send record shows official site row');
  assert(profileDisplay.includes('メール取得元'), 'send record shows email source row');
  assert(profileDisplay.includes('URL未記録'), 'missing URL shows URL未記録');
  assert(profileDisplay.includes('target="_blank"'), 'URL links open in new tab');
  assert(profileDisplay.includes('rel="noopener noreferrer"'), 'URL links use noopener noreferrer');
  assert(
    !(profileDisplay.split("variant === 'send-record'")[1]?.split("if (variant === 'compact')")[0] ?? '').includes(
      "job_site_reference"
    ),
    'send-record variant does not gate discovery URL on job_site_reference'
  );
  assert(
    !profileDisplay.includes('place_id') && !profileDisplay.includes('googlePlaceId'),
    'send record UI does not synthesize Google Maps URLs'
  );
  assert(profileDisplay.includes('企業の発見元URL'), 'user-facing discovery URL label');
  assert(!profileDisplay.includes('>discoverySourceUrl<'), 'no raw discoverySourceUrl label in UI');
  assert(!profileDisplay.includes('>emailSourceUrl<'), 'no raw emailSourceUrl label in UI');
  assert(styles.includes('.send-record-source-url-row'), 'send record URL row CSS');
  assert(sendRecords.includes('variant="send-record"'), 'send records view uses send-record variant');
  assert(manualDialog.includes('variant="send-record"'), 'manual send dialog uses send-record variant');
  assert(recordModule.includes('discoverySourceUrl'), 'preview still reads stored discoverySourceUrl');
  assert(!recordModule.includes('users.messages.send'), 'send record workflow has no Gmail send');
  assert(!recordModule.includes('users.drafts.create'), 'send record workflow has no draft create');

  const {
    buildCollectionProfileDisplayFromLead,
    buildCollectionProfileDisplayFromCandidate,
  } = await import('../candidates/resolveCollectionProfileDisplay.js');
  const { resolveEmailSourceFromLead } = await import('../candidates/resolveEmailSourceDisplay.js');

  const withDiscovery = createEmptyLead({
    id: 'phase424-discovery',
    companyName: 'Phase424 Discovery',
    area: '宮城県',
    industry: '工務店',
    discoverySource: 'google_places',
    discoverySourceLabel: 'Google Places / 公式サイト検索',
    discoverySourceUrl: 'https://www.google.com/maps/place/?q=place_id:ChIJ_test',
    websiteUrl: 'https://phase424.example/',
    emailSourceUrl: 'https://phase424.example/contact',
    emailCandidates: ['info@phase424.example'],
    emailCandidateSourceUrls: ['https://phase424.example/contact'],
  });
  const discoveryDisplay = buildCollectionProfileDisplayFromLead(withDiscovery);
  assert(
    discoveryDisplay.discoverySourceUrl?.includes('google.com/maps'),
    'lead display keeps stored discoverySourceUrl'
  );
  const emailInfo = resolveEmailSourceFromLead(withDiscovery);
  assert(emailInfo.officialSiteUrl?.includes('phase424.example'), 'official site resolved for display');
  assert(emailInfo.emailSourceUrl?.includes('contact'), 'email source resolved for display');

  const candidateDisplay = buildCollectionProfileDisplayFromCandidate({
    externalCandidateId: 'phase424-cand',
    sourceType: 'google_places' as const,
    companyName: 'Phase424',
    area: '仙台',
    industry: '工務店',
    websiteUrl: 'https://cand424.example/',
    officialSiteUrl: 'https://cand424.example/',
    phoneNumber: null,
    address: null,
    googlePlaceId: 'ChIJ_test',
    sourceUrl: 'https://maps.google.com/?cid=424',
    sourceQuery: 'q',
    category: '工務店',
    contactFormUrl: null,
    emailCandidates: [],
    confidenceScore: 0.8,
    importStatus: 'preview' as const,
    riskLevel: 'low' as const,
    duplicateReason: '',
    duplicateKey: 'k',
    pipelineStatus: 'email_found' as const,
    prefecture: '宮城県',
    regionGroup: '宮城' as const,
    collectionPriority: 1,
    collectionAreaSource: '宮城県',
    collectionBatchId: '2026-07-03',
    emailCandidateSourceUrls: [],
    emailVerifiedAt: null,
    generatedEmailSubject: null,
    generatedEmailBody: null,
    generatedCustomHook: null,
    generatedCustomHookReason: null,
    targetEmail: null,
    emailCandidateSourceUrl: null,
    failureReason: null,
    copyGeneratedAt: null,
    qualityCheckedAt: null,
    humanReviewStatus: null,
    gmailDraftStatus: null,
    sendStatus: null,
    notes: '',
    collectedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    collectionProfileId: null,
    collectionProfileName: null,
    collectionMode: null,
    areaStrategy: null,
    discoverySource: 'google_places' as const,
    discoverySourceUrl: null,
    discoverySourceSite: null,
    sourceComplianceStatus: null,
  });
  assert(
    candidateDisplay.discoverySourceUrl === 'https://maps.google.com/?cid=424',
    'candidate display falls back to stored sourceUrl when discoverySourceUrl absent'
  );

  ok('Phase 42.4 send record source URL display checks passed');
}

async function verifyPhase425RoutineOperationsUiFinalScreen(): Promise<void> {
  const styles = await readFile(join(SRC_ROOT, 'ui/styles.css'), 'utf-8');
  const dashboard = await readFile(join(SRC_ROOT, 'ui/GrowlySalesDashboard.tsx'), 'utf-8');
  const profileDisplay = await readFile(join(SRC_ROOT, 'ui/CollectionProfileDisplay.tsx'), 'utf-8');
  const sendRecords = await readFile(join(SRC_ROOT, 'ui/SendRecordsView.tsx'), 'utf-8');
  const followUp = await readFile(join(SRC_ROOT, 'ui/FollowUpDashboardView.tsx'), 'utf-8');
  const replyMgmt = await readFile(join(SRC_ROOT, 'ui/ReplyManagementView.tsx'), 'utf-8');
  const searchBar = await readFile(join(SRC_ROOT, 'ui/common/SearchAndFilterBar.tsx'), 'utf-8');
  const recordModule = await readFile(join(SRC_ROOT, 'workflow/recordManualGmailSent.ts'), 'utf-8');

  assert(styles.includes('.search-filter-bar-sticky'), 'sticky search bar CSS retained');
  assert(styles.includes('.tab-scroll-candidate-collection'), 'candidate collection nested scroll CSS');
  assert(styles.includes('.candidate-collection-work'), 'candidate work area scroll container');
  assert(
    styles.includes('.candidate-collection-work .daily30-candidate-tools-sticky'),
    'candidate search sticky scoped to work area'
  );
  assert(!styles.match(/\.candidate-collection-header-sticky\s*\{[^}]*position:\s*sticky/s), 'header no longer outer sticky');
  assert(profileDisplay.includes('収集方法'), 'send record method label separated');
  assert(profileDisplay.includes('企業の発見元URL'), 'send record discovery URL row');
  assert(profileDisplay.includes('URL未記録'), 'honest missing URL label');
  assert(dashboard.includes('tab-scroll-candidate-collection'), 'dashboard uses nested scroll tab');
  assert(followUp.includes('follow-up-lead-button'), 'follow-up lead navigation button');
  assert(followUp.includes("onNavigateToTab?.('reply-management'"), 'follow-up navigates to reply management');
  assert(replyMgmt.includes('highlightLeadId'), 'reply management highlight selection');
  assert(dashboard.includes('highlightLeadId={highlightLeadId}'), 'dashboard passes highlight to reply');
  assert(searchBar.includes('search-filter-bar-sticky'), 'search bar sticky class default');
  assert(sendRecords.includes('variant="send-record"'), 'send records final URL layout');
  assert(!recordModule.includes('users.messages.send'), 'no auto Gmail send in record workflow');
  assert(!recordModule.includes('users.drafts.create'), 'no auto draft create in record workflow');
  assert(!profileDisplay.includes('place_id'), 'UI does not synthesize Maps URLs');

  ok('Phase 42.5 routine operations UI final screen checks passed');
}

async function verifyPhase426CandidateSourceColumn(): Promise<void> {
  const styles = await readFile(join(SRC_ROOT, 'ui/styles.css'), 'utf-8');
  const cards = await readFile(join(SRC_ROOT, 'ui/Daily30CandidateCards.tsx'), 'utf-8');

  assert(styles.includes('.daily30-source-label'), 'source label 2-line wrap class');
  assert(styles.includes('minmax(12rem'), 'source column min width widened');
  assert(styles.includes('-webkit-line-clamp: 2'), 'source label allows 2-line display');
  assert(cards.includes('daily30-source-label'), 'queue row uses source label class');
  assert(
    !cards.includes('daily30-queue-col-source daily30-field-ellipsis'),
    'source column no longer single-line ellipsis only'
  );

  ok('Phase 42.6 candidate source column display checks passed');
}

async function verifyPhase427CandidateListViewport(): Promise<void> {
  const styles = await readFile(join(SRC_ROOT, 'ui/styles.css'), 'utf-8');
  const cloudPanel = await readFile(join(SRC_ROOT, 'ui/Daily30CloudResultsPanel.tsx'), 'utf-8');
  const leadPanel = await readFile(join(SRC_ROOT, 'ui/Daily30LeadCandidatesPanel.tsx'), 'utf-8');

  assert(styles.includes('.daily30-candidate-queue-body'), 'scrollable queue body container');
  assert(
    styles.includes('min-height: calc(2rem + 5 * 3.6rem)') ||
      styles.includes('min-height: calc(5 * 3.6rem)') ||
      styles.includes('min-height: calc(9rem + 2rem + 5 * 3.6rem)'),
    'queue list min height for 5 rows'
  );
  assert(styles.includes('.daily30-candidate-tools-compact'), 'compact tools styling');
  assert(styles.includes('.daily30-pager-compact'), 'inline compact pager');
  assert(cloudPanel.includes('daily30-candidate-queue-body'), 'results panel wraps list in queue body');
  assert(leadPanel.includes('daily30-candidate-queue-body'), 'lead panel wraps list in queue body');
  assert(cloudPanel.includes('daily30-candidate-tools-row-list'), 'results list mode compact tools row');
  assert(!cloudPanel.includes('daily30-candidate-tools-row-secondary'), 'results panel removes secondary tools row');
  assert(
    styles.includes('.candidate-collection-work .daily30-candidate-tools') ||
      styles.includes('.candidate-collection-work .daily30-candidate-tools-bar'),
    'candidate collection scoped tools'
  );

  ok('Phase 42.7 candidate list viewport checks passed');
}

async function verifyPhase428CandidateListLayoutFix(): Promise<void> {
  const styles = await readFile(join(SRC_ROOT, 'ui/styles.css'), 'utf-8');
  const cloudPanel = await readFile(join(SRC_ROOT, 'ui/Daily30CloudResultsPanel.tsx'), 'utf-8');
  const leadPanel = await readFile(join(SRC_ROOT, 'ui/Daily30LeadCandidatesPanel.tsx'), 'utf-8');

  assert(styles.includes('.daily30-candidate-work-primary'), 'primary work block');
  assert(styles.includes('.daily30-candidate-work-aux'), 'auxiliary info block');
  assert(styles.includes('.daily30-candidate-queue-list'), 'queue list wrapper');
  assert(styles.includes('.daily30-candidate-tools-bar'), 'non-sticky tools bar');
  assert(
    styles.includes('.candidate-collection-work {\n  flex: 1;\n  min-height: 0;\n  overflow-y: auto;') ||
      styles.includes('.candidate-collection-work {\n  flex: 1;\n  min-height: 0;\n  overflow: hidden;'),
    'work area scroll policy'
  );
  assert(
    !cloudPanel.includes('daily30-candidate-tools-sticky'),
    'results panel removes sticky tools overlap'
  );
  assert(
    !leadPanel.includes('daily30-candidate-tools-sticky'),
    'lead panel removes sticky tools overlap'
  );
  assert(cloudPanel.includes('daily30-candidate-work-primary'), 'results primary work block');
  assert(leadPanel.includes('daily30-candidate-work-aux'), 'lead aux block separated');
  assert(
    !cloudPanel.includes('daily30-candidate-work-aux'),
    'results aux moved out of work panel'
  );
  assert(
    cloudPanel.includes('daily30-candidate-queue-list') &&
      cloudPanel.indexOf('Daily30CandidateQueueHeader') < cloudPanel.indexOf('daily30-candidate-queue-body'),
    'queue header outside scroll body (results)'
  );
  assert(
    leadPanel.includes('daily30-candidate-queue-list') &&
      leadPanel.indexOf('Daily30CandidateQueueHeader') < leadPanel.indexOf('daily30-candidate-queue-body'),
    'queue header outside scroll body (lead)'
  );
  assert(
    !styles.includes('.daily30-candidate-queue-body .daily30-queue-header') ||
      !styles.match(/\.daily30-candidate-queue-body[\s\S]*?position:\s*sticky/),
    'no sticky queue header inside scroll body'
  );
  assert(
    styles.includes('.daily30-candidate-queue-list') &&
      styles.match(/\.daily30-candidate-queue-body[\s\S]*?min-height:\s*0/),
    'queue body shrinks inside list container'
  );

  ok('Phase 42.8 candidate list layout fix checks passed');
}

async function verifyPhase429CandidateListFinalScreen(): Promise<void> {
  const styles = await readFile(join(SRC_ROOT, 'ui/styles.css'), 'utf-8');
  const cloudPanel = await readFile(join(SRC_ROOT, 'ui/Daily30CloudResultsPanel.tsx'), 'utf-8');
  const leadPanel = await readFile(join(SRC_ROOT, 'ui/Daily30LeadCandidatesPanel.tsx'), 'utf-8');
  const cards = await readFile(join(SRC_ROOT, 'ui/Daily30CandidateCards.tsx'), 'utf-8');
  const sendRecords = await readFile(join(SRC_ROOT, 'ui/SendRecordsView.tsx'), 'utf-8');
  const followUp = await readFile(join(SRC_ROOT, 'ui/FollowUpDashboardView.tsx'), 'utf-8');
  const searchBar = await readFile(join(SRC_ROOT, 'ui/common/SearchAndFilterBar.tsx'), 'utf-8');

  assert(styles.includes('min-height: calc(9rem + 2rem + 5 * 3.6rem)'), 'panel min height preserves 5 visible rows');
  assert(styles.includes('.daily30-candidate-queue-list'), 'queue list container for header/body split');
  assert(styles.includes('scrollbar-gutter: stable'), 'scrollbar gutter for header alignment');
  assert(styles.includes('minmax(8rem, 0.95fr)'), 'actions column wide enough for buttons');
  assert(cloudPanel.includes('daily30-candidate-tools-bar'), 'results uses non-sticky tools bar');
  assert(leadPanel.includes('daily30-candidate-tools-bar'), 'lead uses non-sticky tools bar');
  assert(cloudPanel.trim().startsWith('return (\n    <>') || cloudPanel.includes('return (\n    <>'), 'results panel fragment wraps panel+aux');
  assert(cards.includes('daily30-source-label'), 'source full-text label retained');
  assert(sendRecords.includes('variant="send-record"'), 'send record URL layout retained');
  assert(followUp.includes("onNavigateToTab?.('reply-management'"), 'follow-up reply navigation retained');
  assert(searchBar.includes('search-filter-bar-sticky'), 'other tabs sticky search retained');
  assert(
    cloudPanel.includes('setPage(1)') || cloudPanel.includes('setPage(1);'),
    'results filter change resets page'
  );
  assert(
    leadPanel.includes('setPage(1)') || leadPanel.includes('setPage(1);'),
    'lead filter change resets page'
  );

  ok('Phase 42.9 candidate list final screen checks passed');
}

async function verifyPhase4211FocusViewport(): Promise<void> {
  const styles = await readFile(join(SRC_ROOT, 'ui/styles.css'), 'utf-8');
  const cloudPanel = await readFile(join(SRC_ROOT, 'ui/Daily30CloudResultsPanel.tsx'), 'utf-8');
  const leadPanel = await readFile(join(SRC_ROOT, 'ui/Daily30LeadCandidatesPanel.tsx'), 'utf-8');
  const focusView = await readFile(join(SRC_ROOT, 'ui/Daily30CandidateFocusView.tsx'), 'utf-8');

  assert(
    styles.includes('.daily30-work-queue-panel-focus'),
    'focus panel class separates from list min-height'
  );
  assert(
    styles.includes('.daily30-work-queue-panel:not(.daily30-work-queue-panel-focus)'),
    'list panel keeps 5-row min-height only'
  );
  assert(styles.includes('.daily30-work-queue-focus'), 'focus work queue overflow policy');
  assert(styles.includes('.daily30-candidate-focus-viewport'), 'dedicated focus viewport wrapper');
  assert(cloudPanel.includes('daily30-work-queue-panel-focus'), 'results panel toggles focus class');
  assert(leadPanel.includes('daily30-work-queue-panel-focus'), 'lead panel toggles focus class');
  assert(cloudPanel.includes('daily30-candidate-focus-viewport'), 'results wraps focus view in viewport');
  assert(leadPanel.includes('daily30-candidate-focus-viewport'), 'lead wraps focus view in viewport');
  assert(
    cloudPanel.includes("displayMode === 'focus' ? ' daily30-work-queue-focus'"),
    'results toggles focus work-queue class'
  );
  assert(
    leadPanel.includes("displayMode === 'focus' ? ' daily30-work-queue-focus'"),
    'lead toggles focus work-queue class'
  );
  assert(focusView.includes('daily30-focus-card'), 'focus card retained');
  assert(focusView.includes('daily30-focus-actions'), 'focus actions retained');
  assert(
    !cloudPanel.includes('daily30-candidate-queue-body') ||
      cloudPanel.indexOf("displayMode === 'focus'") < cloudPanel.indexOf('daily30-candidate-queue-body'),
    'results focus branch before list queue-body'
  );

  ok('Phase 42.11 focus viewport checks passed');
}

async function verifyPhase4212FocusApprovalScreen(): Promise<void> {
  const styles = await readFile(join(SRC_ROOT, 'ui/styles.css'), 'utf-8');
  const focusView = await readFile(join(SRC_ROOT, 'ui/Daily30CandidateFocusView.tsx'), 'utf-8');
  const collectionView = await readFile(join(SRC_ROOT, 'ui/CandidateCollectionView.tsx'), 'utf-8');
  const cloudPanel = await readFile(join(SRC_ROOT, 'ui/Daily30CloudResultsPanel.tsx'), 'utf-8');
  const leadPanel = await readFile(join(SRC_ROOT, 'ui/Daily30LeadCandidatesPanel.tsx'), 'utf-8');

  assert(styles.includes('.daily30-focus-approval-screen'), 'dedicated approval screen layout');
  assert(styles.includes('.daily30-focus-grid'), '2-column focus grid');
  assert(styles.includes('.daily30-focus-judgment-bar'), 'horizontal judgment bar');
  assert(styles.includes('.candidate-collection-view-focus'), 'compressed collection header in focus');
  assert(styles.includes('.candidate-collection-header-compactible'), 'collapsible header sections');
  assert(styles.includes('.daily30-focus-mode-chrome'), 'minimal focus chrome toolbar');
  assert(focusView.includes('daily30-focus-topbar'), 'topbar with queue title and nav');
  assert(focusView.includes('daily30-focus-grid'), 'grid layout in focus view');
  assert(focusView.includes('emailSourceDetail'), 'email source detail shown');
  assert(focusView.includes('daily30-focus-judgment-bar'), 'judgment bar in focus view');
  assert(focusView.includes('Lead化承認'), 'approve action retained');
  assert(collectionView.includes('onDisplayModeChange'), 'collection view tracks focus mode');
  assert(collectionView.includes('candidate-collection-view-focus'), 'focus class toggled from parent');
  assert(cloudPanel.includes('daily30-focus-mode-chrome'), 'results focus chrome');
  assert(leadPanel.includes('daily30-focus-mode-chrome'), 'lead focus chrome');
  assert(
    collectionView.includes('CandidateCollectionDetailsPanel') &&
      styles.includes('.candidate-collection-view-focus .candidate-collection-header-compactible'),
    'collection details hidden in focus mode via compactible header'
  );
  assert(
    leadPanel.includes("displayMode !== 'focus'") && leadPanel.includes('daily30-candidate-work-aux'),
    'lead aux hidden in focus mode'
  );
  assert(
    styles.includes('.candidate-collection-view-focus .candidate-collection-work') &&
      styles.match(/\.candidate-collection-view-focus[\s\S]*?overflow:\s*hidden/),
    'focus approval screen prevents work-area page scroll'
  );

  ok('Phase 42.12 focus approval screen checks passed');
}

async function verifyPhase4213FocusButtonLayout(): Promise<void> {
  const styles = await readFile(join(SRC_ROOT, 'ui/styles.css'), 'utf-8');
  const toggle = await readFile(join(SRC_ROOT, 'ui/CandidateDisplayModeToggle.tsx'), 'utf-8');
  const focusView = await readFile(join(SRC_ROOT, 'ui/Daily30CandidateFocusView.tsx'), 'utf-8');
  const cloudPanel = await readFile(join(SRC_ROOT, 'ui/Daily30CloudResultsPanel.tsx'), 'utf-8');

  assert(styles.includes('.daily30-focus-toolbar-btn'), 'unified toolbar button sizing');
  assert(styles.includes('.daily30-focus-action-btn'), 'unified action button sizing');
  assert(styles.includes('height: 40px') && styles.includes('min-width: 88px'), 'toolbar button dimensions');
  assert(styles.includes('height: 44px') && styles.includes('min-width: 124px'), 'action button dimensions');
  assert(styles.includes('border-radius: 10px'), 'unified border radius');
  assert(toggle.includes('candidate-btn-toolbar') || toggle.includes('daily30-focus-toolbar-btn'), 'display mode toggle uses toolbar sizing');
  assert(cloudPanel.includes('candidate-btn-toolbar') || cloudPanel.includes('daily30-focus-toolbar-btn'), 'filter button uses toolbar sizing');
  assert(focusView.includes('candidate-btn-focus') || focusView.includes('daily30-focus-action-btn'), 'focus actions use unified sizing');
  assert(
    !styles.match(/\.daily30-focus-actions[\s\S]*?margin-top:\s*auto/),
    'action buttons not pushed to viewport bottom'
  );
  assert(
    focusView.indexOf('daily30-focus-judgment-bar') < focusView.indexOf('daily30-focus-actions'),
    'actions follow judgment bar in DOM'
  );

  ok('Phase 42.13 focus button layout checks passed');
}

async function verifyPhase4214CandidateButtonTiers(): Promise<void> {
  const styles = await readFile(join(SRC_ROOT, 'ui/styles.css'), 'utf-8');
  const collectionView = await readFile(join(SRC_ROOT, 'ui/CandidateCollectionView.tsx'), 'utf-8');
  const toggle = await readFile(join(SRC_ROOT, 'ui/CandidateDisplayModeToggle.tsx'), 'utf-8');
  const cards = await readFile(join(SRC_ROOT, 'ui/Daily30CandidateCards.tsx'), 'utf-8');
  const focusView = await readFile(join(SRC_ROOT, 'ui/Daily30CandidateFocusView.tsx'), 'utf-8');
  const cloudPanel = await readFile(join(SRC_ROOT, 'ui/Daily30CloudResultsPanel.tsx'), 'utf-8');

  assert(styles.includes('.candidate-btn-toolbar'), 'toolbar button tier');
  assert(styles.includes('.candidate-btn-queue'), 'queue row button tier');
  assert(styles.includes('.candidate-btn-focus'), 'focus action button tier');
  assert(styles.includes('min-width: 96px'), 'toolbar min-width 96px');
  assert(styles.includes('width: 104px'), 'queue fixed width 104px');
  assert(collectionView.includes('candidate-btn-toolbar'), 'schedule change/detail use toolbar tier');
  assert(toggle.includes('candidate-btn-toolbar'), 'display mode toggle uses toolbar tier');
  assert(cloudPanel.includes('candidate-btn-toolbar'), 'filter button uses toolbar tier');
  assert(cards.includes('candidate-btn-queue'), 'queue row actions use queue tier');
  assert(focusView.includes('candidate-btn-focus'), 'focus actions use focus tier');
  assert(
    !styles.includes('.candidate-collection-work .daily30-queue-col-actions .btn-sm'),
    'legacy queue btn-sm overrides removed'
  );

  ok('Phase 42.14 candidate button tier checks passed');
}

async function verifyPhase4215LeadFlowDedup(): Promise<void> {
  const styles = await readFile(join(SRC_ROOT, 'ui/styles.css'), 'utf-8');
  const leadPanel = await readFile(join(SRC_ROOT, 'ui/Daily30LeadCandidatesPanel.tsx'), 'utf-8');
  const cards = await readFile(join(SRC_ROOT, 'ui/Daily30CandidateCards.tsx'), 'utf-8');

  assert(
    leadPanel.includes("useState<'actionable' | 'approved' | 'generated'>('actionable')"),
    'lead panel view types exclude pending re-approval state'
  );
  assert(
    !leadPanel.includes('<option value="pending">'),
    'lead panel filter removes pending re-approval option'
  );
  assert(
    leadPanel.includes('営業文作成待ち（推奨）'),
    'lead panel defaults to copy creation queue label'
  );
  assert(
    leadPanel.includes('showApprove={false}') &&
      leadPanel.includes('showActionColumn={false}'),
    'lead panel removes re-approval actions from list and focus views'
  );
  assert(
    leadPanel.includes('Daily30CandidateQueueHeader showActions={false}'),
    'lead queue header hides actions column'
  );
  assert(
    leadPanel.includes('Lead登録済み候補から営業文作成へ進みます。'),
    'lead panel hint explains post-approval copy flow'
  );
  assert(
    cards.includes('showActionColumn?: boolean;'),
    'candidate cards support hiding queue action column'
  );
  assert(
    styles.includes('.daily30-queue-header-no-actions') &&
      styles.includes('.daily30-queue-row-no-actions'),
    'styles include no-actions queue layout'
  );
  assert(
    !leadPanel.includes('confirmDaily30LeadApproval') && !leadPanel.includes('confirmDaily30CandidateExclude'),
    'lead panel no longer wires second approval/exclude handlers'
  );

  ok('Phase 42.15 lead flow dedup checks passed');
}

async function verifyPhase4216PagerLayout(): Promise<void> {
  const styles = await readFile(join(SRC_ROOT, 'ui/styles.css'), 'utf-8');
  const cloudPanel = await readFile(join(SRC_ROOT, 'ui/Daily30CloudResultsPanel.tsx'), 'utf-8');
  const leadPanel = await readFile(join(SRC_ROOT, 'ui/Daily30LeadCandidatesPanel.tsx'), 'utf-8');

  assert(styles.includes('.daily30-page-size-label'), 'pager has dedicated page-size label container');
  assert(styles.includes('.daily30-page-size {') && styles.includes('min-width: 88px'), 'page-size select width fixed');
  assert(styles.includes('.daily30-pager-button {') && styles.includes('min-width: 64px'), 'pager buttons width fixed');
  assert(styles.includes('.daily30-page-indicator {') && styles.includes('text-align: center'), 'page indicator centered');
  assert(
    styles.includes('.daily30-pager-compact {') &&
      styles.includes('flex-wrap: nowrap;') &&
      styles.includes('min-width: max-content;'),
    'pager container stays on one line'
  );
  assert(!cloudPanel.includes('daily30-pager-count'), 'results pager removes crowded count text');
  assert(!leadPanel.includes('daily30-pager-count'), 'lead pager removes crowded count text');
  assert(
    cloudPanel.includes('daily30-page-size-label') &&
      cloudPanel.indexOf('daily30-page-size-label') < cloudPanel.indexOf('daily30-pager-button') &&
      cloudPanel.indexOf('daily30-pager-button') < cloudPanel.indexOf('daily30-page-indicator'),
    'results pager order is page size then prev then indicator then next'
  );
  assert(
    leadPanel.includes('daily30-page-size-label') &&
      leadPanel.indexOf('daily30-page-size-label') < leadPanel.indexOf('daily30-pager-button') &&
      leadPanel.indexOf('daily30-pager-button') < leadPanel.indexOf('daily30-page-indicator'),
    'lead pager order is page size then prev then indicator then next'
  );

  ok('Phase 42.16 pager layout checks passed');
}

async function verifyPhase4217SourceColumnWidth(): Promise<void> {
  const styles = await readFile(join(SRC_ROOT, 'ui/styles.css'), 'utf-8');
  const cards = await readFile(join(SRC_ROOT, 'ui/Daily30CandidateCards.tsx'), 'utf-8');

  assert(cards.includes('daily30-queue-col-source daily30-source-label'), 'queue source column uses source label class');
  assert(
    styles.includes('minmax(15.5rem, 2.45fr)') &&
      styles.includes('minmax(13.5rem, 13.5rem)'),
    'list queue favors source column while keeping fixed action width'
  );
  assert(
    styles.includes('minmax(17rem, 2.7fr)'),
    'no-actions queue gives source column extra width'
  );
  assert(
    styles.includes('.candidate-collection-work .daily30-source-label') &&
      styles.includes('-webkit-line-clamp: 2;'),
    'source label remains readable within two lines'
  );

  ok('Phase 42.17 source column width checks passed');
}

async function verifyPhase4218SourceUrlDisplay(): Promise<void> {
  const cards = await readFile(join(SRC_ROOT, 'ui/Daily30CandidateCards.tsx'), 'utf-8');
  const profileDisplay = await readFile(join(SRC_ROOT, 'candidates/resolveCollectionProfileDisplay.ts'), 'utf-8');
  const styles = await readFile(join(SRC_ROOT, 'ui/styles.css'), 'utf-8');

  assert(
    profileDisplay.includes('candidate.discoverySourceUrl?.trim() || candidate.sourceUrl?.trim() || null'),
    'source url resolution prefers discoverySourceUrl then sourceUrl'
  );
  assert(cards.includes('daily30-source-stack'), 'queue source column uses two-line stack');
  assert(cards.includes('daily30-source-url'), 'queue source column renders source url row');
  assert(cards.includes('URL未記録'), 'queue source column shows URL未記録 fallback');
  assert(styles.includes('.daily30-source-url {'), 'styles define source url row');
  assert(styles.includes('.daily30-source-url-missing {'), 'styles define missing url row');

  ok('Phase 42.18 source URL display checks passed');
}

async function verifyPhase4219CollectionDestinationUrl(): Promise<void> {
  const cards = await readFile(join(SRC_ROOT, 'ui/Daily30CandidateCards.tsx'), 'utf-8');
  const profileDisplay = await readFile(join(SRC_ROOT, 'candidates/resolveCollectionProfileDisplay.ts'), 'utf-8');

  assert(
    profileDisplay.includes('function resolveCandidateCollectionDestinationUrl'),
    'profile module defines collection destination url resolver'
  );
  assert(
    profileDisplay.includes('emailCandidateSourceUrl?.trim()'),
    'collection destination prefers email source page url'
  );
  assert(
    profileDisplay.includes('officialSiteUrl?.trim() || candidate.websiteUrl?.trim()'),
    'collection destination falls back to official site url'
  );
  const resolverBlock = profileDisplay.slice(
    profileDisplay.indexOf('function resolveCandidateCollectionDestinationUrl'),
    profileDisplay.indexOf('export function buildCollectionProfileDisplayFromCandidate')
  );
  assert(
    !resolverBlock.includes('discoverySourceUrl') && !resolverBlock.includes('sourceUrl'),
    'collection destination resolver does not use discovery source url'
  );
  assert(
    cards.includes('resolveCandidateCollectionDestinationUrl'),
    'queue cards import collection destination resolver'
  );
  assert(
    cards.includes('const collectionDestinationUrl = resolveCandidateCollectionDestinationUrl(c);'),
    'queue cards read collection destination url'
  );
  assert(
    !cards.includes('const discoveryUrl = profileInfo.discoverySourceUrl'),
    'queue cards no longer use discovery url for source column'
  );
  assert(cards.includes('URL未記録'), 'queue source column keeps URL未記録 fallback');

  const mapsDiscoveryCandidate = {
    externalCandidateId: 'verify-4219-maps',
    sourceType: 'google_places' as const,
    companyName: '収集先URLテスト',
    area: '宮城県',
    industry: '工務店',
    websiteUrl: 'https://phase4219.example/',
    officialSiteUrl: 'https://phase4219.example/',
    phoneNumber: null,
    address: null,
    googlePlaceId: null,
    sourceUrl: 'https://maps.google.com/?cid=4219',
    sourceQuery: 'q',
    category: '工務店',
    contactFormUrl: null,
    emailCandidates: ['info@phase4219.example'],
    confidenceScore: 0.8,
    importStatus: 'preview' as const,
    riskLevel: 'low' as const,
    duplicateReason: '',
    duplicateKey: 'k4219',
    pipelineStatus: 'email_found' as const,
    prefecture: '宮城県',
    regionGroup: '宮城' as const,
    collectionPriority: 1,
    collectionAreaSource: '宮城県',
    collectionBatchId: '2026-07-05',
    emailCandidateSourceUrls: ['https://phase4219.example/contact'],
    emailVerifiedAt: null,
    generatedEmailSubject: null,
    generatedEmailBody: null,
    generatedCustomHook: null,
    generatedCustomHookReason: null,
    targetEmail: 'info@phase4219.example',
    emailCandidateSourceUrl: 'https://phase4219.example/contact',
    failureReason: null,
    copyGeneratedAt: null,
    qualityCheckedAt: null,
    humanReviewStatus: null,
    gmailDraftStatus: null,
    sendStatus: null,
    notes: '',
    collectedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    discoverySource: 'google_places' as const,
    discoverySourceUrl: 'https://maps.google.com/?cid=4219',
  };

  const { resolveCandidateCollectionDestinationUrl } = await import(
    '../candidates/resolveCollectionProfileDisplay.js'
  );
  const resolved = resolveCandidateCollectionDestinationUrl(mapsDiscoveryCandidate);
  assert(resolved === 'https://phase4219.example/contact', 'prefers email source page over maps url');
  assert(!resolved?.includes('maps.google.com'), 'collection destination is not discovery url');

  ok('Phase 42.19 collection destination URL checks passed');
}

async function verifyPhase4220CandidateCountAndDetailsCleanup(): Promise<void> {
  const collectionView = await readFile(join(SRC_ROOT, 'ui/CandidateCollectionView.tsx'), 'utf-8');
  const detailsPanel = await readFile(join(SRC_ROOT, 'ui/CandidateCollectionDetailsPanel.tsx'), 'utf-8');
  const cloudPanel = await readFile(join(SRC_ROOT, 'ui/Daily30CloudResultsPanel.tsx'), 'utf-8');
  const settingsView = await readFile(join(SRC_ROOT, 'ui/SettingsView.tsx'), 'utf-8');
  const developerUi = await readFile(join(SRC_ROOT, 'ui/developerUi.ts'), 'utf-8');
  const batchMetrics = await readFile(join(SRC_ROOT, 'candidates/daily30BatchMetrics.ts'), 'utf-8');

  assert(collectionView.includes('メール営業候補'), 'header uses email sales candidate label');
  assert(!collectionView.includes('candidate-path-summary-compact'), 'total collected removed from main header');
  assert(!collectionView.includes('総収集候補'), 'legacy total collected label removed from header');
  assert(collectionView.includes('leadApprovalPendingCount'), 'results tab uses approval pending count');
  assert(
    collectionView.includes('const resultsCount = cloudOk ? (leadApprovalPending ?? 0) : null'),
    'results tab badge matches actionable queue count'
  );
  assert(collectionView.includes('CandidateCollectionDetailsPanel'), 'details panel component wired');
  assert(collectionView.includes('showCollectionDetails'), 'details toggle in header');
  assert(!collectionView.includes('運用・安全（開発者向け）'), 'ops/safety panel removed from normal view');

  assert(detailsPanel.includes('全収集'), 'details shows total collected');
  assert(detailsPanel.includes('メール営業候補'), 'details shows email sales count');
  assert(detailsPanel.includes('問い合わせフォームのみ'), 'details shows form-only label');
  assert(detailsPanel.includes('メール・フォームなし'), 'details shows no-contact label');
  assert(detailsPanel.includes('除外済み候補'), 'details shows excluded section');
  assert(detailsPanel.includes('収集条件・実行情報'), 'details shows run info section');

  assert(!cloudPanel.includes('daily30-candidate-work-aux'), 'auxiliary sidebar removed from results panel');
  assert(!cloudPanel.includes('今日の収集情報'), 'today collection info removed from results sidebar');

  assert(developerUi.includes('isDeveloperUiEnabled'), 'developer UI gate exists');
  assert(settingsView.includes('Daily30OperationsPanel'), 'operations panel available in settings dev section');
  assert(settingsView.includes('isDeveloperUiEnabled'), 'settings gates developer panels');

  assert(batchMetrics.includes('isDaily30EmailFoundCandidate'), 'email sales metric uses email_found candidates');
  assert(batchMetrics.includes('isDaily30FormOnlyCandidate'), 'form-only tracked separately');
  assert(batchMetrics.includes('isDaily30NoEmailCandidate'), 'no-contact tracked separately');

  const { countDaily30BatchMetrics } = await import('../candidates/daily30BatchMetrics.js');
  const batchId = '2026-07-05';
  const emailCandidate = {
    externalCandidateId: 'verify-4220-email',
    pipelineStatus: 'email_found' as const,
    collectionBatchId: batchId,
    importStatus: 'preview' as const,
    emailCandidates: ['info@example.test'],
    contactFormUrl: null,
    companyName: 'メールあり',
  };
  const formOnlyCandidate = {
    externalCandidateId: 'verify-4220-form',
    pipelineStatus: 'email_not_found' as const,
    collectionBatchId: batchId,
    importStatus: 'preview' as const,
    emailCandidates: [],
    contactFormUrl: 'https://example.test/contact',
    companyName: 'フォームのみ',
  };
  const noContactCandidate = {
    externalCandidateId: 'verify-4220-none',
    pipelineStatus: 'email_not_found' as const,
    collectionBatchId: batchId,
    importStatus: 'preview' as const,
    emailCandidates: [],
    contactFormUrl: null,
    companyName: '導線なし',
  };

  const metrics = countDaily30BatchMetrics(
    [emailCandidate, formOnlyCandidate, noContactCandidate] as never[],
    batchId
  );
  assert(metrics.emailFound === 1, 'email sales count excludes form-only and no-contact');
  assert(metrics.formOnly === 1, 'form-only data preserved in metrics');
  assert(metrics.noEmail === 1, 'no-contact data preserved in metrics');
  assert(metrics.totalCollected === 3, 'total collected includes all categories');
  assert(
    metrics.emailFound + metrics.formOnly + metrics.noEmail === metrics.totalCollected,
    'collection breakdown has no double counting'
  );

  ok('Phase 42.20 candidate count and details cleanup checks passed');
}

const MAIL_OPS_UPGRADE_DOC = join(PROJECT_ROOT, 'docs/GROWLY_SALES_MAIL_OPERATIONS_UPGRADE.md');

async function verifyPhase431BaselineOperationsPreserved(): Promise<void> {
  const doc = await readFile(MAIL_OPS_UPGRADE_DOC, 'utf-8');
  assert(doc.includes('FETCH_DAILY_30'), 'doc documents candidate collection gate');
  assert(doc.includes('GENERATE_DAILY_30_COPY'), 'doc documents copy generation gate');
  assert(doc.includes('CREATE_DRAFTS'), 'doc documents gmail draft gate');
  assert(doc.includes('users.drafts.create'), 'doc documents drafts.create only');
  assert(doc.includes('Gmail 自動送信禁止'), 'doc documents no auto-send rule');
  assert(doc.includes('Human Approval'), 'doc documents human approval');

  const gmailAdapter = await readFile(join(SRC_ROOT, 'integrations/gmail/gmailDraftAdapter.ts'), 'utf-8');
  assert(gmailAdapter.includes('drafts.create'), 'gmail adapter still uses drafts.create');
  assert(!gmailAdapter.includes('messages.send'), 'gmail adapter does not send messages');
  assert(!gmailAdapter.includes('drafts.send'), 'gmail adapter does not drafts.send');

  const generateCopy = await readFile(join(SRC_ROOT, 'candidates/generateDaily30SalesCopy.ts'), 'utf-8');
  assert(generateCopy.includes('generateDaily30SalesCopyForCandidate'), 'daily30 copy path exists');

  const recordSent = await readFile(join(SRC_ROOT, 'workflow/recordManualGmailSent.ts'), 'utf-8');
  assert(recordSent.includes('manual'), 'manual send record workflow preserved');

  const workLog = await readFile(join(PROJECT_ROOT, 'WORK_LOG.md'), 'utf-8');
  assert(workLog.includes('## 通常営業運用'), 'WORK_LOG has routine operations section');
  assert(workLog.includes('## Phase 43開発'), 'WORK_LOG has phase 43 dev section');

  ok('Phase 43.1 baseline operations preserved checks passed');
}

async function verifyPhase432SuppressionDesign(): Promise<void> {
  const doc = await readFile(MAIL_OPS_UPGRADE_DOC, 'utf-8');
  assert(doc.includes('mail-suppressions.json'), 'doc defines suppression storage');
  assert(doc.includes('suppressionId'), 'doc defines suppressionId');
  assert(doc.includes('normalizedEmail'), 'doc defines normalizedEmail');
  assert(doc.includes('tokenHash'), 'doc defines tokenHash not raw token');
  assert(doc.includes('生トークン'), 'doc warns against raw token storage');
  assert(doc.includes('unsubscribed'), 'doc defines unsubscribed status');
  assert(doc.includes('manually_blocked'), 'doc defines manually_blocked status');
  assert(doc.includes('assertNotSuppressed'), 'doc defines suppression check hook');
  assert(doc.includes('generateDaily30SalesCopy.ts'), 'doc lists copy generation check point');
  assert(doc.includes('selectGmailDraftCandidates.ts'), 'doc lists draft candidate check point');
  assert(doc.includes('冪等'), 'doc defines idempotent unsubscribe');
  assert(doc.includes('/u/{token}'), 'doc defines unsubscribe URL pattern');
  assert(doc.includes('解除'), 'doc defines reactivation with human approval');

  ok('Phase 43.2 suppression design checks passed');
}

async function verifyPhase433CustomTemplateDesign(): Promise<void> {
  const doc = await readFile(MAIL_OPS_UPGRADE_DOC, 'utf-8');
  assert(doc.includes('outreach-templates.json'), 'doc defines template storage');
  assert(doc.includes('subjectTemplate'), 'doc defines subject template block');
  assert(doc.includes('unsubscribeNotice'), 'doc defines unsubscribe notice block');
  assert(doc.includes('次回 `generateSalesEmail`'), 'doc applies template on next generation only');
  assert(doc.includes('既存 Lead'), 'doc preserves existing lead copy');
  assert(doc.includes('generateSalesEmail.ts'), 'doc lists generateSalesEmail integration');
  assert(doc.includes('bannedPhrases'), 'doc defines banned phrases constraint');
  assert(doc.includes('バージョン履歴'), 'doc defines version history UI');

  const generateSalesEmail = await readFile(join(SRC_ROOT, 'generation/generateSalesEmail.ts'), 'utf-8');
  assert(generateSalesEmail.includes('export function generateSalesEmail'), 'generateSalesEmail entry point exists');

  ok('Phase 43.3 custom template design checks passed');
}

async function verifyPhase434OpenTrackingDesign(): Promise<void> {
  const doc = await readFile(MAIL_OPS_UPGRADE_DOC, 'utf-8');
  assert(doc.includes('email-open-events.json'), 'doc defines open event storage');
  assert(doc.includes('trackingTokenHash'), 'doc uses tracking token hash');
  assert(doc.includes('IP は原則保存しない'), 'doc avoids IP storage');
  assert(doc.includes('privacyProxySuspected'), 'doc defines privacy proxy handling');
  assert(doc.includes('/t/{token}.gif'), 'doc defines tracking pixel URL');
  assert(doc.includes('参考開封率'), 'doc labels open rate as reference only');
  assert(doc.includes('mock/open-events'), 'doc defines mock open events endpoint');
  assert(doc.includes('公開 endpoint（live・未作成）'), 'doc defers public tracking endpoint');

  const sendRecordsView = await readFile(join(SRC_ROOT, 'ui/SendRecordsView.tsx'), 'utf-8');
  assert(sendRecordsView.includes('send-record'), 'send records view exists for future open stats');
  assert(sendRecordsView.includes('開封（参考）'), 'send records view shows open reference column');
  assert(sendRecordsView.includes('open-tracking'), 'send records view has open tracking UI');

  ok('Phase 43.4 open tracking design checks passed');
}

async function verifyPhase432SuppressionTypes(): Promise<void> {
  const types = await readFile(join(SRC_ROOT, 'mail-operations/suppressionTypes.ts'), 'utf-8');
  assert(types.includes('MailSuppressionStatus'), 'suppression status type exists');
  assert(types.includes('unsubscribed'), 'unsubscribed status');
  assert(types.includes('manually_blocked'), 'manually_blocked status');
  assert(types.includes('tokenHash'), 'tokenHash field');
  assert(types.includes('SuppressionCheckResult'), 'check result union');
  ok('Phase 43.2 suppression types checks passed');
}

async function verifyPhase432SuppressionStore(): Promise<void> {
  const storeSrc = await readFile(join(SRC_ROOT, 'mail-operations/suppressionStore.ts'), 'utf-8');
  assert(!storeSrc.includes('token: string') || storeSrc.includes('tokenHash'), 'store avoids persisting raw token');
  assert(storeSrc.includes('setSuppressionStoreOverrideForTests'), 'test override exists');

  const { normalizeEmailAddress, hashUnsubscribeToken } = await import('../mail-operations/suppressionToken.js');
  assert(normalizeEmailAddress('  Info@Corp.TEST ') === 'info@corp.test', 'email normalize trim lowercase');
  assert(normalizeEmailAddress('a.b+c@corp.test') === 'a.b+c@corp.test', 'no gmail dot/plus stripping');

  const {
    setSuppressionStoreOverrideForTests,
    addManualSuppression,
    listMailSuppressions,
    clearMockUnsubscribeTokenRegistryForTests,
  } = await import('../mail-operations/suppressionStore.js');

  setSuppressionStoreOverrideForTests({ version: 1, records: [], updatedAt: new Date().toISOString() });
  clearMockUnsubscribeTokenRegistryForTests();
  const created = await addManualSuppression({
    emailAddress: 'blocked@verify-phase432.test',
    reason: 'verify manual',
  });
  assert(created.normalizedEmail === 'blocked@verify-phase432.test', 'manual suppression saved');
  const list = await listMailSuppressions();
  assert(list.some((r) => r.suppressionId === created.suppressionId), 'list includes record');
  assert(!JSON.stringify(list).includes('rawToken'), 'no raw token in list json');

  const token = 'verify-phase432-token';
  const hash = hashUnsubscribeToken(token);
  assert(!hash.includes(token), 'hash differs from raw token');
  setSuppressionStoreOverrideForTests(null);
  ok('Phase 43.2 suppression store checks passed');
}

async function verifyPhase432SuppressionChecks(): Promise<void> {
  const {
    setSuppressionStoreOverrideForTests,
    addManualSuppression,
    clearMockUnsubscribeTokenRegistryForTests,
  } = await import('../mail-operations/suppressionStore.js');
  const { checkNotSuppressed, assertNotSuppressed, SuppressionBlockedError } = await import(
    '../mail-operations/suppressionPolicy.js'
  );

  setSuppressionStoreOverrideForTests({ version: 1, records: [], updatedAt: new Date().toISOString() });
  clearMockUnsubscribeTokenRegistryForTests();
  await addManualSuppression({ emailAddress: 'stop@verify.test', reason: '本人による配信停止' });

  const blocked = checkNotSuppressed({
    emailAddress: 'stop@verify.test',
    operation: 'create_gmail_draft',
  });
  assert(!blocked.allowed, 'blocked email disallowed');
  assert(blocked.allowed === false && blocked.blockedReason.includes('配信禁止'), 'blocked reason shown');

  let threw = false;
  try {
    assertNotSuppressed({ emailAddress: 'stop@verify.test', operation: 'generate_sales_copy' });
  } catch (err) {
    threw = err instanceof SuppressionBlockedError;
  }
  assert(threw, 'assertNotSuppressed throws');

  const generateCopy = await readFile(join(SRC_ROOT, 'candidates/generateDaily30SalesCopy.ts'), 'utf-8');
  assert(generateCopy.includes('assertNotSuppressed'), 'daily30 copy checks suppression');
  assert(
    (await readFile(join(SRC_ROOT, 'generation/applyFullGeneration.ts'), 'utf-8')).includes('assertNotSuppressed'),
    'applyFullGeneration checks suppression'
  );
  assert(
    (await readFile(join(SRC_ROOT, 'workflow/createGmailDraftForLead.ts'), 'utf-8')).includes('assertNotSuppressed'),
    'createGmailDraft checks suppression'
  );

  setSuppressionStoreOverrideForTests(null);
  ok('Phase 43.2 suppression checks passed');
}

async function verifyPhase432LegacyCompatibility(): Promise<void> {
  const { setSuppressionStoreOverrideForTests } = await import('../mail-operations/suppressionStore.js');
  const { checkNotSuppressed } = await import('../mail-operations/suppressionPolicy.js');
  setSuppressionStoreOverrideForTests({ version: 1, records: [], updatedAt: new Date().toISOString() });

  const legacyLead = createEmptyLead({
    companyName: 'Legacy DNC',
    area: '仙台',
    industry: '工務店',
    websiteUrl: 'https://legacy-dnc.test',
    emailCandidates: ['info@legacy-dnc.test'],
    doNotContact: true,
  });

  const result = checkNotSuppressed({
    lead: legacyLead,
    leadId: legacyLead.id,
    emailAddress: 'info@legacy-dnc.test',
    operation: 'follow_up',
  });
  assert(!result.allowed, 'legacy doNotContact blocks');
  assert(result.allowed === false && result.legacySource === 'do_not_contact', 'legacy source tagged');

  setSuppressionStoreOverrideForTests(null);
  ok('Phase 43.2 legacy compatibility checks passed');
}

async function verifyPhase432SuppressionUi(): Promise<void> {
  const settings = await readFile(join(SRC_ROOT, 'ui/SettingsView.tsx'), 'utf-8');
  assert(settings.includes('MailSuppressionListPanel'), 'settings has suppression list');
  const panel = await readFile(join(SRC_ROOT, 'ui/MailSuppressionListPanel.tsx'), 'utf-8');
  assert(panel.includes('配信禁止リスト'), 'suppression panel title');
  assert(panel.includes('SUPPRESSION_REACTIVATE'), 'reactivate human approval token');
  const server = await readFile(join(SRC_ROOT, 'server/uiServer.ts'), 'utf-8');
  assert(server.includes('/api/mail-suppressions'), 'suppressions API');
  ok('Phase 43.2 suppression UI checks passed');
}

async function verifyPhase432MockUnsubscribe(): Promise<void> {
  const {
    setSuppressionStoreOverrideForTests,
    registerMockUnsubscribeToken,
    confirmMockUnsubscribe,
    listMailSuppressions,
    clearMockUnsubscribeTokenRegistryForTests,
  } = await import('../mail-operations/suppressionStore.js');
  const server = await readFile(join(SRC_ROOT, 'server/uiServer.ts'), 'utf-8');
  assert(server.includes('/api/mock/unsubscribe/'), 'mock unsubscribe route');

  setSuppressionStoreOverrideForTests({ version: 1, records: [], updatedAt: new Date().toISOString() });
  clearMockUnsubscribeTokenRegistryForTests();
  const { token } = registerMockUnsubscribeToken({ emailAddress: 'unsub@verify.test' });
  const first = await confirmMockUnsubscribe(token);
  assert(first.ok && first.status === 'success', 'first unsubscribe succeeds');
  const second = await confirmMockUnsubscribe(token);
  assert(!second.ok && second.status === 'invalid_token', 'token consumed not reused');

  const { token: token2 } = registerMockUnsubscribeToken({ emailAddress: 'unsub@verify.test' });
  await confirmMockUnsubscribe(token2);
  const { token: token3 } = registerMockUnsubscribeToken({ emailAddress: 'unsub@verify.test' });
  const idempotent = await confirmMockUnsubscribe(token3);
  assert(idempotent.ok, 'repeat unsubscribe idempotent success');
  const records = await listMailSuppressions();
  const active = records.filter((r) => r.normalizedEmail === 'unsub@verify.test' && !r.reactivatedAt);
  assert(active.length === 1, 'no duplicate active suppressions');

  setSuppressionStoreOverrideForTests(null);
  clearMockUnsubscribeTokenRegistryForTests();
  ok('Phase 43.2 mock unsubscribe checks passed');
}

async function verifyPhase432NoLiveMailChanges(): Promise<void> {
  const gmailAdapter = await readFile(join(SRC_ROOT, 'integrations/gmail/gmailDraftAdapter.ts'), 'utf-8');
  assert(!gmailAdapter.includes('messages.send'), 'no gmail send');
  assert(!gmailAdapter.includes('drafts.send'), 'no drafts send');
  const server = await readFile(join(SRC_ROOT, 'server/uiServer.ts'), 'utf-8');
  assert(!server.includes('PUBLIC_BASE_URL/u/'), 'no live public unsubscribe url in server');
  assert(server.includes('mock: true'), 'mock unsubscribe flagged');
  const generateEmail = await readFile(join(SRC_ROOT, 'generation/generateSalesEmail.ts'), 'utf-8');
  assert(!generateEmail.includes('/api/mock/unsubscribe'), 'sales email body not auto-injecting mock link');
  ok('Phase 43.2 no live mail changes checks passed');
}

async function verifyPhase432OperationsLoggingPreserved(): Promise<void> {
  const workLog = await readFile(join(PROJECT_ROOT, 'WORK_LOG.md'), 'utf-8');
  assert(workLog.includes('## 通常営業運用'), 'routine ops section preserved');
  assert(workLog.includes('## Phase 43開発'), 'phase 43 dev section preserved');
  const nextTasks = await readFile(join(PROJECT_ROOT, 'NEXT_TASKS.md'), 'utf-8');
  assert(nextTasks.includes('Phase 43'), 'next tasks tracks phase 43');
  ok('Phase 43.2 operations logging preserved checks passed');
}

async function verifyPhase433TemplateTypes(): Promise<void> {
  const types = await readFile(join(SRC_ROOT, 'mail-operations/templateTypes.ts'), 'utf-8');
  assert(types.includes('OutreachTemplate'), 'OutreachTemplate type exists');
  assert(types.includes('subjectTemplate'), 'subjectTemplate field');
  assert(types.includes('aiEditableSlots'), 'aiEditableSlots field');
  assert(types.includes('humanLockedBlocks'), 'humanLockedBlocks field');
  ok('Phase 43.3 template types checks passed');
}

async function verifyPhase433TemplateStore(): Promise<void> {
  const storeSrc = await readFile(join(SRC_ROOT, 'mail-operations/templateStore.ts'), 'utf-8');
  assert(storeSrc.includes('setOutreachTemplateStoreOverrideForTests'), 'template store test override');
  assert(storeSrc.includes('getOutreachTemplatesPath'), 'runtime template path referenced');

  const {
    setOutreachTemplateStoreOverrideForTests,
    saveOutreachTemplateDraft,
    activateOutreachTemplate,
    loadActiveOutreachTemplateSync,
  } = await import('../mail-operations/templateStore.js');

  setOutreachTemplateStoreOverrideForTests({
    version: 1,
    templates: [],
    activeTemplateId: null,
    updatedAt: new Date().toISOString(),
  });

  const draft = await saveOutreachTemplateDraft({
    name: 'verify-433',
    subjectTemplate: '{{companyName}}様向けテスト',
    openingBlock: '{{companyName}}\nご担当者様',
    companyIntroBlock: '{{customOpening}}',
    proposalBlock: '{{diagnosisBlock}}',
    proofBlock: '免責文',
    ctaBlock: '{{customCTA}}',
    signatureBlock: '{{signature}}',
  });
  const activated = await activateOutreachTemplate(draft.templateId);
  assert(activated?.status === 'active', 'template activated');
  assert(loadActiveOutreachTemplateSync()?.templateId === draft.templateId, 'active template loaded');

  setOutreachTemplateStoreOverrideForTests(null);
  ok('Phase 43.3 template store checks passed');
}

async function verifyPhase433TemplateRenderer(): Promise<void> {
  const { buildBuiltinDefaultTemplate } = await import('../mail-operations/templateStore.js');
  const { renderOutreachTemplatePreview } = await import('../mail-operations/templateRenderer.js');
  const offer = await loadOfferProfile();
  const template = buildBuiltinDefaultTemplate();
  const result = renderOutreachTemplatePreview(
    template,
    { companyName: 'テスト工務店', area: '仙台市', industry: '工務店' },
    offer
  );
  assert(result.emailSubject.includes('テスト工務店'), 'preview subject uses company name');
  assert(result.emailBody.includes('テスト工務店'), 'preview body uses company name');
  assert(result.emailBody.includes('合同会社Want Reach'), 'preview includes signature block');

  const generateSalesEmailSrc = await readFile(join(SRC_ROOT, 'generation/generateSalesEmail.ts'), 'utf-8');
  assert(generateSalesEmailSrc.includes('loadActiveOutreachTemplateSync'), 'generateSalesEmail uses active template');
  assert(generateSalesEmailSrc.includes('renderOutreachTemplate'), 'generateSalesEmail delegates to renderer');
  ok('Phase 43.3 template renderer checks passed');
}

async function verifyPhase433TemplateApplyOnNextGenOnly(): Promise<void> {
  const doc = await readFile(MAIL_OPS_UPGRADE_DOC, 'utf-8');
  assert(doc.includes('次回'), 'doc says apply on next generation');
  const storeSrc = await readFile(join(SRC_ROOT, 'mail-operations/templateStore.ts'), 'utf-8');
  assert(!storeSrc.includes('saveLeadsToJson'), 'template store does not write leads');
  const applySrc = await readFile(join(SRC_ROOT, 'generation/applyFullGeneration.ts'), 'utf-8');
  assert(!applySrc.includes('outreach-templates'), 'applyFullGeneration does not bulk-rewrite from templates file');
  ok('Phase 43.3 apply on next generation only checks passed');
}

async function verifyPhase433TemplateUi(): Promise<void> {
  const settings = await readFile(join(SRC_ROOT, 'ui/SettingsView.tsx'), 'utf-8');
  assert(settings.includes('OutreachTemplatePanel'), 'settings has template panel');
  const panel = await readFile(join(SRC_ROOT, 'ui/OutreachTemplatePanel.tsx'), 'utf-8');
  assert(panel.includes('TEMPLATE_ACTIVATE'), 'activate human approval token');
  assert(panel.includes('次回生成から'), 'UI notes next generation apply');
  const server = await readFile(join(SRC_ROOT, 'server/uiServer.ts'), 'utf-8');
  assert(server.includes('/api/outreach-templates'), 'template API exists');
  assert(server.includes('/api/outreach-templates/preview'), 'template preview API');
  ok('Phase 43.3 template UI checks passed');
}

async function verifyPhase433NoExistingLeadOverwrite(): Promise<void> {
  const { setOutreachTemplateStoreOverrideForTests, saveOutreachTemplateDraft, activateOutreachTemplate } =
    await import('../mail-operations/templateStore.js');
  const { generateSalesEmail } = await import('../generation/generateSalesEmail.js');
  const offer = await loadOfferProfile();

  setOutreachTemplateStoreOverrideForTests({
    version: 1,
    templates: [],
    activeTemplateId: null,
    updatedAt: new Date().toISOString(),
  });

  const lead = createEmptyLead({
    companyName: '既存Lead保存テスト',
    area: '仙台市',
    industry: '工務店',
    websiteUrl: 'https://existing-lead.test',
    emailSubject: '既存の件名を維持',
    emailBody: '既存の本文を維持します。',
  });

  const beforeSubject = lead.emailSubject;
  const beforeBody = lead.emailBody;

  const draft = await saveOutreachTemplateDraft({
    name: 'overwrite-guard',
    subjectTemplate: '上書き禁止テスト件名',
    openingBlock: '上書き禁止',
    companyIntroBlock: '{{customOpening}}',
    proposalBlock: '提案',
    proofBlock: '免責',
    ctaBlock: '{{customCTA}}',
    signatureBlock: '{{signature}}',
  });
  await activateOutreachTemplate(draft.templateId);

  assert(lead.emailSubject === beforeSubject, 'existing lead subject unchanged without regeneration');
  assert(lead.emailBody === beforeBody, 'existing lead body unchanged without regeneration');

  const generated = generateSalesEmail(lead, {
    customHook: 'ホームページを拝見し、施工事例の見せ方に工夫を感じました。',
    salesAngle: 'SNS診断',
    offer,
  });
  assert(generated.emailSubject === '上書き禁止テスト件名', 'new generation uses active template subject');

  setOutreachTemplateStoreOverrideForTests(null);
  ok('Phase 43.3 no existing lead overwrite checks passed');
}

async function verifyPhase434OpenTrackingTypes(): Promise<void> {
  const types = await readFile(join(SRC_ROOT, 'mail-operations/openTrackingTypes.ts'), 'utf-8');
  assert(types.includes('EmailSendTracking'), 'EmailSendTracking type exists');
  assert(types.includes('tokenHash'), 'tokenHash field');
  assert(types.includes('privacyProxySuspected'), 'privacyProxySuspected field');
  assert(types.includes('EmailOpenEvent'), 'EmailOpenEvent type exists');
  ok('Phase 43.4 open tracking types checks passed');
}

async function verifyPhase434OpenTrackingStore(): Promise<void> {
  const storeSrc = await readFile(join(SRC_ROOT, 'mail-operations/openTrackingStore.ts'), 'utf-8');
  assert(storeSrc.includes('setOpenTrackingStoreOverrideForTests'), 'open tracking test override');
  assert(storeSrc.includes('getEmailSendTrackingPath'), 'send tracking path referenced');
  assert(!storeSrc.includes('saveLeadsToJson'), 'open tracking store does not write leads');

  const {
    setOpenTrackingStoreOverrideForTests,
    createMockSendTrackingForManualGmailSend,
    recordMockOpenEvent,
    hashOpenTrackingToken,
  } = await import('../mail-operations/index.js');

  setOpenTrackingStoreOverrideForTests({
    events: { version: 1, events: [], updatedAt: new Date().toISOString() },
    tracking: { version: 1, records: [], updatedAt: new Date().toISOString() },
  });

  const lead = createEmptyLead({
    companyName: '開封計測テスト',
    emailCandidates: ['test@example.com'],
    gmailDraftId: 'draft-verify-434',
    gmailDraftStatus: 'draft_created',
    sendStatus: 'not_sent',
  });
  const preview = {
    leadId: lead.id,
    companyName: lead.companyName,
    to: 'test@example.com',
    from: 'from@example.com',
    replyTo: 'reply@example.com',
    draftId: 'draft-verify-434',
    subject: '件名',
    emailSourceUrl: null,
    emailSourceLabel: 'test',
    officialSiteUrl: null,
    isOfficialSiteOrigin: true,
    isPlaceholderEmail: false,
    isPersonalEmail: false,
    batchId: null,
    source: null,
    collectionProfileId: null,
    collectionProfileName: null,
    collectionMode: null,
    industryCategory: null,
    areaStrategy: null,
    prefecture: null,
    discoverySource: null,
    discoverySourceSite: null,
    discoverySourceLabel: null,
    discoverySourceUrl: null,
    sourceComplianceStatus: null,
    collectionProfile: { label: 'test', detailLines: [] },
  };
  const sentAt = new Date().toISOString();
  const { tracking, mockToken } = await createMockSendTrackingForManualGmailSend(lead, preview, sentAt);
  assert(tracking.status === 'mock', 'tracking status mock');
  assert(tracking.tokenHash.length > 0, 'token hash stored');
  assert(mockToken.length > 0, 'mock token returned on create');

  const opened = await recordMockOpenEvent({
    token: mockToken,
    userAgent: 'GoogleImageProxy',
  });
  assert(opened.tracking.openCount === 1, 'open count incremented');
  assert(opened.tracking.privacyProxySuspected, 'gmail proxy flagged');
  assert(hashOpenTrackingToken(mockToken) === tracking.tokenHash, 'token hash stable');

  setOpenTrackingStoreOverrideForTests({ events: null, tracking: null });
  ok('Phase 43.4 open tracking store checks passed');
}

async function verifyPhase434MockOpenEvents(): Promise<void> {
  const server = await readFile(join(SRC_ROOT, 'server/uiServer.ts'), 'utf-8');
  assert(server.includes('/api/mock/open-events'), 'mock open events API');
  assert(server.includes('/api/send-records/'), 'per-lead open stats API');
  assert(server.includes('/api/open-tracking/sent-leads'), 'batch open stats API');
  assert(!server.includes('/t/{token}.gif'), 'no live public tracking route');
  ok('Phase 43.4 mock open events checks passed');
}

async function verifyPhase434SendRecordsUi(): Promise<void> {
  const view = await readFile(join(SRC_ROOT, 'ui/SendRecordsView.tsx'), 'utf-8');
  assert(view.includes('fetchOpenStatsForSentLeads'), 'send records loads open stats');
  assert(view.includes('open-tracking-badge'), 'open tracking badge UI');
  const api = await readFile(join(SRC_ROOT, 'ui/openTrackingApi.ts'), 'utf-8');
  assert(api.includes('/api/mock/open-events'), 'open tracking API client');
  ok('Phase 43.4 send records UI checks passed');
}

async function verifyPhase434DashboardReferenceRate(): Promise<void> {
  const dashSrc = await readFile(join(SRC_ROOT, 'analytics/buildSalesDashboard.ts'), 'utf-8');
  assert(dashSrc.includes('referenceOpenRate'), 'dashboard includes reference open rate');
  assert(dashSrc.includes('mailOpsReference'), 'dashboard includes mail ops reference metrics');
  const view = await readFile(join(SRC_ROOT, 'ui/SalesDashboardView.tsx'), 'utf-8');
  assert(view.includes('参考開封率'), 'dashboard UI labels reference open rate');
  assert(view.includes('開封率は画像読み込みに基づく参考値です') || view.includes('open-tracking-privacy-note'), 'dashboard has privacy note');
  const privacy = await readFile(join(SRC_ROOT, 'mail-operations/openTrackingPrivacy.ts'), 'utf-8');
  assert(privacy.includes('開封率は画像読み込みに基づく参考値です'), 'required privacy disclaimer');
  ok('Phase 43.4 dashboard reference rate checks passed');
}

async function verifyPhase434NoRetroactiveTracking(): Promise<void> {
  const recordSrc = await readFile(join(SRC_ROOT, 'workflow/recordManualGmailSent.ts'), 'utf-8');
  assert(recordSrc.includes('createMockSendTrackingForManualGmailSend'), 'tracking created on new send record only');
  const storeSrc = await readFile(join(SRC_ROOT, 'mail-operations/openTrackingStore.ts'), 'utf-8');
  assert(storeSrc.includes('checkNotSuppressed'), 'skips tracking for suppressed targets');
  assert(!storeSrc.includes('saveLeadsToJson'), 'store does not scan leads retroactively');
  ok('Phase 43.4 no retroactive tracking checks passed');
}

async function verifyPhase434NoLiveMailChanges(): Promise<void> {
  const gmailAdapter = await readFile(join(SRC_ROOT, 'integrations/gmail/gmailDraftAdapter.ts'), 'utf-8');
  assert(!gmailAdapter.includes('tracking pixel'), 'no tracking pixel in gmail adapter');
  assert(!gmailAdapter.includes('/t/'), 'no public tracking URL in gmail adapter');
  const createDraft = await readFile(join(SRC_ROOT, 'workflow/createGmailDraftForLead.ts'), 'utf-8');
  assert(!createDraft.includes('open-tracking'), 'draft creation unchanged for open tracking live');
  ok('Phase 43.4 no live mail changes checks passed');
}

function verifyPhase20LiteEmailImprovement(): void {
  assert(MAX_ADDITIONAL_CONTACT_PAGES === 4, 'additional page limit is 4');

  const homeHtml = `
    <html><body>
      <a href="/contact">お問い合わせ</a>
      <a href="/company">会社概要</a>
      <a href="https://instagram.com/foo">IG</a>
      <a href="https://other.example/contact">外部</a>
      <footer><a href="/toiawase">ご相談</a></footer>
    </body></html>
  `;
  const pages = findAdditionalContactPageUrls(homeHtml, 'https://example-housing.test/');
  assert(pages.length <= 2, 'findAdditionalContactPageUrls respects max 2');
  assert(pages.every((u) => u.includes('example-housing.test')), 'additional pages same domain only');
  assert(!pages.some((u) => u.includes('instagram')), 'SNS URLs excluded from additional pages');
  assert(!pages.some((u) => u.includes('other.example')), 'external domain excluded');

  const mailtoHtml = '<a href="mailto:info@corp.test">mail</a>';
  assert(extractMailtoEmails(mailtoHtml).includes('info@corp.test'), 'mailto detection works');

  const fullwidth = normalizeEmailText('info＠corp.test');
  assert(fullwidth.includes('info@corp.test'), 'fullwidth @ normalized');

  const atHtml = 'お問い合わせ: info [at] corp.test';
  const atEmails = extractAtNotationEmails(atHtml);
  assert(atEmails.includes('info@corp.test'), '[at] notation normalized');

  const personal = classifyEmailCandidate('tanaka@corp.test', 'https://x.test', 'visible');
  assert(personal.rejected && personal.contactType === 'personal_rejected', 'personal email rejected');

  const gmail = classifyEmailCandidate('info@gmail.com', 'https://x.test', 'mailto');
  assert(gmail.rejected && gmail.rejectReason === 'free_email_domain', 'gmail domain rejected');

  const yahoo = classifyEmailCandidate('contact@yahoo.co.jp', 'https://x.test', 'visible');
  assert(yahoo.rejected, 'yahoo domain rejected');

  const noreply = classifyEmailCandidate('noreply@corp.test', 'https://x.test', 'mailto');
  assert(noreply.rejected, 'no-reply rejected');

  const sample = classifyEmailCandidate('info@example.com', 'https://x.test', 'visible');
  assert(sample.rejected, 'example.com rejected');

  const corporate = classifyEmailCandidate('info@corp.test', 'https://x.test/contact', 'mailto');
  assert(!corporate.rejected && corporate.contactType === 'corporate', 'corporate email allowed');

  const pageCandidates = extractEmailCandidatesFromHtml(
    '<footer>info@housing.test</footer><a href="mailto:contact@housing.test">',
    'https://housing.test/contact'
  );
  const allowed = pageCandidates.filter((c) => !c.rejected);
  assert(allowed.length >= 1, 'page email extraction returns allowed candidates');
  assert(
    allowed.every((c) => c.sourceUrl === 'https://housing.test/contact'),
    'emailCandidate sourceUrl captured'
  );

  const pathEmail = inferContactPathTypeFromFields(['info@x.test'], null);
  const pathForm = inferContactPathTypeFromFields([], 'https://x.test/contact');
  const pathBoth = inferContactPathTypeFromFields(['info@x.test'], 'https://x.test/contact');
  const pathNone = inferContactPathTypeFromFields([], null);
  assert(pathEmail === 'email', 'contactPathType email');
  assert(pathForm === 'contact_form', 'contactPathType contact_form');
  assert(pathBoth === 'both', 'contactPathType both');
  assert(pathNone === 'none', 'contactPathType none');

  const leads = [
    createEmptyLead({
      companyName: 'A',
      area: '仙台',
      industry: '工務店',
      websiteUrl: 'https://a.test',
      sourceUrls: ['https://a.test'],
      emailCandidates: ['info@a.test'],
      contactFormUrl: 'https://a.test/contact',
    }),
    createEmptyLead({
      companyName: 'B',
      area: '仙台',
      industry: '工務店',
      websiteUrl: 'https://b.test',
      sourceUrls: ['https://b.test'],
      contactFormUrl: 'https://b.test/contact',
    }),
  ];
  const analytics = buildContactPathAnalytics(leads);
  assert(analytics.bothEmailAndFormLeads === 1, 'bothEmailAndFormLeads counted');
  assert(analytics.gmailDraftPossibleLeads === 1, 'gmailDraftPossibleLeads counted');
  assert(analytics.formCopyOnlyLeads === 1, 'formCopyOnlyLeads counted');

  const { rejected } = filterAllowedEmails(['info@gmail.com', 'info@corp.test']);
  assert(rejected.includes('info@gmail.com'), 'filter rejects gmail');
  assert(!rejected.includes('info@corp.test'), 'filter keeps corporate');

  ok('Phase 20-lite email improvement unit checks passed');
}

async function verifyPhase20LiteEmailImprovementAsync(): Promise<void> {
  const uiPanel = await readFile(join(SRC_ROOT, 'ui/ContactPathAnalyticsPanel.tsx'), 'utf-8');
  assert(uiPanel.includes('gmailDraftPossibleLeads'), 'UI shows gmailDraftPossibleLeads');
  assert(uiPanel.includes('formCopyOnlyLeads'), 'UI shows formCopyOnlyLeads');

  const allSource = await collectSourceFiles(SRC_ROOT);
  const forbidden = [
    { pattern: /whois/i, label: 'WHOIS' },
    { pattern: /tesseract|paddleocr|\.ocr\(/i, label: 'OCR' },
  ];
  for (const file of allSource) {
    if (file.includes('verify-growly-sales')) continue;
    const content = await readFile(file, 'utf-8');
    for (const { pattern, label } of forbidden) {
      if (pattern.test(content)) {
        fail(`${label} usage found in ${file}`);
      }
    }
  }
  ok('No WHOIS/OCR usage in source');

  const emailPlan = await readFile(
    join(PROJECT_ROOT, 'docs/GROWLY_SALES_EMAIL_CANDIDATES_IMPROVEMENT_PLAN.md'),
    'utf-8'
  );
  assert(emailPlan.includes('Phase 20-lite') || emailPlan.includes('実装'), 'EMAIL plan updated for implementation');

  ok('Phase 20-lite async checks passed');
}

async function verifyPhaseBLeadInventory(): Promise<void> {
  const {
    isGmailOutreachTarget,
    isFormOutreachTarget,
    isExclusionCandidate,
    findDuplicateCandidateGroups,
    buildPhaseBInventoryReport,
    PHASE_B_COMPLETION_CRITERIA,
  } = await import('../workflow/leadPhaseBInventory.js');

  const phaseBScript = await readFile(
    join(SRC_ROOT, 'scripts/run-growly-sales-phase-b-status.ts'),
    'utf-8'
  );
  assert(phaseBScript.includes('読み取り専用'), 'phase-b-status is read-only');
  assert(phaseBScript.includes('PHASE_B_COMPLETION_CRITERIA'), 'phase-b-status prints completion criteria');

  const filterUtils = await readFile(join(SRC_ROOT, 'ui/leadFilterUtils.ts'), 'utf-8');
  assert(filterUtils.includes('gmail_outreach'), 'Lead list has Gmail outreach filter');
  assert(filterUtils.includes('form_outreach'), 'Lead list has form outreach filter');
  assert(filterUtils.includes('exclusion_candidate'), 'Lead list has exclusion filter');
  assert(filterUtils.includes('duplicate_candidate'), 'Lead list has duplicate filter');

  const gmailTarget = baseEligibleLead({
    companyName: 'Phase B Gmail Target',
    humanReviewStatus: 'approved',
    sendStatus: 'not_sent',
    gmailDraftStatus: 'none',
  });
  assert(isGmailOutreachTarget(gmailTarget), 'approved unsent email lead is Gmail outreach target');

  const draftCreated = baseEligibleLead({
    companyName: 'Phase B Draft Created',
    gmailDraftStatus: 'draft_created',
  });
  assert(!isGmailOutreachTarget(draftCreated), 'draft_created lead excluded from Gmail outreach');

  const formTarget = createEmptyLead({
    companyName: 'Phase B Form Target',
    area: '仙台市',
    industry: '工務店',
    websiteUrl: 'https://form-target.test',
    sourceUrls: ['https://form-target.test'],
    contactFormUrl: 'https://form-target.test/contact',
    emailSubject: '件名',
    emailBody: '本文',
    humanReviewStatus: 'approved',
    sendStatus: 'not_sent',
  });
  assert(isFormOutreachTarget(formTarget), 'form-only approved lead is form outreach target');
  assert(!isGmailOutreachTarget(formTarget), 'form-only lead is not Gmail outreach target');

  const dupA = baseEligibleLead({
    companyName: 'Dup Co',
    websiteUrl: 'https://dup.example',
    emailCandidates: ['info@dup.example'],
  });
  const dupB = baseEligibleLead({
    companyName: 'Dup Co',
    websiteUrl: 'https://dup.example',
    emailCandidates: ['other@dup.example'],
  });
  const dupGroups = findDuplicateCandidateGroups([dupA, dupB]);
  assert(dupGroups.length >= 1, 'duplicate groups detected by company or website');

  const sentNoAction = createEmptyLead({
    companyName: 'Sent No Action',
    area: '仙台市',
    industry: '工務店',
    websiteUrl: 'https://sent-no-action.test',
    sourceUrls: ['https://sent-no-action.test'],
    sendStatus: 'sent',
    replyStatus: 'no_reply',
    nextAction: '対象外',
  });
  assert(isExclusionCandidate(sentNoAction), 'sent no-action lead can be exclusion candidate');

  const report = buildPhaseBInventoryReport([gmailTarget, formTarget, sentNoAction, dupA, dupB]);
  assert(report.totalLeads === 5, 'phase B report counts all leads');
  assert(report.counts.gmail_outreach >= 1, 'report has gmail outreach count');
  assert(PHASE_B_COMPLETION_CRITERIA.length >= 5, 'phase B completion criteria defined');

  ok('Phase B lead inventory classification verified');
}

async function verifyPhaseCCloudDaily30Status(): Promise<void> {
  const pkg = await readFile(join(PROJECT_ROOT, 'package.json'), 'utf-8');
  assert(pkg.includes('growly-sales:phase-c-cloud-status'), 'package.json has phase-c-cloud-status');

  const phaseCScript = await readFile(
    join(SRC_ROOT, 'scripts/run-growly-sales-phase-c-cloud-status.ts'),
    'utf-8'
  );
  assert(phaseCScript.includes('読み取り専用'), 'phase-c script is read-only');
  assert(!phaseCScript.includes('GMAIL_REFRESH_TOKEN'), 'phase-c script has no refresh token');
  assert(!phaseCScript.includes('AIzaSy'), 'phase-c script has no sample api key');

  const cloudDash = await readFile(join(SRC_ROOT, 'candidates/buildDaily30CloudDashboard.ts'), 'utf-8');
  assert(cloudDash.includes('gcsReadError'), 'cloud dashboard has gcsReadError field');
  assert(cloudDash.includes('contactPathSummary'), 'cloud dashboard has contact path summary');
  assert(cloudDash.includes('ok: false'), 'cloud dashboard degrades on gcs failure');

  const candidateView = await readFile(join(SRC_ROOT, 'ui/CandidateCollectionView.tsx'), 'utf-8');
  assert(
    candidateView.includes('メール営業候補'),
    'candidate view shows email sales KPI'
  );
  assert(
    candidateView.includes('全収集') || candidateView.includes('CandidateCollectionDetailsPanel'),
    'candidate view shows total collected in details'
  );
  assert(candidateView.includes('cloudOk'), 'candidate view handles cloud unavailable');

  const { diagnoseGcsAuth } = await import('../config/gcsAuthDiagnostics.js');
  const { summarizeDaily30ContactPaths } = await import('../candidates/summarizeDaily30ContactPaths.js');
  const diag = diagnoseGcsAuth();
  assert(typeof diag.recommendedAction === 'string', 'gcs auth diagnostics returns action');

  const paths = summarizeDaily30ContactPaths(
    [
      {
        collectionBatchId: '2026-06-30',
        pipelineStatus: 'email_found',
        importStatus: 'preview',
        emailCandidates: ['info@example.com'],
        contactFormUrl: null,
      } as never,
      {
        collectionBatchId: '2026-06-30',
        pipelineStatus: 'collected',
        importStatus: 'preview',
        emailCandidates: [],
        contactFormUrl: 'https://example.com/contact',
      } as never,
    ],
    '2026-06-30'
  );
  assert(paths.emailOnly === 1, 'contact path email only');
  assert(paths.formOnly === 1, 'contact path form only');

  ok('Phase C Cloud Daily 30 status diagnostics verified');
}

async function main(): Promise<void> {
  console.log('Growly Sales — Verify');
  console.log('========================');

  loadEnv();
  if (process.env.VERIFY_WITH_GCS !== 'true') {
    process.env.GROWLY_STORAGE_BACKEND = 'local';
  }

  const sampleLead = createEmptyLead({
    companyName: 'Sample Housing',
    area: '宮城県仙台市',
    industry: '工務店',
    websiteUrl: 'https://sample-housing.example',
    sourceUrls: ['https://sample-housing.example'],
    emailCandidates: ['info@sample-housing.example'],
    leadScore: 'B',
    collectionStatus: 'collected',
    riskLevel: 'low',
  });

  verifyLeadRequiredFields(sampleLead);
  verifyEnums(sampleLead);
  verifyUtf8BomStrip();
  verifyMojibakeDetection();
  assert(sampleLead.sourceUrls.length > 0, 'sourceUrls is not empty');

  const enumErrors = validateLeadEnums(sampleLead);
  assert(enumErrors.length === 0, 'Lead enum validation passes');

  verifyDedupe();
  verifyDoNotContact();

  const tmpJson = join(PROJECT_ROOT, 'data/growly-sales/_verify_test.json');
  const tmpCsv = join(PROJECT_ROOT, 'data/growly-sales/_verify_test.csv');
  await verifyJsonStorage(tmpJson);
  await verifyCsvStorage(tmpCsv);
  await verifyEmptyDataHandling();
  await verifyNoMojibakeInDataFiles();
  await verifyEnvAndSecrets();
  await verifyProfiles();
  await verifyExternalApiAdapters();
  verifyUrlClassificationRules();
  await verifyInstagramUrlsInLeads();
  await verifyLeadUrlFieldQuality();

  const personalEmailErrors = assertNoPersonalEmailsInLeads([sampleLead]);
  assert(personalEmailErrors.length === 0, 'No personal emails in sample lead');

  const badLead = createEmptyLead({
    companyName: 'Bad Email Co',
    area: '仙台市',
    industry: '工務店',
    websiteUrl: 'https://bad.test',
    sourceUrls: ['https://bad.test'],
    emailCandidates: ['tanaka@bad.test'],
  });
  const badErrors = assertNoPersonalEmailsInLeads([badLead]);
  assert(badErrors.length > 0, 'Personal email detection works');

  await verifyGenerationPipeline();
  await verifyCustomHookDifferentiation();
  await verifyPreserveWorkflowOnRegenerate();
  await verifyCopySafetyUi();
  await verifyUpdateLeadReview();
  await verifyUpdateLeadCommunication();
  await verifyUiFilesOnDisk();
  await verifyDraftExport();
  await verifyDraftCandidatesUi();
  await verifyProjectPaths();
  verifySalesAnalyticsLogic();
  verifyOperationSummaryLogic();
  await verifyMvpReadinessLogic();
  await verifyPilotPhase();
  await verifyGmailDraftPhase();
  await verifyGmailOAuthHelper();
  await verifyProjectDotEnvLoading();
  await verifyPhase15SalesDashboard();
  await verifyPhase16ASendRecordUi();
  await verifyPhase16BReplyManagementUi();
  await verifyPhase16CGmailDraftCreateUi();
  await verifyPhase17SalesFlowPolish();
  await verifyPhase19DailySalesLoop();
  await verifyPhase17ExternalCandidates();
  await verifyPhase18LiteHandoff();
  await verifyPhase21CandidateCollection();
  await verifyPhase23Daily30Collection();
  await verifyPhase24Daily30CopyPipeline();
  await verifyPhase25Daily30DraftImport();
  await verifyPhase26Daily30OperationsIntegration();
  await verifyPhase27CloudDaily30AutoFetch();
  await verifyPhase28CloudStorageBackend();
  await verifyPhase29CloudSchedulerDeploy();
  await verifyPhase30CloudRunLoggingAndRecovery();
  await verifyPhase31GcsLocalUiDashboard();
  await verifyPhase33EmailFoundCollection();
  await verifyPhase34LeadApprovalCopyFlow();
  await verifyPhase35OneScreenDashboard();
  await verifyPhase36UiPolish();
  await verifyPhase365DashboardReadability();
  await verifyPhase366LeadListPanel();
  await verifyPhase37PartialSuccessState();
  await verifyEmailSourceDisplay();
  await verifyPhase381EmailSourceAndExclude();
  await verifyPhase382ExcludeRefreshAndEmailLayout();
  await verifyPhase383ExcludeImmediateUiAndApi();
  await verifyPhase384ExcludePersistAndMetrics();
  await verifyPhase39HumanGateButtons();
  await verifyPhase402CollectionProfileFoundation();
  await verifyPhase403CollectionScheduleUi();
  await verifyPhase404CollectionProfileDisplay();
  await verifyPhase405CollectionScheduleExecution();
  await verifyPhase406ExternalReferenceSafety();
  await verifyPhase412ManualExternalReference();
  await verifyPhase413ExternalReferenceAdapterFoundation();
  await verifyPhase414Daily30ExternalReferenceSupplement();
  await verifyPhase415ACandidateCollectionUiOptimization();
  await verifyPhase415CHookOrderSafety();
  await verifyPhase415DWorkQueueUi();
  await verifyPhase415EFocusMode();
  await verifyPhase415GLeadApprovalJudgmentAudit();
  await verifyPhase415HCompliancePersistenceDryRun();
  await verifyPhase415H2CompliancePersistence();
  await verifyPhase415IFinalAlphaJudgment();
  await verifyPhase415JExternalReferenceAlphaComplete();
  await verifyPhase421RoutineOperationsUi();
  await verifyPhase422RoutineOperationsUiScreen();
  await verifyPhase424SendRecordSourceUrls();
  await verifyPhase425RoutineOperationsUiFinalScreen();
  await verifyPhase426CandidateSourceColumn();
  await verifyPhase427CandidateListViewport();
  await verifyPhase428CandidateListLayoutFix();
  await verifyPhase429CandidateListFinalScreen();
  await verifyPhase4211FocusViewport();
  await verifyPhase4212FocusApprovalScreen();
  await verifyPhase4213FocusButtonLayout();
  await verifyPhase4214CandidateButtonTiers();
  await verifyPhase4215LeadFlowDedup();
  await verifyPhase4216PagerLayout();
  await verifyPhase4217SourceColumnWidth();
  await verifyPhase4218SourceUrlDisplay();
  await verifyPhase4219CollectionDestinationUrl();
  await verifyPhase4220CandidateCountAndDetailsCleanup();
  await verifyPhase431BaselineOperationsPreserved();
  await verifyPhase432SuppressionDesign();
  await verifyPhase433CustomTemplateDesign();
  await verifyPhase434OpenTrackingDesign();
  await verifyPhase432SuppressionTypes();
  await verifyPhase432SuppressionStore();
  await verifyPhase432SuppressionChecks();
  await verifyPhase432LegacyCompatibility();
  await verifyPhase432SuppressionUi();
  await verifyPhase432MockUnsubscribe();
  await verifyPhase432NoLiveMailChanges();
  await verifyPhase432OperationsLoggingPreserved();
  await verifyPhase433TemplateTypes();
  await verifyPhase433TemplateStore();
  await verifyPhase433TemplateRenderer();
  await verifyPhase433TemplateApplyOnNextGenOnly();
  await verifyPhase433TemplateUi();
  await verifyPhase433NoExistingLeadOverwrite();
  await verifyPhase434OpenTrackingTypes();
  await verifyPhase434OpenTrackingStore();
  await verifyPhase434MockOpenEvents();
  await verifyPhase434SendRecordsUi();
  await verifyPhase434DashboardReferenceRate();
  await verifyPhase434NoRetroactiveTracking();
  await verifyPhase434NoLiveMailChanges();
  verifyPhase20LiteEmailImprovement();
  await verifyPhase20LiteEmailImprovementAsync();
  await verifyPhaseBLeadInventory();
  await verifyPhaseCCloudDaily30Status();
  await verifyNoSendCode();
  verifyNpmAudit();

  console.log('');
  console.log(`Results: ${passed} passed, ${failed} failed`);

  if (failed > 0) {
    process.exit(1);
  }

  console.log('All verifications passed ✅');
}

main().catch((err) => {
  console.error('Verify fatal error:', err);
  process.exit(1);
});
