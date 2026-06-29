import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { applyFullGenerationToLeads } from '../generation/applyFullGeneration.js';
import { loadOfferProfile } from '../config/offerProfile.js';
import { loadTargetProfile } from '../config/targetProfile.js';
import {
  getGrowlySalesDataDir,
  getLeadsCsvPath,
  getLeadsJsonPath,
} from '../config/paths.js';
import { loadLeadsFromJson, saveLeadsToJson } from '../storage/jsonLeadRepository.js';
import { saveLeadsToCsv } from '../storage/csvLeadRepository.js';

const PATHS = {
  leadsJson: getLeadsJsonPath(),
  leadsCsv: getLeadsCsvPath(),
  runLog: join(getGrowlySalesDataDir(), 'generate-log.json'),
};

async function main(): Promise<void> {
  console.log('Growly Sales — Generate Pipeline');
  console.log('=================================');

  const targetProfile = await loadTargetProfile();
  const offerProfile = await loadOfferProfile();
  const leads = await loadLeadsFromJson(PATHS.leadsJson);

  if (leads.length === 0) {
    console.log('No leads found. Run growly-sales:day1 first.');
    return;
  }

  const { leads: updated, stats } = applyFullGenerationToLeads(leads, {
    target: targetProfile,
    offer: offerProfile,
  });

  await saveLeadsToJson(PATHS.leadsJson, updated);
  await saveLeadsToCsv(PATHS.leadsCsv, updated);

  const log = {
    runAt: new Date().toISOString(),
    ...stats,
    note: '自動送信なし。humanReviewStatus=pending, sendStatus=not_sent',
  };

  await mkdir(dirname(PATHS.runLog), { recursive: true });
  await writeFile(PATHS.runLog, JSON.stringify(log, null, 2), 'utf-8');

  console.log(`Processed: ${stats.processed}`);
  console.log(`Generated: ${stats.generated}`);
  console.log(`Approved: ${stats.approved}`);
  console.log(`Revise: ${stats.revised}`);
  console.log(`Rejected: ${stats.rejected}`);
  console.log(`Skipped (outreach ineligible): ${stats.skipped}`);
  console.log(`Output: ${PATHS.leadsJson}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
