import type { Lead } from '../types/lead.js';
import type { ExternalLeadCandidate } from './externalLeadCandidateTypes.js';
import { leadDedupeKey } from '../workflow/dedupeLeads.js';
import { normalizeWebsiteUrl } from './externalCandidateUrlUtils.js';

function normalizeCompanyKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '');
}

function websiteKey(url: string | null): string {
  const normalized = normalizeWebsiteUrl(url);
  if (!normalized) return '';
  try {
    const parsed = new URL(normalized);
    return parsed.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

export function externalCandidateDedupeKey(candidate: ExternalLeadCandidate): string {
  const web = websiteKey(candidate.websiteUrl) || websiteKey(candidate.officialSiteUrl);
  if (web) return `web:${web}`;
  return `name:${normalizeCompanyKey(candidate.companyName)}|area:${candidate.area.trim().toLowerCase()}`;
}

export function leadMatchesCandidate(lead: Lead, candidate: ExternalLeadCandidate): boolean {
  if (candidate.websiteUrl && lead.websiteUrl) {
    return websiteKey(lead.websiteUrl) === websiteKey(candidate.websiteUrl);
  }
  return normalizeCompanyKey(lead.companyName) === normalizeCompanyKey(candidate.companyName);
}

export function findDuplicateReason(
  candidate: ExternalLeadCandidate,
  existingLeads: Lead[],
  existingCandidates: ExternalLeadCandidate[]
): string | null {
  for (const lead of existingLeads) {
    if (lead.doNotContact) {
      if (leadMatchesCandidate(lead, candidate)) {
        return `既存LeadがdoNotContact=true: ${lead.companyName}`;
      }
    }
    if (leadMatchesCandidate(lead, candidate)) {
      return `既存Leadと重複: ${lead.companyName}`;
    }
  }

  const key = externalCandidateDedupeKey(candidate);
  for (const other of existingCandidates) {
    if (other.externalCandidateId === candidate.externalCandidateId) continue;
    if (externalCandidateDedupeKey(other) === key) {
      return `外部候補と重複: ${other.companyName}`;
    }
  }

  return null;
}

export function applyDuplicateStatus(
  candidates: ExternalLeadCandidate[],
  existingLeads: Lead[],
  existingCandidates: ExternalLeadCandidate[] = []
): ExternalLeadCandidate[] {
  const mergedExisting = [...existingCandidates];
  const result: ExternalLeadCandidate[] = [];

  for (const candidate of candidates) {
    const reason = findDuplicateReason(candidate, existingLeads, [...mergedExisting, ...result]);
    if (reason) {
      result.push({
        ...candidate,
        importStatus: 'duplicate',
        duplicateReason: reason,
        updatedAt: new Date().toISOString(),
      });
    } else {
      result.push(candidate);
    }
  }

  return result;
}

export function dedupeExternalCandidates(candidates: ExternalLeadCandidate[]): ExternalLeadCandidate[] {
  const seen = new Map<string, ExternalLeadCandidate>();
  for (const candidate of candidates) {
    const key = externalCandidateDedupeKey(candidate);
    if (!seen.has(key)) {
      seen.set(key, candidate);
    }
  }
  return Array.from(seen.values());
}
