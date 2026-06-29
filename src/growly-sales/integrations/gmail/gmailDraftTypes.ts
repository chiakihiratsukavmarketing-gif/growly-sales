import type { Lead } from '../../types/lead.js';

/** Gmail API users.drafts.create のみ使用。送信APIは禁止。 */
export const GMAIL_DRAFTS_CREATE_ENDPOINT =
  'https://gmail.googleapis.com/gmail/v1/users/me/drafts';

export interface GmailDraftMessage {
  to: string;
  from: string;
  fromDisplayName: string;
  replyTo: string;
  subject: string;
  body: string;
  raw: string;
  rawBase64Url: string;
}

export interface GmailDraftCreateResult {
  draftId: string;
  messageId?: string;
}

export interface GmailDraftPreviewItem {
  leadId: string;
  companyName: string;
  area: string;
  industry: string;
  to: string;
  emailSubject: string;
  emailBody: string;
  contactFormUrl: string | null;
  gmailDraftStatus: Lead['gmailDraftStatus'];
  humanReviewStatus: Lead['humanReviewStatus'];
  sendStatus: Lead['sendStatus'];
}

export interface GmailDraftSkippedItem {
  leadId: string;
  companyName: string;
  reason: string;
}

export interface GmailDraftPreviewResult {
  eligible: GmailDraftPreviewItem[];
  skipped: GmailDraftSkippedItem[];
  excluded: GmailDraftSkippedItem[];
  generatedAt: string;
  note: string;
}

export interface GmailDraftCreateStats {
  attempted: number;
  created: number;
  failed: number;
  skipped: number;
}
