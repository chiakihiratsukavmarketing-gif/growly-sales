import type { Lead } from '../types/lead.js';

const LEAD_SCORE_ORDER: Record<Lead['leadScore'], number> = {
  A: 3,
  B: 2,
  C: 1,
  UNKNOWN: 0,
};

const RISK_ORDER: Record<Lead['riskLevel'], number> = {
  low: 3,
  medium: 2,
  high: 1,
};

export function getLeadDisplayPriority(lead: Lead): number {
  let score = 0;

  if (lead.reviewStatus === 'approve' && lead.humanReviewStatus === 'pending') {
    score += 1000;
  }
  score += LEAD_SCORE_ORDER[lead.leadScore] * 100;
  score += RISK_ORDER[lead.riskLevel] * 10;

  if (lead.doNotContact || lead.sendStatus === 'blocked') {
    score -= 500;
  }

  return score;
}

export function sortLeadsForDisplay(leads: Lead[]): Lead[] {
  return [...leads].sort((a, b) => {
    const diff = getLeadDisplayPriority(b) - getLeadDisplayPriority(a);
    if (diff !== 0) return diff;
    return a.companyName.localeCompare(b.companyName, 'ja');
  });
}
