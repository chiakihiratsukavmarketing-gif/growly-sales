import type { Lead } from '../../types/lead.js';
import { hasContactForm, hasEmailCandidates } from '../analytics/contactPathTypes.js';
import { buildPhaseBInventoryReport } from '../workflow/leadPhaseBInventory.js';
import { inferNextActionForLead } from '../workflow/replyManagement.js';
import {
  humanReviewLabel,
  nextActionLabel,
  replyStatusLabel,
  sendStatusLabel,
} from './displayLabels.js';

export function leadListStatusLabel(lead: Lead): string {
  if (lead.doNotContact) return '連絡禁止';
  if (lead.sendStatus === 'sent' || lead.sendStatus === 'manual_sent') {
    if (lead.humanReviewStatus === 'pending') return '送信済み・承認待ち';
    return replyStatusLabel(lead.replyStatus);
  }
  if (lead.gmailDraftStatus === 'draft_created') return '下書きあり';
  if (lead.humanReviewStatus === 'pending') {
    if (!hasEmailCandidates(lead) && hasContactForm(lead)) return 'フォームのみ・承認待ち';
    if (!hasEmailCandidates(lead)) return '承認待ち（導線なし）';
    return 'メールあり・承認待ち';
  }
  return humanReviewLabel(lead.humanReviewStatus);
}

export interface LeadListOpsSummary {
  humanReviewPending: number;
  emailDraftEligible: number;
  formOnlyPending: number;
  gmailOutreach: number;
  formOutreach: number;
  exclusionCandidates: number;
  duplicateCandidates: number;
}

export function summarizeLeadListOps(leads: Lead[]): LeadListOpsSummary {
  const pending = leads.filter((l) => l.humanReviewStatus === 'pending');
  const phaseB = buildPhaseBInventoryReport(leads);
  return {
    humanReviewPending: pending.length,
    emailDraftEligible: pending.filter(
      (l) =>
        l.sendStatus === 'not_sent' &&
        hasEmailCandidates(l) &&
        l.gmailDraftStatus !== 'draft_created' &&
        Boolean(l.emailSubject?.trim()) &&
        Boolean(l.emailBody?.trim())
    ).length,
    formOnlyPending: pending.filter(
      (l) => l.sendStatus === 'not_sent' && !hasEmailCandidates(l) && hasContactForm(l)
    ).length,
    gmailOutreach: phaseB.counts.gmail_outreach,
    formOutreach: phaseB.counts.form_outreach,
    exclusionCandidates: phaseB.counts.exclusion_candidate,
    duplicateCandidates: phaseB.counts.duplicate_candidate,
  };
}

export function leadListNextAction(lead: Lead): string {
  return nextActionLabel(inferNextActionForLead(lead));
}

export function countFollowUpUrgent(leads: Lead[]): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return leads.filter((l) => {
    if (l.doNotContact || l.nextAction !== 'フォローアップ') return false;
    if (!l.followUpDueAt) return false;
    const due = new Date(l.followUpDueAt);
    due.setHours(0, 0, 0, 0);
    return due.getTime() <= today.getTime();
  }).length;
}

export { sendStatusLabel, replyStatusLabel, humanReviewLabel, nextActionLabel };
