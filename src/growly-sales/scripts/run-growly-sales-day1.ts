import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { extractWebsiteContacts, type WebsiteContactExtraction } from '../collectors/extractWebsiteContacts.js';
import {
  getGrowlySalesDataDir,
  getInputSitesCsvPath,
  getLeadsCsvPath,
  getLeadsJsonPath,
} from '../config/paths.js';
import { loadOfferProfile } from '../config/offerProfile.js';
import { loadTargetProfile } from '../config/targetProfile.js';
import { applyScoringToLead } from '../scoring/generateSalesAngle.js';
import { validateLeadSafety } from '../safety/validateLeadSafety.js';
import { loadInputSitesCsv, saveLeadsToCsv } from '../storage/csvLeadRepository.js';
import { hasMojibakeInInputFields } from '../storage/csvEncoding.js';
import type { LeadInputRow } from '../types/lead.js';
import type { OfferProfile } from '../config/offerProfile.js';
import type { TargetProfile } from '../config/targetProfile.js';
import { loadLeadsFromJson, saveLeadsToJson } from '../storage/jsonLeadRepository.js';
import { createEmptyLead } from '../types/lead.js';
import { mergeAndDedupeLeads, filterNewLeads } from '../workflow/dedupeLeads.js';
import {
  findLeadByWebsiteHost,
  refreshLeadContactFields,
} from '../workflow/refreshLeadContactFields.js';

const PATHS = {
  input: getInputSitesCsvPath(),
  leadsJson: getLeadsJsonPath(),
  leadsCsv: getLeadsCsvPath(),
  runLog: join(getGrowlySalesDataDir(), 'run-log.json'),
};

interface RunLog {
  runAt: string;
  inputFile: string;
  processed: number;
  added: number;
  skippedDuplicates: number;
  failed: number;
  errors: Array<{ companyName: string; websiteUrl: string; error: string }>;
  warnings: string[];
  csvEncodingWarnings: string[];
}

async function buildLeadFromRow(
  row: LeadInputRow,
  profiles: { target: TargetProfile; offer: OfferProfile }
): Promise<{
  lead: ReturnType<typeof createEmptyLead>;
  extraction: WebsiteContactExtraction;
  warnings: string[];
}> {
  const inputHasMojibake = hasMojibakeInInputFields(row);
  const extraction = await extractWebsiteContacts(row.websiteUrl);

  let lead = createEmptyLead({
    companyName: row.companyName,
    area: row.area,
    industry: row.industry,
    websiteUrl: row.websiteUrl,
    instagramUrl: extraction.instagramUrl,
    emailCandidates: extraction.emailCandidates,
    emailCandidateSourceUrls: extraction.emailCandidateSourceUrls,
    emailCandidateConfidence: extraction.emailCandidateConfidence,
    emailContactType: extraction.emailContactType,
    contactPathType: extraction.contactPathType,
    contactPathConfidence: extraction.contactPathConfidence,
    contactFormUrl: extraction.contactFormUrl,
    recruitUrl: extraction.recruitUrl,
    caseStudyUrl: extraction.caseStudyUrl,
    companyProfileUrl: extraction.companyProfileUrl,
    sourceUrls: extraction.sourceUrls,
    collectionStatus:
      extraction.collectionStatus === 'needs_review' ? 'needs_review' : extraction.collectionStatus,
    riskLevel:
      extraction.collectionStatus === 'needs_review'
        ? 'high'
        : extraction.collectionStatus === 'collected'
          ? 'low'
          : 'medium',
  });

  const safety = validateLeadSafety(lead, {
    suspiciousEmails: extraction.suspiciousEmails,
  });
  lead = safety.lead;

  lead = applyScoringToLead(lead, { offer: profiles.offer, target: profiles.target });

  const warnings = [...safety.warnings];

  if (inputHasMojibake) {
    lead.collectionStatus = 'needs_review';
    lead.humanReviewStatus = 'pending';
    lead.riskLevel = 'high';
    lead.leadScore = 'C';
    lead.nextAction = 'CSV文字化け — UTF-8で再保存して人間確認';
    warnings.push(
      `CSV encoding warning: mojibake detected for ${row.companyName || row.websiteUrl}`
    );
  } else if (extraction.emailNeedsReview) {
    lead.collectionStatus = 'needs_review';
    lead.riskLevel = 'high';
    lead.humanReviewStatus = 'pending';
    lead.nextAction = 'script/hidden由来メール検出 — 人間確認';
    warnings.push(`${row.companyName}: suspicious emails in script/hidden elements`);
  } else if (extraction.collectionStatus === 'failed') {
    lead.riskLevel = 'high';
    lead.humanReviewStatus = 'pending';
    lead.leadScore = 'C';
    lead.nextAction = '公式サイト取得失敗 — 人間確認';
  } else if (lead.emailCandidates.length > 0 || lead.contactFormUrl) {
    lead.riskLevel = 'low';
  }

  lead = applyScoringToLead(lead, { offer: profiles.offer, target: profiles.target });

  if (extraction.rejectedEmails.length > 0) {
    warnings.push(
      `${row.companyName}: rejected emails — ${extraction.rejectedEmails.join(', ')}`
    );
  }
  if (extraction.error) {
    warnings.push(`${row.companyName}: ${extraction.error}`);
  }

  return { lead, extraction, warnings };
}

