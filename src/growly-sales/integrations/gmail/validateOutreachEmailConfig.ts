import {
  getOutreachFromEmail,
  getOutreachReplyToEmail,
  getOutreachSignatureEmail,
} from '../../config/env.js';
import {
  assertOutreachFromSendAsAvailable,
  listGmailSendAsAliases,
  type GmailSendAsAlias,
} from './gmailSendAs.js';

export interface OutreachEmailConfigReport {
  fromEmail: string;
  replyToEmail: string;
  signatureEmail: string;
  sendAsAvailable: boolean;
  sendAsAlias: GmailSendAsAlias | null;
  availableSendAs: GmailSendAsAlias[];
}

/** Gmail下書き作成前: sendAs 確認 + 設定値の報告用オブジェクトを返す */
export async function validateOutreachEmailConfig(): Promise<OutreachEmailConfigReport> {
  const fromEmail = getOutreachFromEmail();
  const replyToEmail = getOutreachReplyToEmail();
  const signatureEmail = getOutreachSignatureEmail();
  const availableSendAs = await listGmailSendAsAliases();

  let sendAsAlias: GmailSendAsAlias | null = null;
  let sendAsAvailable = false;

  try {
    sendAsAlias = await assertOutreachFromSendAsAvailable(fromEmail);
    sendAsAvailable = true;
  } catch {
    sendAsAvailable = false;
  }

  return {
    fromEmail,
    replyToEmail,
    signatureEmail,
    sendAsAvailable,
    sendAsAlias,
    availableSendAs,
  };
}

/** sendAs が利用不可の場合は例外を投げる（下書き作成を停止） */
export async function requireOutreachSendAsForDraftCreate(): Promise<OutreachEmailConfigReport> {
  const report = await validateOutreachEmailConfig();
  if (!report.sendAsAvailable) {
    const { GmailSendAsUnavailableError } = await import('./gmailSendAs.js');
    throw new GmailSendAsUnavailableError(report.fromEmail, report.availableSendAs);
  }
  return report;
}
