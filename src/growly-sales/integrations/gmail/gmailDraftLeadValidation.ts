import type { Lead } from '../../types/lead.js';
import { getOutreachSignatureEmail } from '../../config/env.js';
import { bodyHasHeaderLeak } from './gmailMimeUtils.js';

export function verifyLeadEmailBodyForGmailDraft(lead: Lead, body: string): string[] {
  const errors: string[] = [];
  const trimmed = body.trim();
  const signatureEmail = getOutreachSignatureEmail();

  if (!trimmed.includes(`Email：${signatureEmail}`)) {
    errors.push(`署名Email不一致: expected ${signatureEmail}`);
  }
  if (lead.contactFormUrl && trimmed.includes(lead.contactFormUrl)) {
    errors.push(`本文にフォームURL: ${lead.contactFormUrl}`);
  }
  for (const src of lead.emailCandidateSourceUrls) {
    if (src.trim() && trimmed.includes(src.trim())) {
      errors.push(`本文に確認元URL: ${src}`);
    }
  }
  const leak = bodyHasHeaderLeak(trimmed);
  if (leak) {
    errors.push(`本文ヘッダー混入: ${leak}`);
  }
  if (!trimmed.startsWith(lead.companyName.trim())) {
    errors.push(`本文先頭が会社名ではない: ${trimmed.slice(0, 40)}`);
  }
  if (!trimmed.includes('ご担当者様')) {
    errors.push('本文に「ご担当者様」がありません');
  }
  return errors;
}

export function buildGmailDraftMimeChecklist(
  lead: Lead,
  parsed: {
    fromEmail: string;
    replyToEmail: string;
    toEmail: string;
    subject: string;
    body: string;
  },
  expected: {
    fromEmail: string;
    replyToEmail: string;
    toEmail: string;
    subject: string;
    signatureEmail: string;
  }
): { id: string; label: string; ok: boolean }[] {
  const bodyErrors = verifyLeadEmailBodyForGmailDraft(lead, parsed.body);
  return [
    {
      id: 'from',
      label: `From = ${expected.fromEmail}`,
      ok: parsed.fromEmail === expected.fromEmail.toLowerCase(),
    },
    {
      id: 'reply-to',
      label: `Reply-To = ${expected.replyToEmail}`,
      ok: parsed.replyToEmail === expected.replyToEmail.toLowerCase(),
    },
    {
      id: 'to',
      label: `To = ${expected.toEmail}`,
      ok: parsed.toEmail === expected.toEmail.toLowerCase(),
    },
    {
      id: 'subject',
      label: 'Subject が Lead 件名と一致',
      ok: parsed.subject.trim().length > 0,
    },
    {
      id: 'body-start',
      label: '本文先頭が会社名 + ご担当者様',
      ok: bodyErrors.every((e) => !e.includes('会社名') && !e.includes('ご担当者様')),
    },
    {
      id: 'no-header-leak',
      label: '本文に From/Reply-To/To 等のヘッダー混入なし',
      ok: !bodyErrors.some((e) => e.includes('ヘッダー')),
    },
    {
      id: 'no-form-url',
      label: '本文にフォームURLなし',
      ok: !bodyErrors.some((e) => e.includes('フォームURL')),
    },
    {
      id: 'no-source-url',
      label: '本文に確認元URLなし',
      ok: !bodyErrors.some((e) => e.includes('確認元URL')),
    },
    {
      id: 'signature-email',
      label: `署名Email = ${expected.signatureEmail}`,
      ok: !bodyErrors.some((e) => e.includes('署名Email')),
    },
  ];
}
