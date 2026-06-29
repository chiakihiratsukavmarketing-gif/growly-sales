import { getGmailAccessToken } from './gmailAuth.js';
import {
  GmailFetchDiagnosticError,
  formatHttpResponseDiagnostics,
  formatSafeFetchError,
  runGmailFetchStage,
} from './gmailFetchDiagnostics.js';
import {
  bodyHasHeaderLeak,
  decodeMimeBody,
  extractEmailAddress,
  fromBase64Url,
  parseMimeHeaders,
  splitMimeRaw,
  subjectsMatch,
} from './gmailMimeUtils.js';

export interface GmailDraftVerifyExpected {
  fromEmail: string;
  replyToEmail: string;
  toEmail: string;
  subject: string;
  bodyPlain: string;
}

export interface GmailDraftVerifyResult {
  ok: boolean;
  errors: string[];
  parsedFrom?: string;
  parsedReplyTo?: string;
  parsedTo?: string;
  parsedSubject?: string;
  parsedBodyPreview?: string;
}

export class GmailDraftVerificationError extends Error {
  readonly errors: string[];

  constructor(errors: string[]) {
    super(`Gmail下書き検証失敗: ${errors.join(' / ')}`);
    this.name = 'GmailDraftVerificationError';
    this.errors = errors;
  }
}

export function verifyMimeRawText(raw: string, expected: GmailDraftVerifyExpected): GmailDraftVerifyResult {
  const errors: string[] = [];
  const { headersText, bodyText } = splitMimeRaw(raw);
  const headers = parseMimeHeaders(headersText);

  const parsedFrom = extractEmailAddress(headers.get('from') ?? '');
  const parsedReplyTo = extractEmailAddress(headers.get('reply-to') ?? '');
  const parsedTo = extractEmailAddress(headers.get('to') ?? '');
  const parsedSubject = headers.get('subject') ?? '';
  const parsedBody = decodeMimeBody(bodyText, headers).trim();

  const expectedFrom = expected.fromEmail.trim().toLowerCase();
  const expectedReplyTo = expected.replyToEmail.trim().toLowerCase();
  const expectedTo = expected.toEmail.trim().toLowerCase();

  if (parsedFrom !== expectedFrom) {
    errors.push(`From不一致: expected=${expectedFrom} actual=${parsedFrom || '(empty)'}`);
  }
  if (parsedReplyTo !== expectedReplyTo) {
    errors.push(`Reply-To不一致: expected=${expectedReplyTo} actual=${parsedReplyTo || '(empty)'}`);
  }
  if (parsedTo !== expectedTo) {
    errors.push(`To不一致: expected=${expectedTo} actual=${parsedTo || '(empty)'}`);
  }
  if (!subjectsMatch(parsedSubject, expected.subject)) {
    errors.push(`Subject不一致: expected=${expected.subject} actual=${parsedSubject || '(empty)'}`);
  }

  const leak = bodyHasHeaderLeak(parsedBody);
  if (leak) {
    errors.push(`本文先頭にヘッダー情報が混入: pattern=${leak}`);
  }

  const expectedBodyStart = expected.bodyPlain.trim().slice(0, 40);
  if (expectedBodyStart && !parsedBody.startsWith(expectedBodyStart)) {
    errors.push(`本文先頭不一致: expected starts with "${expectedBodyStart}"`);
  }

  if (headersText.includes('\n\n') && !headersText.includes('\r\n\r\n') && bodyText) {
    // local build should use CRLF; warn only when verifying Gmail-returned raw
  }

  return {
    ok: errors.length === 0,
    errors,
    parsedFrom,
    parsedReplyTo,
    parsedTo,
    parsedSubject,
    parsedBodyPreview: parsedBody.slice(0, 120),
  };
}

export function verifyBuiltMimeLocally(
  raw: string,
  expected: GmailDraftVerifyExpected
): GmailDraftVerifyResult {
  const result = verifyMimeRawText(raw, expected);
  const extra: string[] = [];

  if (!raw.includes('\r\n\r\n')) {
    extra.push('MIME raw に CRLF ヘッダー区切り (\\r\\n\\r\\n) がありません');
  }
  const { bodyText } = splitMimeRaw(raw);
  const headers = parseMimeHeaders(splitMimeRaw(raw).headersText);
  const encoding = (headers.get('content-transfer-encoding') ?? '').toLowerCase();
  if (encoding !== 'base64') {
    extra.push('Content-Transfer-Encoding は base64 である必要があります');
  }
  if (bodyText && /[^\x00-\x7F]/.test(bodyText.replace(/\s+/g, ''))) {
    // body chunk should be base64 ascii only
    const compact = bodyText.replace(/\s+/g, '');
    if (!/^[A-Za-z0-9+/=]+$/.test(compact)) {
      extra.push('本文パートが base64 エンコードされていません');
    }
  }

  return {
    ...result,
    ok: result.ok && extra.length === 0,
    errors: [...result.errors, ...extra],
  };
}

export async function fetchGmailDraftRaw(draftId: string): Promise<string> {
  const accessToken = await getGmailAccessToken();
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/drafts/${encodeURIComponent(draftId)}?format=raw`;

  return runGmailFetchStage('gmail_drafts_get', 'Gmail drafts.get: network request failed', async () => {
    let res: Response;
    try {
      res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    } catch (err) {
      throw new GmailFetchDiagnosticError('gmail_drafts_get', 'Gmail drafts.get: fetch failed', [
        formatSafeFetchError(err),
      ]);
    }

    if (!res.ok) {
      const text = await res.text();
      throw new GmailFetchDiagnosticError(
        'gmail_drafts_get',
        `Gmail drafts.get failed (HTTP ${res.status})`,
        formatHttpResponseDiagnostics(res.status, res.statusText, text, 'googleApi.error')
      );
    }

    const data = (await res.json()) as { message?: { raw?: string } };
    if (!data.message?.raw) {
      throw new GmailFetchDiagnosticError('gmail_drafts_get', 'Gmail drafts.get: missing message.raw', [
        'googleApi.error=(raw not present)',
      ]);
    }
    return fromBase64Url(data.message.raw);
  });
}

export async function verifyGmailDraftById(
  draftId: string,
  expected: GmailDraftVerifyExpected
): Promise<GmailDraftVerifyResult> {
  const raw = await fetchGmailDraftRaw(draftId);
  return verifyMimeRawText(raw, expected);
}

export async function deleteGmailDraft(draftId: string): Promise<void> {
  const accessToken = await getGmailAccessToken();
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/drafts/${encodeURIComponent(draftId)}`;

  await runGmailFetchStage('gmail_drafts_delete', 'Gmail drafts.delete: network request failed', async () => {
    let res: Response;
    try {
      res = await fetch(url, { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } });
    } catch (err) {
      throw new GmailFetchDiagnosticError('gmail_drafts_delete', 'Gmail drafts.delete: fetch failed', [
        formatSafeFetchError(err),
      ]);
    }
    if (!res.ok) {
      const text = await res.text();
      throw new GmailFetchDiagnosticError(
        'gmail_drafts_delete',
        `Gmail drafts.delete failed (HTTP ${res.status})`,
        formatHttpResponseDiagnostics(res.status, res.statusText, text, 'googleApi.error')
      );
    }
  });
}
