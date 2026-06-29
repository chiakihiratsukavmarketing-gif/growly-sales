import {
  getEmailLocalPart,
  isAllowedCorporateEmail,
  isFreeEmailDomain,
  isRejectedEmail,
  looksLikePersonalEmail,
} from '../safety/contactPolicy.js';
import type { ContactPathConfidence, EmailContactType } from '../analytics/contactPathTypes.js';

export type EmailExtractionSource = 'mailto' | 'visible' | 'at_notation' | 'fullwidth_at';

export interface ClassifiedEmailCandidate {
  email: string;
  sourceUrl: string;
  source: EmailExtractionSource;
  contactType: EmailContactType;
  confidence: ContactPathConfidence;
  rejected: boolean;
  rejectReason?: string;
}

const HIGH_CONFIDENCE_PREFIXES = ['info', 'contact', 'office', 'inquiry', 'toiawase'] as const;

export function classifyEmailCandidate(
  email: string,
  sourceUrl: string,
  source: EmailExtractionSource
): ClassifiedEmailCandidate {
  const normalized = email.trim().toLowerCase();

  if (isRejectedEmail(normalized)) {
    return {
      email: normalized,
      sourceUrl,
      source,
      contactType: 'personal_rejected',
      confidence: 'low',
      rejected: true,
      rejectReason: 'rejected_pattern',
    };
  }

  if (isFreeEmailDomain(normalized)) {
    return {
      email: normalized,
      sourceUrl,
      source,
      contactType: 'personal_rejected',
      confidence: 'low',
      rejected: true,
      rejectReason: 'free_email_domain',
    };
  }

  if (looksLikePersonalEmail(normalized)) {
    return {
      email: normalized,
      sourceUrl,
      source,
      contactType: 'personal_rejected',
      confidence: 'low',
      rejected: true,
      rejectReason: 'personal_like',
    };
  }

  if (!isAllowedCorporateEmail(normalized)) {
    return {
      email: normalized,
      sourceUrl,
      source,
      contactType: 'unknown',
      confidence: 'low',
      rejected: true,
      rejectReason: 'not_corporate_prefix',
    };
  }

  const local = getEmailLocalPart(normalized);
  const isHighPrefix = HIGH_CONFIDENCE_PREFIXES.some(
    (p) => local === p || local.startsWith(`${p}.`) || local.startsWith(`${p}-`)
  );

  let confidence: ContactPathConfidence = 'medium';
  if (source === 'mailto' && isHighPrefix) confidence = 'high';
  else if (source === 'at_notation' || source === 'fullwidth_at') confidence = 'medium';
  else if (isHighPrefix) confidence = 'high';
  else confidence = 'medium';

  return {
    email: normalized,
    sourceUrl,
    source,
    contactType: 'corporate',
    confidence,
    rejected: false,
  };
}

export function pickLeadEmailConfidence(candidates: ClassifiedEmailCandidate[]): ContactPathConfidence {
  const allowed = candidates.filter((c) => !c.rejected);
  if (allowed.length === 0) return 'low';
  if (allowed.some((c) => c.confidence === 'high')) return 'high';
  if (allowed.some((c) => c.confidence === 'medium')) return 'medium';
  return 'low';
}

export function pickLeadEmailContactType(candidates: ClassifiedEmailCandidate[]): EmailContactType {
  const allowed = candidates.filter((c) => !c.rejected);
  if (allowed.length === 0) {
    const rejected = candidates.find((c) => c.rejected);
    return rejected?.contactType === 'personal_rejected' ? 'personal_rejected' : 'unknown';
  }
  if (allowed.every((c) => c.contactType === 'corporate')) return 'corporate';
  return 'generic';
}
