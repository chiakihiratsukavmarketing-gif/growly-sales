/**
 * 送信前の下書き済みLeadに新テンプレートを反映（タカコウ・ハウス等）。
 * Gmail下書きの実作成は行わない。
 */
import { loadOfferProfile } from '../config/offerProfile.js';
import { refreshLeadSalesEmailTemplate } from '../generation/applyFullGeneration.js';
import { getLeadsCsvPath, getLeadsJsonPath } from '../config/paths.js';
import { loadLeadsFromJson, saveLeadsToJson } from '../storage/jsonLeadRepository.js';
import { saveLeadsToCsv } from '../storage/csvLeadRepository.js';

const TARGET_COMPANY = 'タカコウ・ハウス';

async function main(): Promise<void> {
  const offer = await loadOfferProfile();
  const leads = await loadLeadsFromJson(getLeadsJsonPath());
  let found = false;

  const updated = leads.map((lead) => {
    if (lead.companyName !== TARGET_COMPANY) return lead;
    found = true;
    return refreshLeadSalesEmailTemplate(lead, offer);
  });

  if (!found) {
    console.error(`Lead not found: ${TARGET_COMPANY}`);
    process.exit(1);
  }

  await saveLeadsToJson(getLeadsJsonPath(), updated);
  await saveLeadsToCsv(getLeadsCsvPath(), updated);

  const target = updated.find((l) => l.companyName === TARGET_COMPANY)!;
  console.log(`Updated: ${TARGET_COMPANY}`);
  console.log(`  emailSubject: ${target.emailSubject}`);
  console.log(`  gmailDraftStatus: ${target.gmailDraftStatus}`);
  console.log(`  gmailDraftId: ${target.gmailDraftId ?? 'null'}`);
  console.log(`  nextAction: ${target.nextAction}`);
  console.log('');
  console.log('※ Gmail下書きは未作成。人間確認後に CREATE_DRAFTS で作成してください。');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
