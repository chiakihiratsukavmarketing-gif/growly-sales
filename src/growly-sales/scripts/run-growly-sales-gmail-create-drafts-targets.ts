/**
 * 指定3社のみ Gmail 下書き作成（users.drafts.create のみ・送信なし）。
 * 実行: echo CREATE_DRAFTS | npx tsx ...  または  CREATE_DRAFTS=1 npx tsx ...
 */
import { ensureProjectEnvLoaded } from '../config/env.js';
import { getLeadsCsvPath, getLeadsJsonPath } from '../config/paths.js';
import { loadOfferProfile } from '../config/offerProfile.js';
import { buildGmailDraftMessage } from '../integrations/gmail/buildGmailDraftMessage.js';
import { createVerifiedGmailDraft, GmailDraftVerificationError } from '../integrations/gmail/gmailDraftAdapter.js';
import {
  GmailFetchDiagnosticError,
  logGmailFetchDiagnosticError,
} from '../integrations/gmail/gmailFetchDiagnostics.js';
import { GmailAuthNotConfiguredError, isGmailConfigured } from '../integrations/gmail/gmailAuth.js';
import { GmailSendAsUnavailableError } from '../integrations/gmail/gmailSendAs.js';
import { requireOutreachSendAsForDraftCreate } from '../integrations/gmail/validateOutreachEmailConfig.js';
import { getGmailDraftHaltReason } from '../integrations/gmail/gmailDraftHalt.js';
import { getGmailDraftExclusionReason } from '../outreach/outreachPolicy.js';
import { isGmailDraftEligible } from '../integrations/gmail/selectGmailDraftCandidates.js';
import { loadLeadsFromJson, saveLeadsToJson } from '../storage/jsonLeadRepository.js';
import { saveLeadsToCsv } from '../storage/csvLeadRepository.js';
import {
  applyGmailDraftCreated,
  applyGmailDraftFailed,
} from '../workflow/updateLeadGmailDraft.js';
const CREATE_DRAFTS_CONFIRM_TOKEN = 'CREATE_DRAFTS';

const TARGET_COMPANIES = [
  '株式会社菅誠建設工業',
  '株式会社徳田工務店',
  '株式会社仙臺屋',
] as const;

function isConfirmed(): boolean {
  if (process.env.CREATE_DRAFTS === '1' || process.env.CREATE_DRAFTS === CREATE_DRAFTS_CONFIRM_TOKEN) {
    return true;
  }
  return process.argv.includes(CREATE_DRAFTS_CONFIRM_TOKEN);
}

async function main(): Promise<void> {
  console.log('Growly Sales — Gmail Create Drafts (3社指定)');
  console.log('============================================');
  console.log('※ users.drafts.create のみ。送信APIは使用しません。');
  console.log('');

  for (const companyName of TARGET_COMPANIES) {
    const halt = getGmailDraftHaltReason(companyName);
    if (halt) {
      console.error(`⛔ ${companyName}: ${halt}`);
      console.error('   修正完了・検証通過まで下書き作成は行いません。');
      process.exit(1);
    }
  }

  if (!isConfirmed()) {
    console.error(`確認トークン ${CREATE_DRAFTS_CONFIRM_TOKEN} が必要です。`);
    process.exit(1);
  }

  ensureProjectEnvLoaded();

  if (!(await isGmailConfigured())) {
    throw new GmailAuthNotConfiguredError(
      'Gmail認証情報が設定されていません（GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET / GMAIL_REFRESH_TOKEN）'
    );
  }

  let outreachConfig;
  try {
    outreachConfig = await requireOutreachSendAsForDraftCreate();
    console.log(`送信元 (From): ${outreachConfig.fromEmail}`);
    console.log(`Reply-To: ${outreachConfig.replyToEmail}`);
    console.log(`署名 Email: ${outreachConfig.signatureEmail}`);
    console.log(`Gmail sendAs: ${outreachConfig.fromEmail} — 利用可能`);
    console.log('');
  } catch (err) {
    if (err instanceof GmailSendAsUnavailableError) {
      console.error(`エラー: ${err.message}`);
      console.error('');
      console.error('利用可能な sendAs 一覧:');
      for (const alias of err.availableAliases) {
        console.error(
          `  - ${alias.sendAsEmail} (primary=${alias.isPrimary}, verification=${alias.verificationStatus})`
        );
      }
      console.error('');
      console.error('下書き作成を停止しました。');
      process.exit(1);
    }
    throw err;
  }

  const offer = await loadOfferProfile();
  const leads = await loadLeadsFromJson(getLeadsJsonPath());
  const leadsById = new Map(leads.map((l) => [l.id, l]));
  const now = new Date().toISOString();

  let created = 0;
  let failed = 0;

  for (const companyName of TARGET_COMPANIES) {
    const lead = leads.find((l) => l.companyName === companyName);
    if (!lead) {
      console.error(`❌ Lead not found: ${companyName}`);
      failed++;
      continue;
    }

    const exclusion = getGmailDraftExclusionReason(lead, offer);
    if (exclusion) {
      console.error(`❌ ${companyName}: Gmail下書き対象外 — ${exclusion}`);
      failed++;
      continue;
    }

    if (lead.gmailDraftStatus === 'draft_created' && lead.gmailDraftId) {
      console.log(`⏭ ${companyName}: 既に下書き作成済 draftId=${lead.gmailDraftId}`);
      created++;
      continue;
    }

    try {
      const message = buildGmailDraftMessage(lead);
      const result = await createVerifiedGmailDraft(message);
      const updated = applyGmailDraftCreated(lead, result.draftId, now);
      leadsById.set(lead.id, updated);
      created++;
      console.log(`✅ ${companyName}`);
      console.log(`   宛先: ${message.to}`);
      console.log(`   From: ${message.from}`);
      console.log(`   Reply-To: ${message.replyTo}`);
      console.log(`   件名: ${message.subject}`);
      console.log(`   draftId: ${result.draftId}`);
      console.log(`   sendStatus: ${updated.sendStatus}`);
      console.log(`   gmailDraftStatus: ${updated.gmailDraftStatus}`);
    } catch (err) {
      let msg: string;
      if (err instanceof GmailDraftVerificationError) {
        msg = err.message;
        console.error(`❌ ${companyName}: ${msg}`);
      } else if (err instanceof GmailFetchDiagnosticError) {
        logGmailFetchDiagnosticError(`❌ ${companyName}:`, err);
        msg = err.toPersistMessage();
      } else {
        msg = err instanceof Error ? err.message : String(err);
        console.error(`❌ ${companyName}: ${msg}`);
      }
      const updated = applyGmailDraftFailed(lead, msg, now);
      leadsById.set(lead.id, updated);
      failed++;
    }
  }

  const merged = leads.map((l) => leadsById.get(l.id) ?? l);
  await saveLeadsToJson(getLeadsJsonPath(), merged);
  await saveLeadsToCsv(getLeadsCsvPath(), merged);

  console.log('');
  console.log(`完了: 作成 ${created} / 失敗 ${failed}`);
  console.log('自動送信は行っていません。sendStatus は not_sent のままです。');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
