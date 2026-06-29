/**
 * MIME修正済み下書き: 指定会社を作成または再検証（users.drafts.create のみ）。
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
import { requireOutreachSendAsForDraftCreate } from '../integrations/gmail/validateOutreachEmailConfig.js';
import {
  bodyHasHeaderLeak,
  decodeMimeBody,
  decodeMimeEncodedWords,
  extractEmailAddress,
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
  if (leak) errors.push(`本文ヘッダー混入: ${leak}`);
  if (!body.startsWith(lead.companyName)) {
    errors.push(`本文先頭不一致: ${body.slice(0, 40)}`);
  }
  return errors;
}

interface VerifyReport {
  ok: boolean;
  fromRaw: string;
  fromEmail: string;
  replyTo: string;
  to: string;
  subject: string;
  bodyStart: string;
  headerLeak: boolean;
  errors: string[];
}

async function verifyDraftForLead(lead: Lead, draftId: string): Promise<VerifyReport> {
  const message = buildGmailDraftMessage(lead);
  const expected = {
    fromEmail: message.from,
    replyToEmail: message.replyTo,
    toEmail: message.to,
    subject: message.subject,
    bodyPlain: message.body,
  };
  const remote = await verifyGmailDraftById(draftId, expected);
  const raw = await fetchGmailDraftRaw(draftId);
  const { headersText, bodyText } = splitMimeRaw(raw);
  const headers = parseMimeHeaders(headersText);
  const parsedBody = decodeMimeBody(bodyText, headers).trim();
  const extra = verifyLeadBodyConstraints(lead, parsedBody);
  const errors = [...remote.errors, ...extra];
  return {
    ok: remote.ok && extra.length === 0,
    fromRaw: decodeMimeEncodedWords(headers.get('from') ?? ''),
    fromEmail: remote.parsedFrom ?? '',
    replyTo: remote.parsedReplyTo ?? '',
    to: remote.parsedTo ?? '',
    subject: decodeMimeEncodedWords(remote.parsedSubject ?? ''),
    bodyStart: parsedBody.slice(0, 60),
    headerLeak: bodyHasHeaderLeak(parsedBody) !== null,
    errors,
  };
}

function printReport(companyName: string, draftId: string | null, report: VerifyReport): void {
  console.log(`--- ${companyName} ---`);
  console.log(`draftId: ${draftId ?? '(none)'}`);
  console.log(`raw検証: ${report.ok ? 'OK' : 'NG'}`);
  if (!report.ok) {
    for (const e of report.errors) console.log(`  - ${e}`);
  }
  console.log(`From: ${report.fromRaw}`);
  console.log(`Reply-To: ${report.replyTo}`);
  console.log(`To: ${report.to}`);
  console.log(`Subject: ${report.subject}`);
  console.log(`本文先頭: ${report.bodyStart}`);
  console.log(`ヘッダー混入: ${report.headerLeak ? 'あり' : 'なし'}`);
  console.log('');
}

async function main(): Promise<void> {
  const companies = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  if (companies.length === 0) {
    console.error('Usage: CREATE_DRAFTS=1 npx tsx ... <companyName> [...]');
    process.exit(1);
  }

  if (!isConfirmed()) {
    console.error(`確認トークン ${CREATE_DRAFTS_CONFIRM_TOKEN} が必要です。`);
    process.exit(1);
  }

  ensureProjectEnvLoaded();
  if (!(await isGmailConfigured())) throw new GmailAuthNotConfiguredError();
  await requireOutreachSendAsForDraftCreate();

  const leads = await loadLeadsFromJson(getLeadsJsonPath());
  const leadsById = new Map(leads.map((l) => [l.id, l]));
  const now = new Date().toISOString();

  console.log('Growly Sales — MIME Draft Create/Verify');
  console.log('======================================');
  console.log('※ users.drafts.create のみ。自動送信なし。');
  console.log('');

  for (const companyName of companies) {
    const lead = leads.find((l) => l.companyName === companyName);
    if (!lead) {
      console.error(`Lead not found: ${companyName}`);
      continue;
    }

    if (lead.sendStatus !== 'not_sent') {
      console.error(`⏭ ${companyName}: sendStatus=${lead.sendStatus} — スキップ`);
      continue;
    }

    try {
      if (lead.gmailDraftStatus === 'draft_created' && lead.gmailDraftId) {
        const report = await verifyDraftForLead(lead, lead.gmailDraftId);
        printReport(companyName, lead.gmailDraftId, report);
        if (!report.ok) {
          const failed = applyGmailDraftFailed(
            lead,
            `既存下書き raw 検証失敗: ${report.errors.join(' / ')}`,
            now
          );
          leadsById.set(lead.id, failed);
        }
        continue;
      }

      const message = buildGmailDraftMessage(lead);
      const result = await createVerifiedGmailDraft(message);
      const report = await verifyDraftForLead(lead, result.draftId);
      printReport(companyName, result.draftId, report);

      if (!report.ok) {
        throw new GmailDraftVerificationError(report.errors);
      }

      leadsById.set(lead.id, applyGmailDraftCreated(lead, result.draftId, now));
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
      leadsById.set(lead.id, applyGmailDraftFailed(lead, msg, now));
    }
  }

  const merged = leads.map((l) => leadsById.get(l.id) ?? l);
  await saveLeadsToJson(getLeadsJsonPath(), merged);
  await saveLeadsToCsv(getLeadsCsvPath(), merged);
  console.log('完了。sendStatus は not_sent のままです。自動送信は行っていません。');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
