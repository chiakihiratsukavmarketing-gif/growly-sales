import { getLeadsJsonPath } from '../config/paths.js';
import { loadOfferProfile } from '../config/offerProfile.js';
import { exportDraftCandidates } from '../drafts/exportDraftCandidates.js';
import { loadLeadsFromJson } from '../storage/jsonLeadRepository.js';

const LEADS_JSON = getLeadsJsonPath();

async function main(): Promise<void> {
  console.log('Growly Sales — Export Draft Candidates');
  console.log('=========================================');
  console.log('');
  console.log('⚠️  注意: これはGmail下書きではなく、手動確認用エクスポートです。');
  console.log('⚠️  自動送信は行いません。sendStatus は変更しません。');
  console.log(`Leads path: ${LEADS_JSON}`);
  console.log('');

  const offer = await loadOfferProfile();
  const leads = await loadLeadsFromJson(LEADS_JSON);

  if (leads.length === 0) {
    console.log('No leads found. Run growly-sales:day1 and growly-sales:generate first.');
    return;
  }

  const result = await exportDraftCandidates(leads, offer);

  console.log(`Total leads:     ${result.totalLeads}`);
  console.log(`Candidates:      ${result.candidates.length}`);
  console.log(`Excluded:        ${result.excluded.length}`);
  console.log('');
  console.log('Output files:');
  for (const file of result.outputFiles) {
    console.log(`  - ${file}`);
  }

  if (result.excluded.length > 0) {
    console.log('');
    console.log('Excluded leads:');
    for (const item of result.excluded) {
      console.log(`  - ${item.companyName}: ${item.reason}`);
    }
  }

  if (result.candidates.length === 0) {
    console.log('');
    console.log('下書き候補は0件です。UIで humanReviewStatus=approved にしてから再実行してください。');
  }

  console.log('');
  console.log('Export complete. sendStatus は not_sent のままです。');
}

main().catch((err) => {
  console.error('Export fatal error:', err);
  process.exit(1);
});
