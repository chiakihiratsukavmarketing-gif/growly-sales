/**
 * Gmail下書き作成 adapter — users.drafts.create のみ。
 * 送信系 Gmail API は実装禁止（安全ルール）。
 */
import {
  GmailFetchDiagnosticError,
  formatHttpResponseDiagnostics,
  formatSafeFetchError,
  runGmailFetchStage,
} from './gmailFetchDiagnostics.js';
import { GMAIL_DRAFTS_CREATE_ENDPOINT, type GmailDraftCreateResult, type GmailDraftMessage } from './gmailDraftTypes.js';
import { getGmailAccessToken } from './gmailAuth.js';
import {
  GmailDraftVerificationError,
  verifyBuiltMimeLocally,
  verifyGmailDraftById,
  deleteGmailDraft,
} from './gmailDraftVerify.js';

export async function createGmailDraft(message: GmailDraftMessage): Promise<GmailDraftCreateResult> {
  const accessToken = await getGmailAccessToken();

  return runGmailFetchStage(
    'gmail_drafts_create',
    'Gmail drafts.create: network request failed',
    async () => {
      let res: Response;
      try {
        res = await fetch(GMAIL_DRAFTS_CREATE_ENDPOINT, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: { raw: message.rawBase64Url },
          }),
        });
      } catch (err) {
        throw new GmailFetchDiagnosticError('gmail_drafts_create', 'Gmail drafts.create: fetch failed', [
          formatSafeFetchError(err),
        ]);
      }

      if (!res.ok) {
        const text = await res.text();
        throw new GmailFetchDiagnosticError(
          'gmail_drafts_create',
          `Gmail drafts.create failed (HTTP ${res.status})`,
          formatHttpResponseDiagnostics(res.status, res.statusText, text, 'googleApi.error')
        );
      }

      let data: { id?: string; message?: { id?: string } };
      try {
        data = (await res.json()) as { id?: string; message?: { id?: string } };
      } catch (err) {
        throw new GmailFetchDiagnosticError('gmail_drafts_create', 'Gmail drafts.create: invalid JSON response', [
          formatSafeFetchError(err),
        ]);
      }

      if (!data.id) {
        throw new GmailFetchDiagnosticError('gmail_drafts_create', 'Gmail drafts.create: response missing draft id', [
          'googleApi.error=(draft id not present in response)',
        ]);
      }

      return {
        draftId: data.id,
        messageId: data.message?.id,
      };
    }
  );
}

/** ローカルMIME検証 → drafts.create → drafts.get(raw) で From/Reply-To/本文を検証 */
export async function createVerifiedGmailDraft(message: GmailDraftMessage): Promise<GmailDraftCreateResult> {
  const expected = {
    fromEmail: message.from,
    replyToEmail: message.replyTo,
    toEmail: message.to,
    subject: message.subject,
    bodyPlain: message.body,
  };

  const local = verifyBuiltMimeLocally(message.raw, expected);
  if (!local.ok) {
    throw new GmailDraftVerificationError(local.errors);
  }

  const created = await createGmailDraft(message);

  const remote = await verifyGmailDraftById(created.draftId, expected);
  if (!remote.ok) {
    try {
      await deleteGmailDraft(created.draftId);
    } catch {
      // best-effort cleanup of invalid draft
    }
    throw new GmailDraftVerificationError(remote.errors);
  }

  return created;
}

export { GmailDraftVerificationError };
