import type { Lead } from '../../types/lead.js';
import type { OfferProfile } from '../../config/offerProfile.js';
import { buildGmailDraftMessage, pickGmailToAddress } from './buildGmailDraftMessage.js';
import { getGmailDraftExclusionReason } from './selectGmailDraftCandidates.js';
import type { GmailDraftPreviewResult } from './gmailDraftTypes.js';

const PREVIEW_NOTE =
  'Gmail APIには接続しません。sendStatus / gmailDraftStatus は変更しません。送信は行いません。';

export function previewGmailDrafts(
  leads: Lead[],
  offer?: OfferProfile,
  generatedAt = new Date().toISOString()
): GmailDraftPreviewResult {
  const eligible: GmailDraftPreviewResult['eligible'] = [];
  const skipped: GmailDraftPreviewResult['skipped'] = [];
  const excluded: GmailDraftPreviewResult['excluded'] = [];

  for (const lead of leads) {
    const reason = getGmailDraftExclusionReason(lead, offer);

    if (reason?.includes('form_later') || reason?.includes('emailCandidatesなし')) {
      skipped.push({ leadId: lead.id, companyName: lead.companyName, reason });
      continue;
    }

    if (reason) {
      excluded.push({ leadId: lead.id, companyName: lead.companyName, reason });
      continue;
    }

    const to = pickGmailToAddress(lead);
    if (!to) {
      skipped.push({
        leadId: lead.id,
        companyName: lead.companyName,
        reason: 'emailCandidatesなし（問い合わせフォームのみ・Gmail下書き対象外）',
      });
      continue;
    }

    const message = buildGmailDraftMessage(lead);
    eligible.push({
      leadId: lead.id,
      companyName: lead.companyName,
      area: lead.area,
      industry: lead.industry,
      to,
      emailSubject: message.subject,
      emailBody: message.body,
      contactFormUrl: lead.contactFormUrl,
      gmailDraftStatus: lead.gmailDraftStatus,
      humanReviewStatus: lead.humanReviewStatus,
      sendStatus: lead.sendStatus,
    });
  }

  return {
    eligible,
    skipped,
    excluded,
    generatedAt,
    note: PREVIEW_NOTE,
  };
}
