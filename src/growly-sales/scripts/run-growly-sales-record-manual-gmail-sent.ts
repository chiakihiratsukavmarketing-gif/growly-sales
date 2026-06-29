/**
 * Gmail手動送信（manual_gmail）を sendStatus=sent として記録。
 * 自動送信は行わない — 人間がGmailで送信済みの事後記録のみ。
 */
import { getLeadsCsvPath, getLeadsJsonPath } from '../config/paths.js';
import { countAwaitingReplyLeads, inferNextActionForLead } from '../workflow/replyManagement.js';
import { loadLeadsFromJson, saveLeadsToJson } from '../storage/jsonLeadRepository.js';
import { saveLeadsToCsv } from '../storage/csvLeadRepository.js';
import { loadOfferProfile } from '../config/offerProfile.js';
import { selectTopEmailOutreachCandidates } from '../outreach/outreachPolicy.js';
import type { Lead } from '../types/lead.js';

const SENT_AT = new Date().toISOString();

const TARGETS = [
  {
    companyName: '株式会社菅誠建設工業',
    draftId: 'r433259733299491121',
    to: 'office@sgse.jp',
    from: 'c_hiratsuka@wantreach.jp',
    replyTo: 'c_hiratsuka@wantreach.jp',
  },
  {
    companyName: '株式会社徳田工務店',
    draftId: 'r-7187232031728469986',
    to: 'info@tokuta.jp',
    from: 'c_hiratsuka@wantreach.jp',
    replyTo: 'c_hiratsuka@wantreach.jp',
  },
  {
    companyName: '株式会社仙臺屋',
    draftId: 'r3149205130896725624',
    to: 'info@sendaiya1000.com',
    from: 'c_hiratsuka@wantreach.jp',
    replyTo: 'c_hiratsuka@wantreach.jp',
  },
] as const;

function buildSentMemo(target: (typeof TARGETS)[number]): string {
  return [
    `Gmail手動送信（manual_gmail）`,
    `draftId=${target.draftId}`,
    `To=${target.to}`,
    `From=${target.from}`,
    `Reply-To=${target.replyTo}`,
  ].join(' / ');
}

function applyManualGmailSent(lead: Lead, target: (typeof TARGETS)[number]): Lead {
  if (lead.gmailDraftId !== target.draftId) {
    throw new Error(
      `${target.companyName}: draftId mismatch lead=${lead.gmailDraftId ?? 'null'} expected=${target.draftId}`
    );
  }
  if (lead.emailCandidates[0] !== target.to) {
    throw new Error(
      `${target.companyName}: To mismatch lead=${lead.emailCandidates[0] ?? 'null'} expected=${target.to}`
    );
  }

  const memoLine = buildSentMemo(target);
  const communicationMemo = lead.communicationMemo.includes(memoLine)
    ? lead.communicationMemo
    : [lead.communicationMemo, memoLine].filter(Boolean).join(' / ');

  const next: Lead = {
    ...lead,
    sendStatus: 'sent',
    manualSentAt: SENT_AT,
    manualSendMethod: 'email',
    nextAction: inferNextActionForLead({ ...lead, sendStatus: 'sent' }),
    communicationMemo,
    updatedAt: SENT_AT,
  };
  return next;
}

async function main(): Promise<void> {
  const leads = await loadLeadsFromJson(getLeadsJsonPath());
  const byName = new Map(TARGETS.map((t) => [t.companyName, t]));

  const updated = leads.map((lead) => {
    const target = byName.get(lead.companyName as (typeof TARGETS)[number]['companyName']);
    if (!target) return lead;
    return applyManualGmailSent(lead, target);
  });

  await saveLeadsToJson(getLeadsJsonPath(), updated);
  await saveLeadsToCsv(getLeadsCsvPath(), updated);

  const initialSentCount = updated.filter((l) => l.sendStatus === 'sent').length;
  const awaitingReply = countAwaitingReplyLeads(updated);

  const offer = await loadOfferProfile();
  const nextCandidates = selectTopEmailOutreachCandidates(updated, 5, offer);

  console.log('Growly Sales — Record Manual Gmail Sent');
  console.log('======================================');
  console.log(`sentAt: ${SENT_AT}`);
  console.log('');

  for (const target of TARGETS) {
    const lead = updated.find((l) => l.companyName === target.companyName)!;
    console.log(`--- ${target.companyName} ---`);
    console.log(`sendStatus: ${lead.sendStatus}`);
    console.log(`manualSentAt: ${lead.manualSentAt}`);
    console.log(`manualSendMethod: email (manual_gmail)`);
    console.log(`draftId: ${target.draftId}`);
    console.log(`From: ${target.from}`);
    console.log(`Reply-To: ${target.replyTo}`);
    console.log(`To: ${target.to}`);
    console.log(`nextAction: ${lead.nextAction}`);
    console.log('');
  }

  console.log(`初回メール送信済み（sendStatus=sent）: ${initialSentCount}件`);
  console.log(`返信待ち: ${awaitingReply}件`);
  console.log('');
  console.log('次のメール営業候補:');
  if (nextCandidates.length === 0) {
    console.log('  （条件を満たす候補なし）');
  } else {
    for (const c of nextCandidates) {
      console.log(`  - ${c.companyName} → ${c.emailCandidates[0] ?? '（なし）'}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
