/**
 * 菅誠・徳田・仙臺屋: 旧Gmail下書きを無効化し、署名Emailを再生成（送信済みLeadは触らない）。
 */
import { loadOfferProfile } from '../config/offerProfile.js';
import { refreshLeadSalesEmailTemplate } from '../generation/applyFullGeneration.js';
import { getLeadsCsvPath, getLeadsJsonPath } from '../config/paths.js';
import { loadLeadsFromJson, saveLeadsToJson } from '../storage/jsonLeadRepository.js';
import { saveLeadsToCsv } from '../storage/csvLeadRepository.js';
import type { Lead } from '../types/lead.js';

const TARGET_COMPANIES = [
  '株式会社菅誠建設工業',
  '株式会社徳田工務店',
  '株式会社仙臺屋',
] as const;

function invalidateStaleDraft(lead: Lead): Lead {
  if (lead.gmailDraftStatus !== 'draft_created' || !lead.gmailDraftId) {
    return lead;
  }
  const staleDraftId = lead.gmailDraftId;
  const now = new Date().toISOString();
  return {
    ...lead,
    communicationMemo: [lead.communicationMemo, `旧Gmail下書き無効（${staleDraftId}）`]
      .filter(Boolean)
      .join(' / '),
    gmailDraftStatus: 'none',
    gmailDraftId: null,
    gmailDraftCreatedAt: null,
    gmailDraftError: '',
    nextAction: '送信元設定更新済。npm run growly-sales:gmail-create-drafts-targets（CREATE_DRAFTS 必須）',
    updatedAt: now,
  };
}

async function main(): Promise<void> {
  const offer = await loadOfferProfile();
  const leads = await loadLeadsFromJson(getLeadsJsonPath());

  const updated = leads.map((lead) => {
    if (!(TARGET_COMPANIES as readonly string[]).includes(lead.companyName)) return lead;
    if (lead.sendStatus !== 'not_sent') return lead;

    let next = invalidateStaleDraft(lead);
    next = refreshLeadSalesEmailTemplate(next, offer);
    return next;
  });

  await saveLeadsToJson(getLeadsJsonPath(), updated);
  await saveLeadsToCsv(getLeadsCsvPath(), updated);

  console.log('Updated target companies (draft invalidate + signature refresh):');
  for (const name of TARGET_COMPANIES) {
    const lead = updated.find((l) => l.companyName === name);
    if (!lead) {
      console.log(`  - ${name}: not found`);
      continue;
    }
    console.log(`  - ${name}`);
    console.log(`      gmailDraftStatus: ${lead.gmailDraftStatus}`);
    console.log(`      signature email in body: ${lead.emailBody.includes('c_hiratsuka@wantreach.jp') ? 'yes' : 'no'}`);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
