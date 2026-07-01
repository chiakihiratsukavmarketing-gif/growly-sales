/**
 * Phase B（既存Lead整理・営業対象の棚卸し）の進捗サマリー（読み取り専用）
 */
import { getLeadsJsonPath } from '../config/paths.js';
import { loadLeadsFromJson } from '../storage/jsonLeadRepository.js';
import {
  buildPhaseBInventoryReport,
  PHASE_B_COMPLETION_CRITERIA,
  type PhaseBLeadRow,
} from '../workflow/leadPhaseBInventory.js';
import {
  countAwaitingReplyLeads,
  needsFollowUpDateSetup,
} from '../workflow/replyManagement.js';
import { matchesReplyManagementFilter } from '../ui/leadFilterUtils.js';

function isContacted(lead: { sendStatus: string }): boolean {
  return lead.sendStatus === 'sent' || lead.sendStatus === 'manual_sent';
}

function printRow(row: PhaseBLeadRow, extra?: string): void {
  const email = row.hasEmail ? 'メールあり' : 'メールなし';
  const form = row.hasForm ? 'フォームあり' : 'フォームなし';
  console.log(`  - ${row.companyName}`);
  console.log(`      ${email} / ${form}`);
  console.log(
    `      状態: ${row.sendStatus} / 承認:${row.humanReviewStatus} / 返信:${row.replyStatus}`
  );
  console.log(`      次の操作: ${row.recommendedNextStep}`);
  if (extra) console.log(`      ${extra}`);
}

async function main(): Promise<void> {
  const leads = await loadLeadsFromJson(getLeadsJsonPath());
  const contacted = leads.filter(isContacted);
  const gmailCheck = contacted.filter((l) => matchesReplyManagementFilter(l, 'gmail_check'));
  const followUnset = contacted.filter((l) => needsFollowUpDateSetup(l));
  const replyBadge = countAwaitingReplyLeads(leads);

  const phaseAEntryOk =
    gmailCheck.length === 0 && followUnset.length === 0 && replyBadge === 0;

  const report = buildPhaseBInventoryReport(leads);

  console.log('Growly Sales — Phase B ステータス（既存Lead棚卸し）');
  console.log('============================================================');
  console.log('');
  console.log('## Phase A 再確認（Phase B 進入条件）');
  console.log(`Gmail確認待ち:     ${gmailCheck.length}件 ${gmailCheck.length === 0 ? '✅' : '❌'}`);
  console.log(`フォロー日未設定:  ${followUnset.length}件 ${followUnset.length === 0 ? '✅' : '❌'}`);
  console.log(`返信管理バッジ:    ${replyBadge}件 ${replyBadge === 0 ? '✅' : '❌'}`);
  console.log(
    `Phase B 進入:      ${phaseAEntryOk ? '✅ 進めます' : '❌ Phase A の人間操作が必要です'}`
  );
  console.log('');

  if (!phaseAEntryOk) {
    console.log('Phase B には進まず終了します。返信管理タブで Phase A 残件を処理してください。');
    return;
  }

  console.log('## 件数サマリー');
  console.log(`全Lead:                    ${report.totalLeads}件`);
  console.log(`送信済み:                  ${report.contactedCount}件`);
  console.log(`未送信:                    ${report.notContactedCount}件`);
  console.log(`Gmail営業対象:             ${report.counts.gmail_outreach}件`);
  console.log(`フォーム営業対象:          ${report.counts.form_outreach}件`);
  console.log(`フォローアップ対象:        ${report.counts.follow_up}件`);
  console.log(`送信済み・返信処理済み:    ${report.counts.sent_reply_processed}件`);
  console.log(`承認待ち:                  ${report.counts.pending_approval}件`);
  console.log(`要確認:                    ${report.counts.needs_review}件`);
  console.log(`除外候補:                  ${report.counts.exclusion_candidate}件`);
  console.log(`連絡禁止:                  ${report.counts.do_not_contact}件`);
  console.log(`重複候補（Lead数）:        ${report.counts.duplicate_candidate}件`);
  console.log(`重複グループ:              ${report.duplicateGroups.length}組`);
  console.log('');

  if (report.gmailOutreach.length > 0) {
    console.log('## Gmail営業対象');
    for (const row of report.gmailOutreach) printRow(row);
    console.log('');
  }

  if (report.formOutreach.length > 0) {
    console.log('## フォーム営業対象');
    for (const row of report.formOutreach) printRow(row);
    console.log('');
  }

  if (report.followUpTargets.length > 0) {
    console.log('## フォローアップ対象');
    for (const row of report.followUpTargets) printRow(row);
    console.log('');
  }

  if (report.pendingApproval.length > 0) {
    console.log('## 承認待ち');
    for (const row of report.pendingApproval) printRow(row);
    console.log('');
  }

  if (report.needsReview.length > 0) {
    console.log('## 要確認');
    for (const row of report.needsReview) printRow(row);
    console.log('');
  }

  if (report.exclusionCandidates.length > 0) {
    console.log('## 除外候補（自動変更なし・一覧のみ）');
    for (const row of report.exclusionCandidates) {
      printRow(row, `除外理由: ${row.exclusionReasons.join(' / ')}`);
    }
    console.log('');
  }

  if (report.doNotContact.length > 0) {
    console.log('## 連絡禁止');
    for (const row of report.doNotContact) printRow(row);
    console.log('');
  }

  if (report.duplicateGroups.length > 0) {
    console.log('## 重複候補（自動削除なし）');
    for (const group of report.duplicateGroups) {
      console.log(`  [${group.matchField}] ${group.matchKey}`);
      console.log(`    → ${group.companyNames.join(' / ')}`);
    }
    console.log('');
  }

  console.log('## 次に送るべきLead（優先順）');
  const nextToSend = [...report.gmailOutreach, ...report.formOutreach].slice(0, 10);
  if (nextToSend.length === 0) {
    console.log('  現時点で未送信のGmail/フォーム営業対象はありません。');
    console.log('  → 承認待ちLeadの処理、または Phase C 前の候補収集を検討してください。');
  } else {
    for (const row of nextToSend) {
      console.log(`  - ${row.companyName}: ${row.recommendedNextStep}`);
    }
  }
  console.log('');

  console.log('## Phase B 完了条件');
  for (const criterion of PHASE_B_COMPLETION_CRITERIA) {
    console.log(`  - ${criterion}`);
  }
  console.log('');
  console.log(
    `判定: ${report.phaseBComplete ? '✅ 棚卸し完了（分類済み）' : '⏳ 棚卸し未完了'}`
  );
  if (report.phaseBCompleteNotes.length > 0) {
    for (const note of report.phaseBCompleteNotes) {
      console.log(`  ※ ${note}`);
    }
  }
  console.log('');
  console.log('次フェーズ: Phase C（Cloud Daily 30 復旧）は人間確認後に着手してください。');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
