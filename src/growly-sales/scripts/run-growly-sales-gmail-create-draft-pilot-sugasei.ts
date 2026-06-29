/**
 * MIME修正パイロット: 菅誠建設工業 1社のみ下書き作成 + drafts.get(raw) 検証。
 * users.drafts.create のみ。自動送信なし。
 */
import { ensureProjectEnvLoaded, getOutreachSignatureEmail } from '../config/env.js';
import { getLeadsCsvPath, getLeadsJsonPath } from '../config/paths.js';
import { buildGmailDraftMessage } from '../integrations/gmail/buildGmailDraftMessage.js';
import {
  createVerifiedGmailDraft,
  GmailDraftVerificationError,
} from '../integrations/gmail/gmailDraftAdapter.js';
import {
  GmailFetchDiagnosticError,
  logGmailFetchDiagnosticError,
} from '../integrations/gmail/gmailFetchDiagnostics.js';
import { GmailAuthNotConfiguredError, isGmailConfigured } from '../integrations/gmail/gmailAuth.js';
import { GmailSendAsUnavailableError } from '../integrations/gmail/gmailSendAs.js';
import { requireOutreachSendAsForDraftCreate } from '../integrations/gmail/validateOutreachEmailConfig.js';
import {
  bodyHasHeaderLeak,
  decodeMimeBody,
  decodeMimeEncodedWords,
  parseMimeHeaders,
  splitMimeRaw,
} from '../integrations/gmail/gmailMimeUtils.js';
import {
  fetchGmailDraftRaw,
  verifyGmailDraftById,
} from '../integrations/gmail/gmailDraftVerify.js';
import { loadLeadsFromJson, saveLeadsToJson } from '../storage/jsonLeadRepository.js';
import { saveLeadsToCsv } from '../storage/csvLeadRepository.js';
import {
  applyGmailDraftCreated,
  applyGmailDraftFailed,
} from '../workflow/updateLeadGmailDraft.js';
import type { Lead } from '../types/lead.js';

const CREATE_DRAFTS_CONFIRM_TOKEN = 'CREATE_DRAFTS';
const TARGET_COMPANY = '株式会社菅誠建設工業';

function isConfirmed(): boolean {
  return (
    process.env.CREATE_DRAFTS === '1' ||
    process.env.CREATE_DRAFTS === CREATE_DRAFTS_CONFIRM_TOKEN ||
    process.argv.includes(CREATE_DRAFTS_CONFIRM_TOKEN)
  );
}

function verifyLeadBodyConstraints(lead: Lead, body: string): string[] {
  const errors: string[] = [];
  const signatureEmail = getOutreachSignatureEmail();
  if (!body.includes(`Email：${signatureEmail}`)) {
    errors.push(`署名Email不一致: expected ${signatureEmail}`);
  }
  if (lead.contactFormUrl && body.includes(lead.contactFormUrl)) {
    errors.push(`本文にフォームURL: ${lead.contactFormUrl}`);
  }
  for (const src of lead.emailCandidateSourceUrls) {
    if (body.includes(src)) {
      errors.push(`本文に確認元URL: ${src}`);
    }
  }
  const leak = bodyHasHeaderLeak(body);
  if (leak) {
    errors.push(`本文ヘッダー混入: ${leak}`);
  }
  if (!body.startsWith(lead.companyName)) {
    errors.push(`本文先頭が会社名ではない: ${body.slice(0, 40)}`);
  }
  return errors;
}

