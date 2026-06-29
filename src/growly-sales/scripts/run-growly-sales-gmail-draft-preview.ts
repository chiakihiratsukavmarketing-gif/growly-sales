import { getLeadsJsonPath } from '../config/paths.js';
import { loadOfferProfile } from '../config/offerProfile.js';
import { previewGmailDrafts } from '../integrations/gmail/previewGmailDrafts.js';
import { loadLeadsFromJson } from '../storage/jsonLeadRepository.js';

async function main(): Promise<void> {
  console.log('Growly Sales — Gmail Draft Preview (dry-run)');
  console.log('==========================================');
  console.log('※ Gmail APIには接続しません。sendStatus / gmailDraftStatus は変更しません。');
  console.log('');

  const leadsPath = getLeadsJsonPath();
  const leads = await loadLeadsFromJson(leadsPath);
  const offer = await loadOfferProfile();
  const preview = previewGmailDrafts(leads, offer);

  console.log(`Leads: ${leads.length}`);
  console.log(`Gmail下書き作成候補（emailCandidatesあり）: ${preview.eligible.length}`);
  console.log(`スキップ（問い合わせフォームのみ）: ${preview.skipped.length}`);
  console.log(`除外（未承認・送信済み等）: ${preview.excluded.length}`);
  console.log('');

  if (preview.eligible.length > 0) {
    console.log('--- 作成予定 ---');
    for (const item of preview.eligible) {
      console.log('');
      console.log(`Lead ID: ${item.leadId}`);
      console.log(`会社名: ${item.companyName}（${item.area} / ${item.industry}）`);
      console.log(`宛先: ${item.to}`);
      console.log(`件名: ${item.emailSubject}`);
      console.log(`sendStatus: ${item.sendStatus} / gmailDraftStatus: ${item.gmailDraftStatus}`);
      console.log('本文（先頭200文字）:');
      console.log(item.emailBody.slice(0, 200) + (item.emailBody.length > 200 ? '…' : ''));
      if (item.contactFormUrl) {
        console.log(`問い合わせフォーム: ${item.contactFormUrl}`);
      }
    }
  }

  if (preview.skipped.length > 0) {
    console.log('');
    console.log('--- スキップ（Gmail下書き対象外） ---');
    for (const item of preview.skipped) {
      console.log(`- ${item.companyName}: ${item.reason}`);
    }
  }

  if (preview.excluded.length > 0) {
    console.log('');
    console.log('--- 除外 ---');
    for (const item of preview.excluded.slice(0, 10)) {
      console.log(`- ${item.companyName}: ${item.reason}`);
    }
    if (preview.excluded.length > 10) {
      console.log(`  …他 ${preview.excluded.length - 10} 件`);
    }
  }

  console.log('');
  console.log(preview.note);
  console.log('');
  console.log('実作成: npm run growly-sales:gmail-create-drafts（CREATE_DRAFTS 確認必須）');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
