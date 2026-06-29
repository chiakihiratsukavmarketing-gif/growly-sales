/**
 * 指定Leadの customHook を手動更新し、営業メール本文を再生成する。
 * Gmail下書き作成・送信は行わない。
 */
import { loadOfferProfile } from '../config/offerProfile.js';
import { refreshLeadSalesEmailTemplate } from '../generation/applyFullGeneration.js';
import { getLeadsCsvPath, getLeadsJsonPath } from '../config/paths.js';
import { loadLeadsFromJson, saveLeadsToJson } from '../storage/jsonLeadRepository.js';
import { saveLeadsToCsv } from '../storage/csvLeadRepository.js';

const HOOK_UPDATES: Record<
  string,
  { customHook: string; customHookReason: string }
> = {
  株式会社徳田工務店: {
    customHook:
      '長く地域で家づくりに向き合ってこられた歩みや、お客様の声から伝わる住まいづくりへの姿勢がとても印象的でした。',
    customHookReason: 'お客様の声ページと会社概要から家づくりの姿勢が伝わる',
  },
  株式会社仙臺屋: {
    customHook:
      '施工事例から伝わる住まいの雰囲気や、仙台での家づくりに根ざした発信素材をお持ちだと感じました。',
    customHookReason: '施工事例と仙台での家づくりに根ざした発信素材',
  },
};

async function main(): Promise<void> {
  const offer = await loadOfferProfile();
  const leads = await loadLeadsFromJson(getLeadsJsonPath());

  const updated = leads.map((lead) => {
    const patch = HOOK_UPDATES[lead.companyName];
    if (!patch) return lead;

    const withHook = {
      ...lead,
      customHook: patch.customHook,
      customHookReason: patch.customHookReason,
    };
    return refreshLeadSalesEmailTemplate(withHook, offer);
  });

  await saveLeadsToJson(getLeadsJsonPath(), updated);
  await saveLeadsToCsv(getLeadsCsvPath(), updated);

  for (const name of Object.keys(HOOK_UPDATES)) {
    const lead = updated.find((l) => l.companyName === name);
    if (!lead) continue;
    console.log(`Updated: ${name}`);
    console.log(`  customHook: ${lead.customHook}`);
    console.log(`  印象行: ${lead.emailBody.split('\n\n')[2] ?? ''}`);
    console.log(`  reviewStatus: ${lead.reviewStatus}`);
    console.log('');
  }

  console.log('※ Gmail下書き未作成。npm run growly-sales:gmail-preview-targets で再確認してください。');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
