import { createInterface } from 'node:readline';
import { ensureProjectEnvLoaded, getGmailDraftCreateLimit } from '../config/env.js';
import { getLeadsJsonPath } from '../config/paths.js';
import { loadOfferProfile } from '../config/offerProfile.js';
import { createVerifiedGmailDraft, GmailDraftVerificationError } from '../integrations/gmail/gmailDraftAdapter.js';
import {
  GmailFetchDiagnosticError,
  logGmailFetchDiagnosticError,
} from '../integrations/gmail/gmailFetchDiagnostics.js';
import { buildGmailDraftMessage } from '../integrations/gmail/buildGmailDraftMessage.js';
import { selectGmailDraftCreationTargets, applyGmailDraftCreateLimit } from '../integrations/gmail/selectGmailDraftCandidates.js';
import { GmailAuthNotConfiguredError, isGmailConfigured } from '../integrations/gmail/gmailAuth.js';
import { GmailSendAsUnavailableError } from '../integrations/gmail/gmailSendAs.js';
import { requireOutreachSendAsForDraftCreate } from '../integrations/gmail/validateOutreachEmailConfig.js';
import { getGmailDraftHaltReason } from '../integrations/gmail/gmailDraftHalt.js';
import { loadLeadsFromJson } from '../storage/jsonLeadRepository.js';
import {
  applyGmailDraftCreated,
  applyGmailDraftFailed,
} from '../workflow/updateLeadGmailDraft.js';
import { getLeadsCsvPath } from '../config/paths.js';
import { saveLeadsToJson } from '../storage/jsonLeadRepository.js';
import { saveLeadsToCsv } from '../storage/csvLeadRepository.js';

export const CREATE_DRAFTS_CONFIRM_TOKEN = 'CREATE_DRAFTS';

export async function promptCreateDraftsConfirmation(targetCount: number): Promise<boolean> {
  console.log('');
  console.log(
    `Gmail下書きを作成します。送信はしません。対象: ${targetCount}件。続行するには ${CREATE_DRAFTS_CONFIRM_TOKEN} と入力してください。`
  );

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>((resolve) => {
    rl.question('> ', resolve);
  });
  rl.close();
  return answer.trim() === CREATE_DRAFTS_CONFIRM_TOKEN;
}

async function main(): Promise<void> {
  console.log('Growly Sales — Gmail Create Drafts');
  console.log('==================================');
  console.log('※ users.drafts.create のみ。送信APIは使用しません。');
  console.log('※ 下書き作成後も sendStatus は not_sent のままです。');
  console.log('');

  ensureProjectEnvLoaded();

  if (!(await isGmailConfigured())) {
    console.error('エラー: Gmail認証情報が設定されていません。');
    console.error('  .env に GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET / GMAIL_REFRESH_TOKEN');
    console.error('  または GMAIL_CREDENTIALS_PATH を設定してください。');
    console.error('  （.env は git にコミットしないでください）');
    process.exit(1);
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
      console.error('下書き作成を停止しました。OUTREACH_FROM_EMAIL または Gmail 送信元設定を確認してください。');
      process.exit(1);
    }
    throw err;
  }

  const leadsPath = getLeadsJsonPath();
  const leads = await loadLeadsFromJson(leadsPath);
  const offer = await loadOfferProfile();
  const draftLimit = getGmailDraftCreateLimit();
  const eligible = selectGmailDraftCreationTargets(leads, offer);
  const targets = applyGmailDraftCreateLimit(eligible, draftLimit);

  if (targets.length === 0) {
    console.log('Gmail下書き作成対象のLeadはありません。');
    console.log('  - humanReviewStatus=approved / sendStatus=not_sent が必要');
    console.log('  - emailCandidates があるLeadのみ対象');
    console.log('  - 問い合わせフォームのみのLeadは対象外');
    return;
  }

  if (draftLimit !== null && eligible.length > targets.length) {
    console.log(
      `GMAIL_DRAFT_CREATE_LIMIT=${draftLimit} — 候補 ${eligible.length}件のうち今回 ${targets.length}件のみ作成します。`
    );
    console.log('');
  }

  console.log('対象Lead:');
  for (const lead of targets) {
    console.log(`  - ${lead.companyName} → ${lead.emailCandidates[0]}`);
  }

  const confirmed = await promptCreateDraftsConfirmation(targets.length);
  if (!confirmed) {
    console.log('');
    console.log('キャンセルしました。Gmail下書きは作成されていません。');
    return;
  }

  const now = new Date().toISOString();
  const leadsById = new Map(leads.map((l) => [l.id, l]));
  let created = 0;
  let failed = 0;

  for (const lead of targets) {
    const halt = getGmailDraftHaltReason(lead.companyName);
    if (halt) {
      console.error(`⛔ ${lead.companyName}: ${halt}`);
      failed++;
      continue;
    }

    try {
      const message = buildGmailDraftMessage(lead);
      const result = await createVerifiedGmailDraft(message);
      const updated = applyGmailDraftCreated(lead, result.draftId, now);
      leadsById.set(lead.id, updated);
      created++;
      console.log(`✅ ${lead.companyName}: Gmail下書き作成 draftId=${result.draftId}`);
    } catch (err) {
      let msg: string;
      if (err instanceof GmailDraftVerificationError) {
        msg = err.message;
        console.error(`❌ ${lead.companyName}: ${msg}`);
      } else if (err instanceof GmailFetchDiagnosticError) {
        logGmailFetchDiagnosticError(`❌ ${lead.companyName}:`, err);
        msg = err.toPersistMessage();
      } else {
        msg = err instanceof Error ? err.message : String(err);
        console.error(`❌ ${lead.companyName}: ${msg}`);
      }
      const updated = applyGmailDraftFailed(lead, msg, now);
      leadsById.set(lead.id, updated);
      failed++;
    }
  }

  const merged = leads.map((l) => leadsById.get(l.id) ?? l);
  await saveLeadsToJson(leadsPath, merged);
  await saveLeadsToCsv(getLeadsCsvPath(), merged);

  console.log('');
  console.log(`完了: 作成 ${created} / 失敗 ${failed}`);
  console.log('sendStatus は not_sent のままです。実際に送信した場合のみ手動送信済みとして記録してください。');
}

main().catch((err) => {
  if (err instanceof GmailAuthNotConfiguredError) {
    console.error(err.message);
    process.exit(1);
  }
  console.error('Fatal error:', err);
  process.exit(1);
});
