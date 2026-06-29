/**
 * Gmail下書きの raw を取得し From / Reply-To / 本文混入を検証（送信なし）。
 * 使用例: npx tsx ... --draft r-123456
 *         npx tsx ... --company 株式会社菅誠建設工業
 */
import { ensureProjectEnvLoaded } from '../config/env.js';
import { getLeadsJsonPath } from '../config/paths.js';
import { buildGmailDraftMessage } from '../integrations/gmail/buildGmailDraftMessage.js';
import {
  fetchGmailDraftRaw,
  verifyBuiltMimeLocally,
  verifyGmailDraftById,
} from '../integrations/gmail/gmailDraftVerify.js';
import { loadLeadsFromJson } from '../storage/jsonLeadRepository.js';

function argValue(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  return process.argv[idx + 1] ?? null;
}

async function main(): Promise<void> {
  ensureProjectEnvLoaded();

  const draftId = argValue('--draft');
  const companyName = argValue('--company');
  const localOnly = process.argv.includes('--local-only');

  if (!draftId && !companyName) {
    console.error('Usage: --draft <id> | --company <name> [--local-only]');
    process.exit(1);
  }

  if (companyName) {
    const leads = await loadLeadsFromJson(getLeadsJsonPath());
    const lead = leads.find((l) => l.companyName === companyName);
    if (!lead) {
      console.error(`Lead not found: ${companyName}`);
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

    console.log('=== Local MIME build verification ===');
    const local = verifyBuiltMimeLocally(message.raw, expected);
    console.log(`ok: ${local.ok}`);
    for (const err of local.errors) console.log(`  - ${err}`);
    console.log(`body preview: ${local.parsedBodyPreview ?? ''}`);

    if (localOnly) return;

    const id = draftId ?? lead.gmailDraftId;
    if (!id) {
      console.error('gmailDraftId がありません');
      process.exit(1);
    }

    console.log('');
    console.log(`=== Gmail drafts.get verification (${id}) ===`);
    const remote = await verifyGmailDraftById(id, expected);
    console.log(`ok: ${remote.ok}`);
    for (const err of remote.errors) console.log(`  - ${err}`);
    console.log(`From: ${remote.parsedFrom}`);
    console.log(`Reply-To: ${remote.parsedReplyTo}`);
    console.log(`To: ${remote.parsedTo}`);
    console.log(`Subject: ${remote.parsedSubject}`);
    console.log(`body preview: ${remote.parsedBodyPreview ?? ''}`);
    process.exit(remote.ok ? 0 : 1);
  }

  if (draftId) {
    const raw = await fetchGmailDraftRaw(draftId);
    console.log(raw.slice(0, 400));
    console.log('---');
    console.log('(company/--expected 未指定のため raw 先頭のみ表示)');
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