async function main(): Promise<void> {
  console.log('Growly Sales — Gmail Draft Pilot (菅誠建設工業)');
  console.log('================================================');
  console.log('※ users.drafts.create のみ。送信APIは使用しません。');
  console.log('');

  if (!isConfirmed()) {
    console.error(`確認トークン ${CREATE_DRAFTS_CONFIRM_TOKEN} が必要です。`);
    process.exit(1);
  }

  ensureProjectEnvLoaded();

  if (!(await isGmailConfigured())) {
    throw new GmailAuthNotConfiguredError();
  }

  try {
    await requireOutreachSendAsForDraftCreate();
  } catch (err) {
    if (err instanceof GmailSendAsUnavailableError) {
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  }

  const leads = await loadLeadsFromJson(getLeadsJsonPath());
  const lead = leads.find((l) => l.companyName === TARGET_COMPANY);
  if (!lead) {
    console.error(`Lead not found: ${TARGET_COMPANY}`);
    process.exit(1);
  }

  const message = buildGmailDraftMessage(lead);
  const expected = {
    fromEmail: message.from,
    replyToEmail: message.replyTo,
    toEmail: message.to,
    subject: message.subject,
    bodyPlain: message.body,
  };

  const now = new Date().toISOString();
  let draftId: string | null = null;

  try {
    const result = await createVerifiedGmailDraft(message);
    draftId = result.draftId;

    const raw = await fetchGmailDraftRaw(draftId);
    const remote = await verifyGmailDraftById(draftId, expected);
    const { headersText, bodyText } = splitMimeRaw(raw);
    const headers = parseMimeHeaders(headersText);
    const parsedBody = decodeMimeBody(bodyText, headers).trim();
    const fromHeaderRaw = decodeMimeEncodedWords(headers.get('from') ?? '');

    const extraErrors = verifyLeadBodyConstraints(lead, parsedBody);
    const allOk = remote.ok && extraErrors.length === 0;

    console.log('=== drafts.get(raw) 検証結果 ===');
    console.log(`raw検証: ${remote.ok ? 'OK' : 'NG'}`);
    if (!remote.ok) {
      for (const e of remote.errors) console.log(`  - ${e}`);
    }
    if (extraErrors.length > 0) {
      console.log('追加検証: NG');
      for (const e of extraErrors) console.log(`  - ${e}`);
    } else {
      console.log('追加検証: OK');
    }

    console.log('');
    console.log(`From (raw): ${fromHeaderRaw}`);
    console.log(`From (email): ${remote.parsedFrom}`);
    console.log(`Reply-To: ${remote.parsedReplyTo}`);
    console.log(`To: ${remote.parsedTo}`);
    console.log(`Subject: ${decodeMimeEncodedWords(remote.parsedSubject ?? '')}`);
    console.log(`本文先頭: ${parsedBody.slice(0, 60)}`);
    console.log(`ヘッダー混入: ${bodyHasHeaderLeak(parsedBody) ? 'あり' : 'なし'}`);
    console.log(`署名Email: ${parsedBody.includes(`Email：${getOutreachSignatureEmail()}`) ? 'OK' : 'NG'}`);

    if (!allOk) {
      throw new GmailDraftVerificationError([...remote.errors, ...extraErrors]);
    }

    const updated = applyGmailDraftCreated(lead, draftId, now);
    const merged = leads.map((l) => (l.id === lead.id ? updated : l));
    await saveLeadsToJson(getLeadsJsonPath(), merged);
    await saveLeadsToCsv(getLeadsCsvPath(), merged);

    console.log('');
    console.log(`✅ パイロット成功 draftId=${draftId}`);
    console.log(`   sendStatus: ${updated.sendStatus}`);
    console.log(`   gmailDraftStatus: ${updated.gmailDraftStatus}`);
    console.log('');
    console.log('※ 自動送信は行っていません。Gmail画面で From を目視確認してください。');
    console.log('※ 徳田工務店・仙臺屋の下書き作成はまだ行いません。');
  } catch (err) {
    let msg: string;
    if (err instanceof GmailDraftVerificationError) {
      msg = err.message;
      console.error(`❌ 検証失敗: ${msg}`);
    } else if (err instanceof GmailFetchDiagnosticError) {
      logGmailFetchDiagnosticError('❌', err);
      msg = err.toPersistMessage();
    } else {
      msg = err instanceof Error ? err.message : String(err);
      console.error(`❌ ${msg}`);
    }

    const failed = applyGmailDraftFailed(lead, msg, now);
    const merged = leads.map((l) => (l.id === lead.id ? failed : l));
    await saveLeadsToJson(getLeadsJsonPath(), merged);
    await saveLeadsToCsv(getLeadsCsvPath(), merged);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
