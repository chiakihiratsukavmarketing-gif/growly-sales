import type { Lead, LeadScore } from '../types/lead.js';
import type { TargetProfile } from '../config/targetProfile.js';
import { isTargetIndustry, matchesTargetArea } from '../config/targetProfile.js';
import { isHousingIndustry } from '../safety/contactPolicy.js';
import { extractLeadSignals, isOutreachEligible } from '../generation/generationUtils.js';

export function scoreLead(lead: Lead, targetProfile?: TargetProfile): LeadScore {
  if (lead.doNotContact) {
    return 'C';
  }

  if (lead.riskLevel === 'high' || lead.collectionStatus === 'needs_review') {
    return 'C';
  }

  const signals = extractLeadSignals(lead);
  const isTarget = targetProfile
    ? isTargetIndustry(lead.industry, targetProfile)
    : isHousingIndustry(lead.industry);
  const isRegional = targetProfile ? matchesTargetArea(lead.area, targetProfile) : true;

  if (!signals.hasWebsite) {
    return 'C';
  }

  if (!signals.hasContact && !signals.hasInstagram) {
    return 'C';
  }

  if (!isTarget && lead.industry.trim() !== '') {
    return 'C';
  }

  const aSignals =
    signals.hasInstagram &&
    signals.hasContact &&
    signals.hasCaseStudy &&
    signals.hasWebsite &&
    isTarget &&
    isRegional &&
    lead.riskLevel === 'low';

  if (aSignals) {
    return 'A';
  }

  const bSignals =
    signals.hasWebsite &&
    (signals.hasContact || signals.hasInstagram) &&
    (lead.riskLevel === 'low' || lead.riskLevel === 'medium');

  if (bSignals) {
    if (!signals.hasCaseStudy || !signals.hasInstagram || !signals.hasContact) {
      return 'B';
    }
  }

  if (!signals.hasContact || !signals.hasInstagram || !signals.hasCaseStudy) {
    return 'B';
  }

  return 'UNKNOWN';
}

export function isSalesTarget(lead: Lead): boolean {
  return isOutreachEligible(lead) && !lead.doNotContact;
}

export { DEFAULT_TARGET_PROFILE_ID } from '../config/targetProfile.js';
