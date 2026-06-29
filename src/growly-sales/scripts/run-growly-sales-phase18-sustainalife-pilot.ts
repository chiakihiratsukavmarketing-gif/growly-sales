/**
 * Phase 18: サスティナライフ森の家 パイロット
 * 承認 → CREATE_DRAFTS で下書き1件作成（送信なし）
 * 手動送信・送信記録は人間が UI または --record で実施
 */
import { ensureProjectEnvLoaded } from '../config/env.js';
import { getLeadsJsonPath } from '../config/paths.js';
import { CREATE_DRAFTS_GATE_TOKEN } from '../integrations/gmail/createDraftsGate.js';
import { isGmailConfigured } from '../integrations/gmail/gmailAuth.js';
import { loadLeadsFromJson } from '../storage/jsonLeadRepository.js';
import { buildGmailDraftPreviewForLead } from '../workflow/createGmailDraftForLead.js';
import { recordManualGmailSent } from '../workflow/recordManualGmailSent.js';
import { approveLeadForDraft } from '../workflow/updateLeadReview.js';
import { createGmailDraftForLead } from '../workflow/createGmailDraftForLead.js';
import { loadOfferProfile } from '../config/offerProfile.js';
import { buildSalesDashboard } from '../analytics/buildSalesDashboard.js';
import { buildGmailDraftMessage } from '../integrations/gmail/buildGmailDraftMessage.js';
import { verifyGmailDraftById } from '../integrations/gmail/gmailDraftVerify.js';

const TARGET_COMPANY = 'サスティナライフ森の家';
const TARGET_EMAIL = 'info@sustainalife.co.jp';

async function main(): Promise<void> {
  const mode = process.argv[2] ?? 'draft';
  ensureProjectEnvLoaded();

  const leads = await loadLeadsFromJson(getLeadsJsonPath());
  const lead = leads.find((l) => l.companyName === TARGET_COMPANY);
  if (!lead) {
    console.error(`Lead not found: ${TARGET_COMPANY}`);
    process.exit(1);
  }

  console.log('Phase 18 — サスティナライフ森の家パイロット');
  console.log('================================================');
  console.log(`leadId: ${lead.id}`);
  console.log(`email: ${lead.emailCandidates[0] ?? '—'}`);
  console.log(`humanReviewStatus: ${lead.humanReviewStatus}`);
  console.log(`sendStatus: ${lead.sendStatus}`);
  console.log(`gmailDraftStatus: ${lead.gmailDraftStatus}`);
  console.log('');

  if (mode === 'verify-draft') {
    const draftId = lead.gmailDraftId?.trim();
    if (!draftId) {
      console.error('gmailDraftId がありません');
      process.exit(1);
    }
    const message = buildGmailDraftMessage(lead);
    const remote = await verifyGmailDraftById(draftId, {
      fromEmail: message.from,
      replyToEmail: message.replyTo,
      toEmail: message.to,
      subject: message.subject,
      bodyPlain: message.body,
    });
    console.log('drafts.get 検証:', remote.ok ? 'OK' : 'NG');
    console.log(`From: ${remote.parsedFrom}`);
    console.log(`Reply-To: ${remote.parsedReplyTo}`);
    console.log(`To: ${remote.parsedTo}`);
    console.log(`Subject: ${remote.parsedSubject}`);
    console.log(`Body先頭: ${remote.parsedBodyPreview?.slice(0, 60) ?? '—'}`);
    if (remote.errors.length) console.log('errors:', remote.errors);
    return;
  }

  if (mode === 'status') {
    const offer = await loadOfferProfile();
    const dash = buildSalesDashboard(leads, offer);
    console.log('Dashboard metrics:', JSON.stringify(dash.metrics, null, 2));
    console.log('Recommended actions:', dash.recommendedActions.map((a) => a.action).join(' | '));
    return;
  }

  if (mode === 'record') {
    const draftId = lead.gmailDraftId?.trim();
    if (!draftId) {
      console.error('gmailDraftId がありません。先に draft モードを実行してください。');
      process.exit(1);
    }
    console.log('送信記録（manual_gmail）— Gmail API send は使用しません');
    const result = await recordManualGmailSent(lead.id, { draftId });
    console.log('Recorded sendStatus:', result.lead.sendStatus);
    console.log('manualSentAt:', result.lead.manualSentAt);
    console.log('nextAction:', result.lead.nextAction);
    return;
  }

  if (!(await isGmailConfigured())) {
    console.error('Gmail認証が未設定です（.env を確認）');
    process.exit(1);
  }

  const offer = await loadOfferProfile();
  const preview = buildGmailDraftPreviewForLead(lead, offer);
  console.log('--- 下書きプレビュー ---');
  console.log(`To: ${preview.to}`);
  console.log(`From: ${preview.fromEmail}`);
  console.log(`Reply-To: ${preview.replyToEmail}`);
  console.log(`署名Email: ${preview.signatureEmail}`);
  console.log(`canCreate: ${preview.canCreate}`);
  if (preview.blockReason) console.log(`blockReason: ${preview.blockReason}`);
  console.log('');

  if (lead.humanReviewStatus !== 'approved') {
    console.log('--- 人間承認 ---');
    const approved = await approveLeadForDraft(lead.id, getLeadsJsonPath(), 'Phase18パイロット');
    console.log(`humanReviewStatus: ${approved.humanReviewStatus}`);
    console.log(`communicationMemo: ${approved.communicationMemo}`);
    console.log('');
  }

  if (lead.gmailDraftStatus === 'draft_created' && lead.gmailDraftId) {
    console.log(`既に下書き作成済み: draftId=${lead.gmailDraftId}`);
    console.log('Gmailで手動送信後、UIの送信記録タブまたは --record で記録してください。');
    return;
  }

  const gate =
    process.env.CREATE_DRAFTS === CREATE_DRAFTS_GATE_TOKEN
      ? CREATE_DRAFTS_GATE_TOKEN
      : process.argv.includes(CREATE_DRAFTS_GATE_TOKEN)
        ? CREATE_DRAFTS_GATE_TOKEN
        : '';

  if (!gate) {
    console.error(`CREATE_DRAFTS ゲートが必要です: CREATE_DRAFTS=${CREATE_DRAFTS_GATE_TOKEN} または引数に CREATE_DRAFTS`);
    process.exit(1);
  }

  console.log('--- Gmail下書き作成（users.drafts.create のみ）---');
  const result = await createGmailDraftForLead(lead.id, gate);
  console.log(`ok: ${result.ok}`);
  console.log(`message: ${result.message}`);
  console.log(`draftId: ${result.draftId ?? '—'}`);
  console.log('');
  console.log('--- MIME検証 ---');
  for (const check of result.mimeVerification.checks) {
    console.log(`  ${check.ok ? '✓' : '✗'} ${check.label}`);
  }
  if (result.mimeVerification.errors.length > 0) {
    console.log('errors:', result.mimeVerification.errors.join('; '));
  }
  console.log('');
  console.log('次のステップ（人間）:');
  console.log(`  1. Gmail下書きを開き To=${TARGET_EMAIL} を目視確認`);
  console.log('  2. From/Reply-To/署名Email = c_hiratsuka@wantreach.jp');
  console.log('  3. 問題なければ Gmail から手動送信');
  console.log('  4. UI送信記録タブ または npx tsx ...phase18-sustainalife-pilot.ts record');
}

main().catch((err) => {
  console.error('Fatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
