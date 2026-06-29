import { extractWebsiteContacts } from '../collectors/extractWebsiteContacts.js';
import { getLeadsJsonPath } from '../config/paths.js';
import { loadOfferProfile } from '../config/offerProfile.js';
import { loadTargetProfile } from '../config/targetProfile.js';
import { applyScoringToLead } from '../scoring/generateSalesAngle.js';
import { validateLeadSafety } from '../safety/validateLeadSafety.js';
import { loadLeadsFromJson, saveLeadsToJson } from '../storage/jsonLeadRepository.js';
import { applyFullGenerationToLead } from '../generation/applyFullGeneration.js';
import { refreshLeadContactFields, websiteHostKey } from '../workflow/refreshLeadContactFields.js';

const TARGET_HOSTS = [
  'sustainalife.co.jp',
  'tokuta.jp',
  'sendaiya1000.com',
];

async function main(): Promise<void> {
  const [leads, offer, target] = await Promise.all([
    loadLeadsFromJson(getLeadsJsonPath()),
    loadOfferProfile(),
    loadTargetProfile(),
  ]);

  let updated = 0;

  for (const host of TARGET_HOSTS) {
    const lead = leads.find((l) => websiteHostKey(l.websiteUrl) === host);
    if (!lead) {
      console.log(`skip: ${host} (lead not found)`);
      continue;
    }

    console.log(`Refreshing: ${lead.companyName} (${lead.websiteUrl})`);
    const extraction = await extractWebsiteContacts(lead.websiteUrl);
    let refreshed = refreshLeadContactFields(lead, extraction);
    const safety = validateLeadSafety(refreshed, { offer, target });
    refreshed = safety.lead;
    refreshed = applyScoringToLead(refreshed, { offer, target });

    if (refreshed.collectionStatus !== 'failed' && refreshed.emailCandidates.length > 0) {
      refreshed = applyFullGenerationToLead(refreshed, { offer, target });
    }

    const index = leads.findIndex((l) => l.id === lead.id);
    leads[index] = refreshed;
    updated++;
    console.log(
      `  -> ${refreshed.collectionStatus}, emails=${refreshed.emailCandidates.join(', ') || 'none'}, review=${refreshed.reviewStatus}`
    );
  }

  await saveLeadsToJson(getLeadsJsonPath(), leads);
  console.log(`Updated ${updated} leads`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
