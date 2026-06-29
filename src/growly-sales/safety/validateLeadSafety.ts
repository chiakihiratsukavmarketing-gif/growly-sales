import type { Lead, RiskLevel } from '../types/lead.js';
import {
  ALLOWED_EMAIL_PREFIXES,
  filterAllowedEmails,
  looksLikePersonalEmail,
} from './contactPolicy.js';
export interface SafetyValidationResult {
  lead: Lead;
  warnings: string[];
  rejectedEmails: string[];
}

export function validateLeadSafety(
  lead: Lead,
  options?: { suspiciousEmails?: string[] }
): SafetyValidationResult {
  const warnings: string[] = [];
  let riskLevel: RiskLevel = lead.riskLevel;
  let humanReviewStatus = lead.humanReviewStatus;
  let collectionStatus = lead.collectionStatus;

  const { allowed, rejected } = filterAllowedEmails(lead.emailCandidates);

  if (rejected.length > 0) {
    warnings.push(`Rejected ${rejected.length} email(s): ${rejected.join(', ')}`);
  }

  if (options?.suspiciousEmails && options.suspiciousEmails.length > 0) {
    warnings.push(
      `Suspicious emails from script/hidden elements excluded: ${options.suspiciousEmails.join(', ')}`
    );
    riskLevel = 'high';
    humanReviewStatus = 'pending';
    collectionStatus = 'needs_review';
  }

  if (rejected.length > 0) {
    warnings.push(`Rejected ${rejected.length} email(s): ${rejected.join(', ')}`);
  }

  for (const email of allowed) {
    if (looksLikePersonalEmail(email)) {
      warnings.push(`Personal-like email removed: ${email}`);
    }
  }

  const safeEmails = allowed.filter((e) => !looksLikePersonalEmail(e));

  if (
    options &&
    (!options.suspiciousEmails || options.suspiciousEmails.length === 0) &&
    safeEmails.length > 0
  ) {
    collectionStatus = 'collected';
    if (riskLevel === 'high') {
      riskLevel = 'low';
    }
  }

  if (lead.emailCandidates.length > safeEmails.length) {
    riskLevel = 'high';
    humanReviewStatus = 'pending';
  }

  if (safeEmails.length === 0 && lead.contactFormUrl === null) {
    if (riskLevel === 'low') riskLevel = 'medium';
    warnings.push('No safe contact method found');
  }

  if (lead.sourceUrls.length === 0) {
    riskLevel = 'high';
    humanReviewStatus = 'pending';
    warnings.push('sourceUrls is empty');
  }

  if (lead.doNotContact) {
    warnings.push('doNotContact is true — excluded from outreach');
  }

  const updatedLead: Lead = {
    ...lead,
    emailCandidates: safeEmails,
    riskLevel,
    humanReviewStatus,
    collectionStatus,
    updatedAt: new Date().toISOString(),
  };

  return {
    lead: updatedLead,
    warnings,
    rejectedEmails: rejected,
  };
}

export function assertNoPersonalEmailsInLeads(leads: Lead[]): string[] {
  const errors: string[] = [];
  for (const lead of leads) {
    for (const email of lead.emailCandidates) {
      if (looksLikePersonalEmail(email)) {
        errors.push(`Personal email found in lead ${lead.id}: ${email}`);
      }
      const local = email.split('@')[0] ?? '';
      const isAllowed = ALLOWED_EMAIL_PREFIXES.some(
        (p) => local === p || local.startsWith(`${p}.`) || local.startsWith(`${p}-`)
      );
      if (!isAllowed) {
        errors.push(`Non-corporate email in lead ${lead.id}: ${email}`);
      }
    }
  }
  return errors;
}
