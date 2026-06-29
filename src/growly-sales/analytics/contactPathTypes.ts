import type { Lead } from '../types/lead.js';

export type ContactPathConfidence = 'low' | 'medium' | 'high';
export type EmailContactType = 'corporate' | 'generic' | 'personal_rejected' | 'unknown';
export type ContactPathType = 'email' | 'contact_form' | 'both' | 'none';

export function hasEmailCandidates(lead: Lead): boolean {
  return lead.emailCandidates.some((e) => e.trim().length > 0);
}

export function hasContactForm(lead: Lead): boolean {
  return Boolean(lead.contactFormUrl?.trim());
}

export function inferContactPathType(lead: Lead): ContactPathType {
  return inferContactPathTypeFromFields(lead.emailCandidates, lead.contactFormUrl);
}

export function inferContactPathTypeFromFields(
  emailCandidates: string[],
  contactFormUrl: string | null
): ContactPathType {
  const hasEmail = emailCandidates.some((e) => e.trim().length > 0);
  const hasForm = Boolean(contactFormUrl?.trim());
  if (hasEmail && hasForm) return 'both';
  if (hasEmail) return 'email';
  if (hasForm) return 'contact_form';
  return 'none';
}

export function isGmailDraftPossibleLead(lead: Lead): boolean {
  return hasEmailCandidates(lead) && !lead.doNotContact;
}

export function isFormCopyOnlyLead(lead: Lead): boolean {
  return !hasEmailCandidates(lead) && hasContactForm(lead);
}
