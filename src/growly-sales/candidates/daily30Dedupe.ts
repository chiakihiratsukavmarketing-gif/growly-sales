import type { Lead } from '../types/lead.js';
import type { ExternalLeadCandidate } from '../adapters/externalLeadCandidateTypes.js';
import { leadMatchesCandidate } from '../adapters/dedupeExternalCandidates.js';
import { normalizeWebsiteUrl } from '../adapters/normalizeExternalLeadCandidate.js';

function normalizeCompanyKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '');
}

function websiteHostname(url: string | null | undefined): string {
  const normalized = normalizeWebsiteUrl(url);
  if (!normalized) return '';
  try {
    return new URL(normalized).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

export function normalizePhoneNumber(phone: string | null | undefined): string {
  if (!phone?.trim()) return '';
  return phone.replace(/\D/g, '');
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Phase 23: 会社名 / ドメイン / メール / 電話のいずれか一致で重複 */
export function findDaily30DuplicateReason(
  candidate: ExternalLeadCandidate,
  existingLeads: Lead[],
  existingCandidates: ExternalLeadCandidate[]
): string | null {
  for (const lead of existingLeads) {
    if (leadMatchesCandidate(lead, candidate)) {
      return `既存Leadと重複（会社名/ドメイン）: ${lead.companyName}`;
    }
    const leadDomain = websiteHostname(lead.websiteUrl);
    const candDomain =
      websiteHostname(candidate.websiteUrl) || websiteHostname(candidate.officialSiteUrl);
    if (leadDomain && candDomain && leadDomain === candDomain) {
      return `既存Leadとドメイン重複: ${lead.companyName}`;
    }
    if (
      normalizeCompanyKey(lead.companyName) === normalizeCompanyKey(candidate.companyName)
    ) {
      return `既存Leadと会社名重複: ${lead.companyName}`;
    }
    for (const email of candidate.emailCandidates ?? []) {
      if (lead.emailCandidates.some((e) => normalizeEmail(e) === normalizeEmail(email))) {
        return `既存Leadとメール重複: ${lead.companyName}`;
      }
    }
    const candPhone = normalizePhoneNumber(candidate.phoneNumber);
    if (candPhone && lead.communicationMemo?.includes(candPhone)) {
      // phone not on Lead type — skip memo heuristic
    }
  }

  const candDomain =
    websiteHostname(candidate.websiteUrl) || websiteHostname(candidate.officialSiteUrl);
  const candPhone = normalizePhoneNumber(candidate.phoneNumber);
  const candEmails = (candidate.emailCandidates ?? []).map(normalizeEmail).filter(Boolean);
  const candName = normalizeCompanyKey(candidate.companyName);

  for (const other of existingCandidates) {
    if (other.externalCandidateId === candidate.externalCandidateId) continue;
    const otherDomain =
      websiteHostname(other.websiteUrl) || websiteHostname(other.officialSiteUrl);
    if (candDomain && otherDomain && candDomain === otherDomain) {
      return `外部候補とドメイン重複: ${other.companyName}`;
    }
    if (candName && candName === normalizeCompanyKey(other.companyName)) {
      return `外部候補と会社名重複: ${other.companyName}`;
    }
    for (const email of candEmails) {
      if ((other.emailCandidates ?? []).some((e) => normalizeEmail(e) === email)) {
        return `外部候補とメール重複: ${other.companyName}`;
      }
    }
    const otherPhone = normalizePhoneNumber(other.phoneNumber);
    if (candPhone && otherPhone && candPhone === otherPhone) {
      return `外部候補と電話番号重複: ${other.companyName}`;
    }
  }

  return null;
}

export function applyDaily30DuplicateStatus(
  candidates: ExternalLeadCandidate[],
  existingLeads: Lead[],
  existingCandidates: ExternalLeadCandidate[] = []
): ExternalLeadCandidate[] {
  const merged: ExternalLeadCandidate[] = [];
  const pool = [...existingCandidates];

  for (const candidate of candidates) {
    const reason = findDaily30DuplicateReason(candidate, existingLeads, [...pool, ...merged]);
    if (reason) {
      merged.push({
        ...candidate,
        importStatus: 'duplicate',
        pipelineStatus: 'duplicate',
        duplicateReason: reason,
        updatedAt: new Date().toISOString(),
      });
    } else {
      merged.push(candidate);
      pool.push(candidate);
    }
  }
  return merged;
}