async function main(): Promise<void> {
  console.log('Growly Sales — Day 1 Pipeline');
  console.log('================================');

  const targetProfile = await loadTargetProfile();
  const offerProfile = await loadOfferProfile();
  const profiles = { target: targetProfile, offer: offerProfile };

  const { rows: inputRows, encodingWarnings } = await loadInputSitesCsv(PATHS.input);
  const existingLeads = await loadLeadsFromJson(PATHS.leadsJson);

  const runLog: RunLog = {
    runAt: new Date().toISOString(),
    inputFile: PATHS.input,
    processed: 0,
    added: 0,
    skippedDuplicates: 0,
    failed: 0,
    errors: [],
    warnings: [],
    csvEncodingWarnings: [...encodingWarnings],
  };

  if (encodingWarnings.length > 0) {
    console.warn('CSV encoding warnings detected:');
    encodingWarnings.forEach((w) => console.warn(`  - ${w}`));
  }

  const generatedLeads: ReturnType<typeof createEmptyLead>[] = [];
  const refreshedLeadIds = new Set<string>();
  let refreshedCount = 0;

  for (const row of inputRows) {
    if (!row.companyName || !row.websiteUrl) {
      runLog.warnings.push(`Skipped row with missing companyName or websiteUrl`);
      continue;
    }

    runLog.processed++;
    console.log(`Processing: ${row.companyName} (${row.websiteUrl})`);

    try {
      const { lead, extraction, warnings } = await buildLeadFromRow(row, profiles);
      const existingMatch = findLeadByWebsiteHost(existingLeads, row.websiteUrl);

      if (existingMatch) {
        let refreshed = refreshLeadContactFields(existingMatch, extraction);
        const safety = validateLeadSafety(refreshed, {
          suspiciousEmails: extraction.suspiciousEmails,
        });
        refreshed = safety.lead;
        refreshed = applyScoringToLead(refreshed, { offer: profiles.offer, target: profiles.target });
        generatedLeads.push(refreshed);
        refreshedLeadIds.add(refreshed.id);
        refreshedCount++;
        runLog.warnings.push(...warnings, ...safety.warnings);
        runLog.warnings.push(`${row.companyName}: refreshed existing lead contact fields`);
        console.log(`  Refreshed existing lead (${refreshed.emailCandidates.length} emails)`);
      } else {
        generatedLeads.push(lead);
        runLog.warnings.push(...warnings);
      }

      const lastLead = generatedLeads[generatedLeads.length - 1];
      if (lastLead.collectionStatus === 'failed') {
        runLog.failed++;
        runLog.errors.push({
          companyName: row.companyName,
          websiteUrl: row.websiteUrl,
          error: warnings.find((w) => w.includes(row.companyName)) ?? 'Collection failed',
        });
      }
    } catch (err) {
      runLog.failed++;
      const errorMsg = err instanceof Error ? err.message : String(err);
      runLog.errors.push({
        companyName: row.companyName,
        websiteUrl: row.websiteUrl,
        error: errorMsg,
      });
      console.error(`  Error: ${errorMsg}`);
    }
  }

  const incomingForNewOnly = generatedLeads.filter((l) => !refreshedLeadIds.has(l.id));
  const { newLeads, duplicates } = filterNewLeads(existingLeads, incomingForNewOnly);
  runLog.skippedDuplicates = duplicates.length;
  runLog.added = newLeads.length;

  const refreshedMap = new Map(
    generatedLeads.filter((l) => refreshedLeadIds.has(l.id)).map((l) => [l.id, l])
  );
  const mergedExisting = existingLeads.map((lead) => refreshedMap.get(lead.id) ?? lead);
  const allLeads = mergeAndDedupeLeads(mergedExisting, newLeads);

  await saveLeadsToJson(PATHS.leadsJson, allLeads);
  await saveLeadsToCsv(PATHS.leadsCsv, allLeads);

  await mkdir(dirname(PATHS.runLog), { recursive: true });
  await writeFile(PATHS.runLog, JSON.stringify(runLog, null, 2), 'utf-8');

  console.log('');
  console.log(`Processed: ${runLog.processed}`);
  console.log(`Added: ${runLog.added}`);
  console.log(`Refreshed: ${refreshedCount}`);
  console.log(`Skipped duplicates: ${runLog.skippedDuplicates}`);
  console.log(`Failed: ${runLog.failed}`);
  console.log(`Total leads: ${allLeads.length}`);
  console.log(`Output: ${PATHS.leadsJson}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
