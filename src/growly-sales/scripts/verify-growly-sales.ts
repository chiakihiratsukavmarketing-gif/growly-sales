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
  assert(pilotBanner.includes(PILOT_MODE_EXTERNAL_API), 'UI shows external API unused');
  assert(pilotBanner.includes(PILOT_MODE_GMAIL), 'UI shows Gmail unused');
  assert(pilotBanner.includes(PILOT_MODE_SEND_DISABLED), 'UI shows no auto-send');
  assert(pilotBanner.includes(PILOT_MODE_STORAGE), 'UI shows local JSON storage');
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
  } = await import('../workflow/replyManagementValidation.js');

  assert(inferNextActionFromReplyStatus('none') === '返信待ち', 'none maps to 返信待ち');
  assert(inferNextActionFromReplyStatus('replied') === 'フォローアップ', 'replied maps to フォローアップ');
  assert(inferNextActionFromReplyStatus('interested') === 'フォローアップ', 'interested maps to フォローアップ');
  assert(inferNextActionFromReplyStatus('requested_report') === '診断レポート作成', 'requested_report maps correctly');
  assert(inferNextActionFromReplyStatus('declined') === '対象外', 'declined maps to 対象外');
  assert(inferNextActionFromReplyStatus('bounced') === '対象外', 'bounced maps to 対象外');
  assert(isValidFollowUpDueAt('2026-06-30'), 'valid followUpDueAt accepted');
  assert(!isValidFollowUpDueAt('06/30/2026'), 'invalid followUpDueAt rejected');
  assert(REPLY_MANAGEMENT_UI_STATUSES.length === 6, 'UI has 6 reply statuses');

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
  assert(draftView.includes('送信はされません'), 'GmailDraftCandidatesView warns no send');
  assert(draftView.includes('CREATE_DRAFTS'), 'GmailDraftCandidatesView has CREATE_DRAFTS gate');
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
  assert(replyView.includes('返信待ち'), 'ReplyManagementView has awaiting reply routine');
  assert(replyView.includes('何も更新しなくてOK'), 'ReplyManagementView documents no-update path');

  const candidateView = await readFile(join(SRC_ROOT, 'ui/CandidateCollectionView.tsx'), 'utf-8');
  assert(candidateView.includes('email-outreach-candidates'), 'CandidateCollectionView documents email-outreach-candidates');
  assert(candidateView.includes('CREATE_DRAFTS'), 'CandidateCollectionView documents CREATE_DRAFTS');

  const dashboardView = await readFile(join(SRC_ROOT, 'ui/SalesDashboardView.tsx'), 'utf-8');
  assert(dashboardView.includes('DailyChecklistPanel'), 'SalesDashboardView uses DailyChecklistPanel');
  assert(dashboardView.includes('最優先アクション（1件）'), 'SalesDashboardView shows single top action');

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

  const candidateView = await readFile(join(SRC_ROOT, 'ui/CandidateCollectionView.tsx'), 'utf-8');
  assert(candidateView.includes('Daily30DashboardPanel'), 'CandidateCollectionView embeds Daily30 panel');

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

async function main(): Promise<void> {
  console.log('Growly Sales — Verify');
  console.log('========================');

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
  verifyPhase20LiteEmailImprovement();
  await verifyPhase20LiteEmailImprovementAsync();
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
