/**
 * Phase A（返信管理・フォローアップ完了）の進捗サマリー（読み取り専用）
 */
import { getLeadsJsonPath } from '../config/paths.js';
import { loadLeadsFromJson } from '../storage/jsonLeadRepository.js';
import { buildSalesDashboard } from '../analytics/buildSalesDashboard.js';
import {
  countAwaitingReplyLeads,
  needsFollowUpDateSetup,
  selectAwaitingReplyLeads,
} from '../workflow/replyManagement.js';
import { matchesReplyManagementFilter } from '../ui/leadFilterUtils.js';

function isContacted(lead: { sendStatus: string }): boolean {
  return lead.sendStatus === 'sent' || lead.sendStatus === 'manual_sent';
}

async function main(): Promise<void> {
  const leads = await loadLeadsFromJson(getLeadsJsonPath());
  const contacted = leads.filter(isContacted);
  const gmailCheck = contacted.filter((l) => matchesReplyManagementFilter(l, 'gmail_check'));
  const noReply = contacted.filter((l) => l.replyStatus === 'no_reply');
  const replied = contacted.filter((l) => l.replyStatus === 'replied');
  const interested = contacted.filter((l) => l.replyStatus === 'interested');
  const requested = contacted.filter((l) => l.replyStatus === 'requested_report');
  const declined = contacted.filter(
    (l) => l.replyStatus === 'declined' || l.replyStatus === 'not_interested'
  );
  const bounced = contacted.filter((l) => l.replyStatus === 'bounced');
  const followUnset = contacted.filter((l) => needsFollowUpDateSetup(l));
  const followSet = contacted.filter((l) => matchesReplyManagementFilter(l, 'followup_set'));
  const repliedMissingSummary = replied.filter((l) => !l.replySummary?.trim());
  const dash = buildSalesDashboard(leads);

  const phaseAComplete =
    gmailCheck.length === 0 &&
    followUnset.length === 0 &&
    repliedMissingSummary.length === 0 &&
    !leads.some((l) => 'replyBody' in l && (l as { replyBody?: string }).replyBody);

  console.log('Growly Sales — Phase A ステータス（返信管理・フォローアップ）');
  console.log('============================================================');
  console.log(`判定: ${phaseAComplete ? '✅ 完了可能' : '⏳ 未完了（人間操作が必要）'}`);
  console.log('');
  console.log('## 件数サマリー（送信済み 13社ベース）');
  console.log(`Gmail確認待ち:     ${gmailCheck.length}件`);
  console.log(`no_reply:          ${noReply.length}件`);
  console.log(`replied:           ${replied.length}件`);
  console.log(`interested:        ${interested.length}件`);
  console.log(`requested_report:  ${requested.length}件`);
  console.log(`declined:          ${declined.length}件`);
  console.log(`bounced:           ${bounced.length}件`);
  console.log(`フォロー日未設定:  ${followUnset.length}件`);
  console.log(`フォロー予定あり:  ${followSet.length}件`);
  console.log(`サイドバー返信バッジ: ${countAwaitingReplyLeads(leads)}件`);
  console.log('');
  console.log('## ダッシュボード最優先');
  const top = dash.topRecommendedAction;
  console.log(`  ${top?.category ?? '—'} / ${top?.companyName ?? '—'}`);
  console.log(`  ${top?.action ?? '—'}`);
  console.log('');

  if (gmailCheck.length > 0) {
    console.log('## 【人間】Gmail確認待ち — 返信管理タブで処理');
    for (const lead of gmailCheck) {
      console.log(`  - ${lead.companyName}`);
    }
    console.log('    → 返信なし: 「返信なしで確認済みにする」');
    console.log('    → 返信あり: replySummary + 次アクションを保存（本文全文は保存しない）');
    console.log('');
  }

  if (repliedMissingSummary.length > 0) {
    console.log('## 【人間】返信ありだが要約未入力');
    for (const lead of repliedMissingSummary) {
      console.log(`  - ${lead.companyName}`);
    }
    console.log('');
  }

  if (followUnset.length > 0) {
    console.log('## 【人間】フォロー日未設定 — 予定日または対応不要を設定');
    for (const lead of followUnset) {
      console.log(`  - ${lead.companyName}（replyStatus: ${lead.replyStatus}）`);
    }
    console.log('');
  }

  if (phaseAComplete) {
    console.log('Phase A 完了条件をすべて満たしています。Phase B（既存Lead整理）へ進めます。');
  } else {
    console.log('Phase A 完了まで: 上記の人間操作を UI（返信管理タブ）で実施してください。');
    console.log('UI再起動: npm run growly-sales:ui（no_reply 保存には最新サーバーが必要）');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
