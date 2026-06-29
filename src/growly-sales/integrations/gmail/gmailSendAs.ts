/**
 * Gmail settings.sendAs — 下書き作成前に送信元エイリアスの利用可否を確認する。
 */
import { getOutreachFromEmail } from '../../config/env.js';
import { getGmailAccessToken } from './gmailAuth.js';
import {
  GmailFetchDiagnosticError,
  formatHttpResponseDiagnostics,
  formatSafeFetchError,
  runGmailFetchStage,
} from './gmailFetchDiagnostics.js';

export const GMAIL_SEND_AS_LIST_ENDPOINT =
  'https://gmail.googleapis.com/gmail/v1/users/me/settings/sendAs';

export interface GmailSendAsAlias {
  sendAsEmail: string;
  displayName: string;
  isPrimary: boolean;
  verificationStatus: string;
}

export class GmailSendAsUnavailableError extends Error {
  readonly requestedEmail: string;
  readonly availableAliases: GmailSendAsAlias[];

  constructor(requestedEmail: string, availableAliases: GmailSendAsAlias[]) {
    const list = availableAliases.map((a) => a.sendAsEmail).join(', ') || '(なし)';
    super(
      `Gmail sendAs に ${requestedEmail} がありません。利用可能: ${list}。下書き作成を停止しました。`
    );
    this.name = 'GmailSendAsUnavailableError';
    this.requestedEmail = requestedEmail;
    this.availableAliases = availableAliases;
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function listGmailSendAsAliases(): Promise<GmailSendAsAlias[]> {
  const accessToken = await getGmailAccessToken();

  return runGmailFetchStage(
    'gmail_send_as_list',
    'Gmail settings.sendAs.list: network request failed',
    async () => {
      let res: Response;
      try {
        res = await fetch(GMAIL_SEND_AS_LIST_ENDPOINT, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
      } catch (err) {
        throw new GmailFetchDiagnosticError('gmail_send_as_list', 'Gmail settings.sendAs.list: fetch failed', [
          formatSafeFetchError(err),
        ]);
      }

      if (!res.ok) {
        const text = await res.text();
        throw new GmailFetchDiagnosticError(
          'gmail_send_as_list',
          `Gmail settings.sendAs.list failed (HTTP ${res.status})`,
          formatHttpResponseDiagnostics(res.status, res.statusText, text, 'googleApi.error')
        );
      }

      let data: { sendAs?: Array<Record<string, unknown>> };
      try {
        data = (await res.json()) as { sendAs?: Array<Record<string, unknown>> };
      } catch (err) {
        throw new GmailFetchDiagnosticError(
          'gmail_send_as_list',
          'Gmail settings.sendAs.list: invalid JSON response',
          [formatSafeFetchError(err)]
        );
      }

      return (data.sendAs ?? []).map((entry) => ({
        sendAsEmail: String(entry.sendAsEmail ?? ''),
        displayName: String(entry.displayName ?? ''),
        isPrimary: Boolean(entry.isPrimary),
        verificationStatus: String(entry.verificationStatus ?? ''),
      }));
    }
  );
}

export function isSendAsAliasUsable(alias: GmailSendAsAlias): boolean {
  return alias.isPrimary || alias.verificationStatus === 'accepted';
}

export async function assertOutreachFromSendAsAvailable(fromEmail?: string): Promise<GmailSendAsAlias> {
  const target = normalizeEmail(fromEmail ?? getOutreachFromEmail());
  const aliases = await listGmailSendAsAliases();
  const match = aliases.find((a) => normalizeEmail(a.sendAsEmail) === target);

  if (!match || !isSendAsAliasUsable(match)) {
    throw new GmailSendAsUnavailableError(fromEmail ?? getOutreachFromEmail(), aliases);
  }

  return match;
}
