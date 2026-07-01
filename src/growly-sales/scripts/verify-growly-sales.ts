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
  assert(draftDialog.includes('CREATE_DRAFTS'), 'GmailDraftCreateDialog has CREATE_DRAFTS gate');
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
  assert(candidateView.includes('収集時メール取得'), 'UI separates collection-time email KPI');
  assert(candidateView.includes('Lead化承認待ち'), 'UI shows lead approval pending');
  assert(!candidateView.includes('今日の収集'), 'UI removed misleading collected KPI label');
  assert(candidateView.includes('総収集候補'), 'UI shows total collected helper');
  assert(candidateView.includes('フォームのみ'), 'UI shows form-only helper');

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
  assert(leadPanel.includes('営業文生成'), 'generate copy button label');
  assert(leadPanel.includes('btn-sm'), 'generate button compact size');

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
  assert(candidateView.includes('収集時メール取得'), 'candidate view collection-time label');
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
  assert(candidateView.includes('メール取得済み'), 'candidate view shows email-found KPI');
  assert(candidateView.includes('総収集候補'), 'candidate view shows total collected helper');
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
