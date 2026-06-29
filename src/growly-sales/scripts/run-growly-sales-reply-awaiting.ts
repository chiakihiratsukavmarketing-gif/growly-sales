/**
 * 返信待ち・返信管理サマリー（読み取り専用）
 */
import { getLeadsJsonPath } from '../config/paths.js';
import { loadLeadsFromJson } from '../storage/jsonLeadRepository.js';
import {
  buildReplyManagementView,
  countAwaitingReplyLeads,
  selectAwaitingReplyLeads,
} from '../workflow/replyManagement.js';

async function main(): Promise<void> {
  const leads = await loadLeadsFromJson(getLeadsJsonPath());
  const awaiting = selectAwaitingReplyLeads(leads);

  console.log('Growly Sales — Reply Awaiting Summary');
  console.log('=====================================');
  console.log(`返信待ち: ${countAwaitingReplyLeads(leads)}件`);
  console.log('');

  for (const lead of awaiting) {
    const view = buildReplyManagementView(lead);
    console.log(`--- ${view.companyName} ---`);
    console.log(`sendStatus: ${view.sendStatus}`);
    console.log(`replyStatus: ${view.replyStatus}`);
    console.log(`nextAction: ${view.nextAction}`);
    console.log(`manualSentAt: ${lead.manualSentAt ?? '—'}`);
    console.log(`repliedAt: ${view.repliedAt ?? '—'}`);
    console.log(`followUpDueAt: ${view.followUpDueAt ?? '—'}`);
    console.log(`replySummary: ${view.replySummary || '—'}`);
    console.log(`communicationMemo: ${view.communicationMemo || '—'}`);
    console.log('');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
