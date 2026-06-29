/**
 * 返信管理フェーズの準備: 送信済みLeadの nextAction / 返信管理フィールドを正規化。
 * 自動送信は行わない。
 */
import { getLeadsCsvPath, getLeadsJsonPath } from '../config/paths.js';
import { loadLeadsFromJson, saveLeadsToJson } from '../storage/jsonLeadRepository.js';
import { saveLeadsToCsv } from '../storage/csvLeadRepository.js';
import {
  buildReplyManagementView,
  countAwaitingReplyLeads,
  prepareLeadForReplyPhase,
  selectAwaitingReplyLeads,
} from '../workflow/replyManagement.js';

async function main(): Promise<void> {
  const leadsPath = getLeadsJsonPath();
  const leads = await loadLeadsFromJson(leadsPath);

  const updated = leads.map((lead) => {
    const contacted = lead.sendStatus === 'sent' || lead.sendStatus === 'manual_sent';
    if (!contacted) return lead;
    return prepareLeadForReplyPhase(lead);
  });

  await saveLeadsToJson(leadsPath, updated);
  await saveLeadsToCsv(getLeadsCsvPath(), updated);

  const awaiting = selectAwaitingReplyLeads(updated);
  const sentInitial = updated.filter((l) => l.sendStatus === 'sent');

  console.log('Growly Sales — Reply Phase Prepare');
  console.log('=================================');
  console.log(`sendStatus=sent: ${sentInitial.length}`);
  console.log(`返信待ち (sent + replyStatus=none): ${countAwaitingReplyLeads(updated)}`);
  console.log('');

  for (const lead of awaiting) {
    const view = buildReplyManagementView(lead);
    console.log(`- ${view.companyName}`);
    console.log(`  nextAction: ${view.nextAction}`);
    console.log(`  replyStatus: ${view.replyStatus}`);
    console.log(`  gmailDraftId: ${view.gmailDraftId ?? '—'}`);
  }

  const followUp = updated.filter((l) => l.sendStatus === 'manual_sent' && l.replyStatus === 'replied');
  if (followUp.length > 0) {
    console.log('');
    console.log('フォローアップ対象:');
    for (const lead of followUp) {
      const view = buildReplyManagementView(lead);
      console.log(`- ${view.companyName}: nextAction=${view.nextAction}`);
    }
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
