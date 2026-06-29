import type { Lead } from '../types/lead.js';
import { getOutreachFromEmail, getOutreachReplyToEmail } from '../config/env.js';
import { loadLeadsFromJson, saveLeadsToJson } from '../storage/jsonLeadRepository.js';
import { saveLeadsToCsv } from '../storage/csvLeadRepository.js';
import { getLeadsCsvPath, getLeadsJsonPath } from '../config/paths.js';
import { inferNextActionForLead } from './replyManagement.js';
import { LeadNotFoundError } from './updateLeadCommunication.js';

export class ManualGmailSendRecordError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ManualGmailSendRecordError';
  }
}

export interface ManualGmailSendPreview {
  leadId: string;
  companyName: string;
  to: string;
  from: string;
  replyTo: string;
  draftId: string;
  subject: string;
}

/** Gmail下書き作成済み・未送信で、手動送信記録が可能な Lead */
export function isPendingGmailSendRecordLead(lead: Lead): boolean {
  return (
    lead.sendStatus === 'not_sent' &&
    lead.gmailDraftStatus === 'draft_created' &&
    Boolean(lead.gmailDraftId?.trim()) &&
    !lead.doNotContact &&
    lead.emailCandidates.some((e) => e.trim().length > 0)
  );
}

export function buildManualGmailSendPreview(lead: Lead): ManualGmailSendPreview {
  const draftId = lead.gmailDraftId?.trim();
  if (!draftId) {
    throw new ManualGmailSendRecordError('gmailDraftId がありません');
  }
  const to = lead.emailCandidates.find((e) => e.trim().length > 0)?.trim() ?? '';
  if (!to) {
    throw new ManualGmailSendRecordError('宛先メールがありません');
  }
  return {
    leadId: lead.id,
    companyName: lead.companyName,
    to,
    from: getOutreachFromEmail(),
    replyTo: getOutreachReplyToEmail(),
    draftId,
    subject: lead.emailSubject?.trim() || '（件名なし）',
  };
}

function buildSentMemo(preview: ManualGmailSendPreview): string {
  return [
    'Gmail手動送信（manual_gmail）',
    `draftId=${preview.draftId}`,
    `To=${preview.to}`,
    `From=${preview.from}`,
    `Reply-To=${preview.replyTo}`,
  ].join(' / ');
}

function assertCanRecord(lead: Lead, expectedDraftId: string): void {
  if (lead.sendStatus === 'sent' || lead.sendStatus === 'manual_sent') {
    throw new ManualGmailSendRecordError('この Lead はすでに送信記録済みです');
  }
  if (!isPendingGmailSendRecordLead(lead)) {
    throw new ManualGmailSendRecordError(
      '記録対象外です（Gmail下書き作成済み・未送信の Lead のみ）'
    );
  }
  const leadDraftId = lead.gmailDraftId?.trim() ?? '';
  const confirmed = expectedDraftId.trim();
  if (!confirmed || leadDraftId !== confirmed) {
    throw new ManualGmailSendRecordError(
      `draftId が一致しません（Lead: ${leadDraftId || 'なし'} / 確認: ${confirmed || 'なし'}）`
    );
  }
}

export function applyManualGmailSendRecord(
  lead: Lead,
  draftId: string,
  sentAt: string = new Date().toISOString()
): Lead {
  assertCanRecord(lead, draftId);
  const preview = buildManualGmailSendPreview(lead);
  const memoLine = buildSentMemo(preview);
  const communicationMemo = lead.communicationMemo.includes(memoLine)
    ? lead.communicationMemo
    : [lead.communicationMemo, memoLine].filter(Boolean).join(' / ');

  return {
    ...lead,
    sendStatus: 'sent',
    manualSentAt: sentAt,
    manualSendMethod: 'email',
    nextAction: inferNextActionForLead({ ...lead, sendStatus: 'sent' }),
    communicationMemo,
    updatedAt: sentAt,
  };
}

export async function recordManualGmailSent(
  leadId: string,
  options: { draftId: string; sentAt?: string },
  jsonPath: string = getLeadsJsonPath(),
  csvPath: string = getLeadsCsvPath()
): Promise<{ lead: Lead; preview: ManualGmailSendPreview }> {
  const leads = await loadLeadsFromJson(jsonPath);
  let found: Lead | null = null;
  const sentAt = options.sentAt ?? new Date().toISOString();

  const updated = leads.map((lead) => {
    if (lead.id !== leadId) return lead;
    found = applyManualGmailSendRecord(lead, options.draftId, sentAt);
    return found;
  });

  if (!found) throw new LeadNotFoundError(leadId);
  await saveLeadsToJson(jsonPath, updated);
  await saveLeadsToCsv(csvPath, updated);
  return { lead: found, preview: buildManualGmailSendPreview(found) };
}
