/**
 * 送信前Leadの営業メール署名を新形式（改行詰め・会社用メール）で再生成。
 * draft_created の Lead は旧Gmail下書きを無効化する。
 */
import { loadOfferProfile } from '../config/offerProfile.js';
import { refreshLeadSalesEmailTemplate } from '../generation/applyFullGeneration.js';
import { getLeadsCsvPath, getLeadsJsonPath } from '../config/paths.js';
import { isFollowUpOnlyLead } from '../outreach/outreachEligibility.js';
import { loadLeadsFromJson, saveLeadsToJson } from '../storage/jsonLeadRepository.js';
import { saveLeadsToCsv } from '../storage/csvLeadRepository.js';

function shouldRefresh(lead: {
  sendStatus: string;
  customHook: string | null;
  emailBody: string;
  doNotContact: boolean;
}): boolean {
  if (lead.doNotContact) return false;
  if (lead.sendStatus !== 'not_sent') return false;
  if (!lead.customHook?.trim()) return false;
  if (!lead.emailBody?.trim()) return false;
  return true;
}

async function main(): Promise<void> {
  const offer = await loadOfferProfile();
  const leads = await loadLeadsFromJson(getLeadsJsonPath());
  const refreshed: string[] = [];
  const clearedDrafts: string[] = [];

  const updated = leads.map((lead) => {
    if (!shouldRefresh(lead) || isFollowUpOnlyLead(lead)) return lead;
    const hadDraft = lead.gmailDraftStatus === 'draft_created';
    const next = refreshLeadSalesEmailTemplate(lead, offer);
    if (next.emailBody !== lead.emailBody || next.emailSubject !== lead.emailSubject) {
      refreshed.push(lead.companyName);
      if (hadDraft && next.gmailDraftStatus === 'none') {
        clearedDrafts.push(lead.companyName);
      }
    }
    return next;
  });

  await saveLeadsToJson(getLeadsJsonPath(), updated);
  await saveLeadsToCsv(getLeadsCsvPath(), updated);

  console.log(`Refreshed signature: ${refreshed.length} lead(s)`);
  for (const name of refreshed) {
    console.log(`  - ${name}`);
  }
  if (clearedDrafts.length > 0) {
    console.log('');
    console.log(`Gmail下書き無効化: ${clearedDrafts.length} lead(s) — CREATE_DRAFTS で再作成してください`);
    for (const name of clearedDrafts) {
      console.log(`  - ${name}`);
    }
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
