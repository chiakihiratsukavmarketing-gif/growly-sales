/**
 * Phase 15.6 — 承認〜下書き候補〜手動送信記録の実操作フロー確認
 * UIと同じ workflow ロジックを使い、leads.json を更新して検証します。
 */
import { getLeadsJsonPath, getLeadsCsvPath } from '../config/paths.js';
import { loadLeadsFromJson, saveLeadsToJson } from '../storage/jsonLeadRepository.js';
import { saveLeadsToCsv } from '../storage/csvLeadRepository.js';
import { approveLeadForDraft } from '../workflow/updateLeadReview.js';
import { markManualSent } from '../workflow/updateLeadCommunication.js';
import { buildDraftCandidatesPayload } from '../drafts/buildUiDraftCandidates.js';
import { buildSalesAnalytics } from '../analytics/buildSalesAnalytics.js';
import { applyFullGenerationToLeads } from '../generation/applyFullGeneration.js';
import { loadOfferProfile } from '../config/offerProfile.js';
import { loadTargetProfile } from '../config/targetProfile.js';

const APPROVE_NAMES = ['森のめぐみ工房', 'アオバクラフト', '佐元工務店'];
const MANUAL_SEND_NAME = 'アオバクラフト';

async function main(): Promise<void> {
  const leadsPath = getLeadsJsonPath();
  const csvPath = getLeadsCsvPath();

  console.log('Phase 15.6 — Approval / Draft / Manual Send Flow');
  console.log('================================================');

  for (const name of APPROVE_NAMES) {
    const leads = await loadLeadsFromJson(leadsPath);
    const lead = leads.find((l) => l.companyName === name);
    if (!lead) {
      console.warn(`Skip approve — not found: ${name}`);
      continue;
    }
    const updated = await approveLeadForDraft(lead.id);
    console.log(`Approved: ${name} → humanReviewStatus=${updated.humanReviewStatus}`);
  }

  let leads = await loadLeadsFromJson(leadsPath);
  console.log(`Leads loaded: ${leads.length}`);

  let draftPayload = buildDraftCandidatesPayload(leads);
  console.log(`Draft candidates (before manual send): ${draftPayload.candidates.length}`);
  if (draftPayload.candidates.length !== APPROVE_NAMES.length) {
    throw new Error(`Expected ${APPROVE_NAMES.length} draft candidates, got ${draftPayload.candidates.length}`);
  }
  for (const c of draftPayload.candidates) {
    if (c.sendStatus !== 'not_sent') throw new Error(`${c.companyName} sendStatus is not not_sent`);
    console.log(`  - ${c.companyName} sendStatus=${c.sendStatus}`);
  }

  const manualLead = leads.find((l) => l.companyName === MANUAL_SEND_NAME);
  if (!manualLead) throw new Error(`Manual send target not found: ${MANUAL_SEND_NAME}`);
  const sent = await markManualSent(manualLead.id, 'contact_form');
  console.log(`Manual sent: ${MANUAL_SEND_NAME} → sendStatus=${sent.sendStatus}`);

  leads = await loadLeadsFromJson(leadsPath);
  draftPayload = buildDraftCandidatesPayload(leads);
  console.log(`Draft candidates (after manual send): ${draftPayload.candidates.length}`);
  if (draftPayload.candidates.some((c) => c.companyName === MANUAL_SEND_NAME)) {
    throw new Error('Manual-sent lead should not appear in draft candidates');
  }

  const sugawara = leads.find((l) => l.companyName.includes('菅原'));
  if (sugawara) {
    console.log(
      `菅原 preserved: sendStatus=${sugawara.sendStatus} reply=${sugawara.replyStatus} deal=${sugawara.dealStatus}`
    );
  }

  const analytics = buildSalesAnalytics(leads);
  console.log(`Analytics manualSentLeads: ${analytics.manualSentLeads}`);
  if (analytics.manualSentLeads < 1) {
    throw new Error('Analytics should count at least 1 manual sent lead');
  }

  const target = await loadTargetProfile();
  const offer = await loadOfferProfile();
  const beforeSugawara = sugawara;
  const { leads: regenerated } = applyFullGenerationToLeads(leads, { target, offer });
  const afterSugawara = regenerated.find((l) => l.companyName.includes('菅原'));

  if (beforeSugawara && afterSugawara) {
    const preserved =
      afterSugawara.sendStatus === beforeSugawara.sendStatus &&
      afterSugawara.manualSentAt === beforeSugawara.manualSentAt &&
      afterSugawara.replyStatus === beforeSugawara.replyStatus &&
      afterSugawara.dealStatus === beforeSugawara.dealStatus;
    console.log(`Regenerate preserve 菅原: ${preserved ? 'OK' : 'FAIL'}`);
    if (!preserved) throw new Error('preserveWorkflowState failed for 菅原工務店');
  }

  const hooks = regenerated.map((l) => l.customHook.trim());
  const uniqueHooks = new Set(hooks);
  console.log(`Unique customHooks after regenerate: ${uniqueHooks.size}/${hooks.length}`);
  if (uniqueHooks.size < 2) {
    throw new Error('customHooks are not differentiated');
  }

  await saveLeadsToJson(leadsPath, regenerated);
  await saveLeadsToCsv(csvPath, regenerated);

  console.log('');
  console.log('Phase 15.6 flow check completed ✅');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
