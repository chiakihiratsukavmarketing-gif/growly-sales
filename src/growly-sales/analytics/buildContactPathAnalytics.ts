import type { Lead } from '../types/lead.js';
import {
  hasEmailCandidates,
  hasContactForm,
  isFormCopyOnlyLead,
  isGmailDraftPossibleLead,
} from './contactPathTypes.js';

export interface ContactPathAnalytics {
  totalLeads: number;
  emailCandidateLeads: number;
  contactFormOnlyLeads: number;
  bothEmailAndFormLeads: number;
  noContactPathLeads: number;
  emailCandidateRate: number;
  contactFormRate: number;
  bothRate: number;
  noContactPathRate: number;
  gmailDraftPossibleLeads: number;
  formCopyOnlyLeads: number;
  note: string;
}

function hasBothEmailAndForm(lead: Lead): boolean {
  return hasEmailCandidates(lead) && hasContactForm(lead);
}

function hasContactFormOnly(lead: Lead): boolean {
  return isFormCopyOnlyLead(lead);
}

function hasNoContactPath(lead: Lead): boolean {
  return !hasEmailCandidates(lead) && !hasContactForm(lead);
}

export function buildContactPathAnalytics(leads: Lead[]): ContactPathAnalytics {
  const totalLeads = leads.length;
  const emailCandidateLeads = leads.filter(hasEmailCandidates).length;
  const bothEmailAndFormLeads = leads.filter(hasBothEmailAndForm).length;
  const contactFormOnlyLeads = leads.filter(hasContactFormOnly).length;
  const noContactPathLeads = leads.filter(hasNoContactPath).length;
  const gmailDraftPossibleLeads = leads.filter(isGmailDraftPossibleLead).length;
  const formCopyOnlyLeads = leads.filter(isFormCopyOnlyLead).length;

  const rate = (n: number) => (totalLeads === 0 ? 0 : Number(((n / totalLeads) * 100).toFixed(1)));

  return {
    totalLeads,
    emailCandidateLeads,
    contactFormOnlyLeads,
    bothEmailAndFormLeads,
    noContactPathLeads,
    emailCandidateRate: rate(emailCandidateLeads),
    contactFormRate: rate(contactFormOnlyLeads),
    bothRate: rate(bothEmailAndFormLeads),
    noContactPathRate: rate(noContactPathLeads),
    gmailDraftPossibleLeads,
    formCopyOnlyLeads,
    note:
      'メール営業優先。Gmail下書き候補=emailCandidatesあり・not_sent。フォームのみ=form_later（後回し）。送信は行いません。',
  };
}
