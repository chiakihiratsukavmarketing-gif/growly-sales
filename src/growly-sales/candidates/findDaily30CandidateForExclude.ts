import type { ExternalLeadCandidate } from '../adapters/externalLeadCandidateTypes.js';
import { isDaily30HumanExcludedCandidate } from './daily30CandidateVisibility.js';

export interface ExcludeCandidateLookupHints {
  companyName?: string;
  email?: string;
  officialSiteUrl?: string;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function domainKey(url: string | null | undefined): string {
  if (!url?.trim()) return '';
  try {
    const parsed = new URL(url.trim());
    if (!['http:', 'https:'].includes(parsed.protocol)) return '';
    return parsed.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

function normalizeCompanyKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '');
}

/** 除外対象候補を ID 優先・単一一致時のみ company/email/site でフォールバック */
export function findDaily30CandidateIndexForExclude(
  candidates: ExternalLeadCandidate[],
  externalCandidateId: string,
  hints?: ExcludeCandidateLookupHints
): number {
  const byId = candidates.findIndex((c) => c.externalCandidateId === externalCandidateId);
  if (byId >= 0) return byId;

  const rawName = hints?.companyName?.trim();
  if (!rawName) return -1;

  const nameKey = normalizeCompanyKey(rawName);
  const email = hints?.email?.trim() ? normalizeEmail(hints.email) : '';
  const siteKey = domainKey(hints?.officialSiteUrl);

  const matches = candidates.filter((c) => {
    if (c.importStatus === 'imported' || isDaily30HumanExcludedCandidate(c)) return false;

    const cNameKey = normalizeCompanyKey(c.companyName);
    const nameMatch = cNameKey === nameKey || c.companyName.trim() === rawName;
    if (!nameMatch) return false;

    if (email) {
      const emails = new Set(
        [...(c.emailCandidates ?? []), c.targetEmail]
          .filter(Boolean)
          .map((e) => normalizeEmail(e!))
      );
      if (!emails.has(email)) return false;
    }

    if (siteKey) {
      const cSite = domainKey(c.officialSiteUrl) || domainKey(c.websiteUrl);
      if (!cSite || cSite !== siteKey) return false;
    }

    return true;
  });

  if (matches.length !== 1) return -1;
  return candidates.indexOf(matches[0]!);
}

export function pickCandidateExcludeHints(
  candidate: ExternalLeadCandidate
): ExcludeCandidateLookupHints {
  const email = candidate.emailCandidates?.[0] ?? candidate.targetEmail ?? undefined;
  return {
    companyName: candidate.companyName,
    email: email ?? undefined,
    officialSiteUrl: candidate.officialSiteUrl ?? candidate.websiteUrl ?? undefined,
  };
}
