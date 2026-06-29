/**
 * MIME修正緊急対応:
 * - 3社の下書き作成を停止（failed + 旧draftId無効化）
 * - sendStatus=sent の Lead に communicationMemo を追記
 */
import { GMAIL_DRAFT_HALTED_COMPANIES } from '../integrations/gmail/gmailDraftHalt.js';
import { getLeadsCsvPath, getLeadsJsonPath } from '../config/paths.js';
import { loadLeadsFromJson, saveLeadsToJson } from '../storage/jsonLeadRepository.js';
import { saveLeadsToCsv } from '../storage/csvLeadRepository.js';

const FROM_WARNING_MEMO =
  '注意：送信時の実Fromが chiakihiratsuka.v.marketing@gmail.com になっていた。署名・Reply-Toは c_hiratsuka@wantreach.jp。今後の下書き作成処理を修正する。';

const HALT_ERROR =
  'MIME From/Reply-To 修正中のため下書き無効化（旧draftは使用しない）';

async function main(): Promise<void> {
  const leads = await loadLeadsFromJson(getLeadsJsonPath());
  const now = new Date().toISOString();

  const updated = leads.map((lead) => {
    let next = lead;

    if ((GMAIL_DRAFT_HALTED_COMPANIES as readonly string[]).includes(lead.companyName)) {
      const staleDraftId = lead.gmailDraftId;
      next = {
        ...next,
        gmailDraftStatus: 'failed',
        gmailDraftId: null,
        gmailDraftCreatedAt: null,
        gmailDraftError: HALT_ERROR,
        nextAction: 'MIME修正完了後に CREATE_DRAFTS で再作成',
        communicationMemo: [
          next.communicationMemo,
          staleDraftId ? `旧Gmail下書き無効（${staleDraftId}）` : '',
        ]
          .filter(Boolean)
          .join(' / '),
        updatedAt: now,
      };
    }

    if (lead.sendStatus === 'sent' && !lead.communicationMemo.includes(FROM_WARNING_MEMO)) {
      next = {
        ...next,
        communicationMemo: [next.communicationMemo, FROM_WARNING_MEMO].filter(Boolean).join(' / '),
        updatedAt: now,
      };
    }

    return next;
  });

  await saveLeadsToJson(getLeadsJsonPath(), updated);
  await saveLeadsToCsv(getLeadsCsvPath(), updated);

  console.log('MIME emergency halt applied.');
  for (const name of GMAIL_DRAFT_HALTED_COMPANIES) {
    const lead = updated.find((l) => l.companyName === name);
    console.log(`  - ${name}: gmailDraftStatus=${lead?.gmailDraftStatus} sendStatus=${lead?.sendStatus}`);
  }

  const sentUpdated = updated.filter(
    (l) => l.sendStatus === 'sent' && l.communicationMemo.includes(FROM_WARNING_MEMO)
  );
  console.log(`Sent leads with From warning memo: ${sentUpdated.length}`);
  for (const lead of sentUpdated) {
    console.log(`  - ${lead.companyName}`);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
