import type { Lead } from '../types/lead.js';
import type { WebsiteContactExtraction } from '../collectors/extractWebsiteContacts.js';
import { uniqueNormalizedUrls } from '../collectors/htmlUtils.js';

/**
 * day1 再実行時、既存 Lead の連絡導線フィールドのみ更新する。
 * humanReviewStatus / sendStatus / 営業文 / Gmail下書き等は保持する。
 */
export function refreshLeadContactFields(
  existing: Lead,
  extraction: WebsiteContactExtraction
): Lead {
  const mergedSourceUrls = uniqueNormalizedUrls([
    ...existing.sourceUrls,
    ...extraction.sourceUrls,
  ]);

  return {
    ...existing,
    instagramUrl: extraction.instagramUrl ?? existing.instagramUrl,
    emailCandidates: extraction.emailCandidates,
    emailCandidateSourceUrls: extraction.emailCandidateSourceUrls,
    emailCandidateConfidence: extraction.emailCandidateConfidence,
    emailContactType: extraction.emailContactType,
    contactPathType: extraction.contactPathType,
    contactPathConfidence: extraction.contactPathConfidence,
    contactFormUrl: extraction.contactFormUrl ?? existing.contactFormUrl,
    recruitUrl: extraction.recruitUrl ?? existing.recruitUrl,
    caseStudyUrl: extraction.caseStudyUrl ?? existing.caseStudyUrl,
    companyProfileUrl: extraction.companyProfileUrl ?? existing.companyProfileUrl,
    sourceUrls: mergedSourceUrls,
    collectionStatus:
      extraction.collectionStatus === 'needs_review'
        ? 'needs_review'
        : extraction.collectionStatus === 'failed'
          ? existing.collectionStatus === 'collected'
            ? existing.collectionStatus
            : 'failed'
          : extraction.collectionStatus,
    updatedAt: new Date().toISOString(),
  };
}

export function websiteHostKey(url: string): string {
  try {
    const parsed = new URL(url.trim());
    return parsed.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

export function findLeadByWebsiteHost(leads: Lead[], websiteUrl: string): Lead | undefined {
  const key = websiteHostKey(websiteUrl);
  return leads.find((lead) => websiteHostKey(lead.websiteUrl) === key);
}
