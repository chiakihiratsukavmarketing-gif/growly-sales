import type { Lead } from '../../types/lead.js';
import type { GmailDraftMessage } from './gmailDraftTypes.js';
import {
  getOutreachFromDisplayName,
  getOutreachFromEmail,
  getOutreachReplyToEmail,
} from '../../config/env.js';
import {
  encodeBase64Body,
  encodeMimeWordUtf8,
  formatFromHeader,
  toBase64Url,
} from './gmailMimeUtils.js';

export function pickGmailToAddress(lead: Lead): string | null {
  const corporate = lead.emailCandidates
    .map((e) => e.trim())
    .filter((e) => e.length > 0);
  return corporate[0] ?? null;
}

/** RFC 2822 raw MIME（ヘッダーと本文は厳密に分離。本文は base64） */
export function buildGmailDraftMimeRaw(input: {
  to: string;
  fromEmail: string;
  fromDisplayName: string;
  replyTo: string;
  subject: string;
  body: string;
}): string {
  const headerBlock = [
    `From: ${formatFromHeader(input.fromDisplayName, input.fromEmail)}`,
    `Reply-To: ${input.replyTo}`,
    `To: ${input.to}`,
    `Subject: ${encodeMimeWordUtf8(input.subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
  ].join('\r\n');

  return `${headerBlock}\r\n\r\n${encodeBase64Body(input.body)}`;
}

export interface BuildGmailDraftMessageOptions {
  /** Appended after emailBody with a blank line. Do not pass rawToken. */
  unsubscribeFooterText?: string;
}

export function buildGmailDraftMessage(
  lead: Lead,
  options?: BuildGmailDraftMessageOptions
): GmailDraftMessage {
  const to = pickGmailToAddress(lead);
  if (!to) {
    throw new Error('emailCandidates が空のため Gmail 下書きメッセージを作成できません');
  }

  const subject = lead.emailSubject.trim();
  const baseBody = lead.emailBody.trim();
  const footerText = options?.unsubscribeFooterText?.trim();
  const body = footerText ? `${baseBody}\n\n${footerText}` : baseBody;
  const fromEmail = getOutreachFromEmail();
  const fromDisplayName = getOutreachFromDisplayName();
  const replyTo = getOutreachReplyToEmail();

  const raw = buildGmailDraftMimeRaw({
    to,
    fromEmail,
    fromDisplayName,
    replyTo,
    subject,
    body,
  });

  return {
    to,
    from: fromEmail,
    fromDisplayName,
    replyTo,
    subject,
    body,
    raw,
    rawBase64Url: toBase64Url(raw),
  };
}
