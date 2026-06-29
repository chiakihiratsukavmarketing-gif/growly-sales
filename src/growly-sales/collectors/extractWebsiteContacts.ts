import { findBestContactFormUrl } from './findContactFormLinks.js';
import { findBestInstagramUrl } from './findSocialLinks.js';
import { findBestRecruitUrl } from './findRecruitLinks.js';
import { findBestCaseStudyUrl } from './findCaseStudyLinks.js';
import { findBestCompanyProfileUrl } from './findCompanyProfileLinks.js';
import {
  findAdditionalContactPageUrls,
  MAX_ADDITIONAL_CONTACT_PAGES,
} from './findAdditionalContactPages.js';
import {
  extractEmailCandidatesFromHtml,
  mergePageEmailExtractions,
  type PageEmailExtraction,
} from './extractEmailCandidates.js';
import {
  pickLeadEmailConfidence,
  pickLeadEmailContactType,
} from './classifyEmailCandidate.js';
import { fetchWebsiteHtml, normalizeUrl, uniqueNormalizedUrls } from './htmlUtils.js';
import { extractSuspiciousEmails, uniqueStrings } from './htmlUtils.js';
import type { ContactPathConfidence, ContactPathType, EmailContactType } from '../analytics/contactPathTypes.js';
import { inferContactPathTypeFromFields } from '../analytics/contactPathTypes.js';

export interface WebsiteContactExtraction {
  websiteUrl: string;
  sourceUrls: string[];
  emailCandidates: string[];
  emailCandidateSourceUrls: string[];
  emailCandidateConfidence: ContactPathConfidence;
  emailContactType: EmailContactType;
  contactPathType: ContactPathType;
  contactPathConfidence: ContactPathConfidence;
  additionalPagesFetched: string[];
  rejectedEmails: string[];
  suspiciousEmails: string[];
  emailNeedsReview: boolean;
  contactFormUrl: string | null;
  instagramUrl: string | null;
  recruitUrl: string | null;
  caseStudyUrl: string | null;
  companyProfileUrl: string | null;
  collectionStatus: 'collected' | 'failed' | 'needs_review';
  error?: string;
}

function emptyResult(overrides: Partial<WebsiteContactExtraction>): WebsiteContactExtraction {
  return {
    websiteUrl: '',
    sourceUrls: [],
    emailCandidates: [],
    emailCandidateSourceUrls: [],
    emailCandidateConfidence: 'low',
    emailContactType: 'unknown',
    contactPathType: 'none',
    contactPathConfidence: 'low',
    additionalPagesFetched: [],
    rejectedEmails: [],
    suspiciousEmails: [],
    emailNeedsReview: false,
    contactFormUrl: null,
    instagramUrl: null,
    recruitUrl: null,
    caseStudyUrl: null,
    companyProfileUrl: null,
    collectionStatus: 'failed',
    ...overrides,
  };
}

function computeContactPathConfidence(input: {
  contactPathType: ContactPathType;
  emailConfidence: ContactPathConfidence;
  hasContactForm: boolean;
  additionalPagesFetched: string[];
}): ContactPathConfidence {
  if (input.contactPathType === 'none') return 'low';
  if (input.contactPathType === 'both' && input.emailConfidence === 'high') return 'high';
  if (input.contactPathType === 'email' && input.emailConfidence === 'high') return 'high';
  if (input.hasContactForm && input.additionalPagesFetched.length > 0) return 'medium';
  if (input.hasContactForm) return 'medium';
  return input.emailConfidence;
}

function pageAlreadyFetched(
  url: string,
  normalizedFinal: string,
  additionalPagesFetched: string[]
): boolean {
  const normalized = normalizeUrl(url);
  return (
    normalized === normalizedFinal ||
    additionalPagesFetched.some((u) => normalizeUrl(u) === normalized)
  );
}

async function appendFetchedPageExtraction(
  pageUrl: string,
  normalizedFinal: string,
  additionalPagesFetched: string[],
  pageExtractions: PageEmailExtraction[]
): Promise<void> {
  if (pageAlreadyFetched(pageUrl, normalizedFinal, additionalPagesFetched)) return;
  try {
    const { html, finalUrl: pageFinalUrl } = await fetchWebsiteHtml(pageUrl);
    const normalizedPage = normalizeUrl(pageFinalUrl);
    additionalPagesFetched.push(normalizedPage);
    pageExtractions.push({
      pageUrl: normalizedPage,
      candidates: extractEmailCandidatesFromHtml(html, normalizedPage),
    });
  } catch {
    // ページ取得失敗はスキップ
  }
}

export async function extractWebsiteContacts(websiteUrl: string): Promise<WebsiteContactExtraction> {
  const trimmedUrl = websiteUrl.trim();

  if (!trimmedUrl) {
    return emptyResult({ error: 'Empty website URL', sourceUrls: [] });
  }

  try {
    const parsed = new URL(trimmedUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('Only http/https URLs are allowed');
    }

    const { html: homeHtml, finalUrl } = await fetchWebsiteHtml(trimmedUrl);
    const normalizedInput = normalizeUrl(trimmedUrl);
    const normalizedFinal = normalizeUrl(finalUrl);

    const additionalPageUrls = findAdditionalContactPageUrls(homeHtml, finalUrl);
    const additionalPagesFetched: string[] = [];

    const pageExtractions: PageEmailExtraction[] = [
      {
        pageUrl: normalizedFinal,
        candidates: extractEmailCandidatesFromHtml(homeHtml, normalizedFinal),
      },
    ];

    for (const pageUrl of additionalPageUrls.slice(0, MAX_ADDITIONAL_CONTACT_PAGES)) {
      try {
        const { html: pageHtml, finalUrl: pageFinalUrl } = await fetchWebsiteHtml(pageUrl);
        const normalizedPage = normalizeUrl(pageFinalUrl);
        additionalPagesFetched.push(normalizedPage);
        pageExtractions.push({
          pageUrl: normalizedPage,
          candidates: extractEmailCandidatesFromHtml(pageHtml, normalizedPage),
        });
      } catch {
        // 追加ページ取得失敗はスキップ（トップページ結果は維持）
      }
    }

    const companyProfileUrl = findBestCompanyProfileUrl(homeHtml, finalUrl);
    if (companyProfileUrl) {
      await appendFetchedPageExtraction(
        companyProfileUrl,
        normalizedFinal,
        additionalPagesFetched,
        pageExtractions
      );
    }

    const recruitUrl = findBestRecruitUrl(homeHtml, finalUrl);
    if (recruitUrl) {
      await appendFetchedPageExtraction(
        recruitUrl,
        normalizedFinal,
        additionalPagesFetched,
        pageExtractions
      );
    }

    const contactFormUrl = findBestContactFormUrl(homeHtml, finalUrl);
    if (contactFormUrl) {
      await appendFetchedPageExtraction(
        contactFormUrl,
        normalizedFinal,
        additionalPagesFetched,
        pageExtractions
      );
    }

    const emailMerge = mergePageEmailExtractions(pageExtractions);
    const emailCandidateConfidence = pickLeadEmailConfidence(emailMerge.classified);
    const emailContactType = pickLeadEmailContactType(emailMerge.classified);

    const instagramUrl = findBestInstagramUrl(homeHtml, finalUrl);
    const caseStudyUrl = findBestCaseStudyUrl(homeHtml, finalUrl);

    const sourceUrls = uniqueNormalizedUrls([
      normalizedInput,
      normalizedFinal,
      ...additionalPagesFetched,
      ...emailMerge.emailCandidateSourceUrls,
      contactFormUrl,
      instagramUrl,
      recruitUrl,
      caseStudyUrl,
      companyProfileUrl,
    ]);

    const suspiciousRaw = extractSuspiciousEmails(homeHtml);
    const suspiciousEmails = uniqueStrings(suspiciousRaw);

    const trustedEmailSources = new Set(
      emailMerge.classified
        .filter(
          (c) =>
            !c.rejected &&
            (c.source === 'mailto' || c.source === 'visible' || c.source === 'fullwidth_at')
        )
        .map((c) => c.email.toLowerCase())
    );
    const suspiciousAllowed = suspiciousEmails.filter(
      (e) => emailMerge.allowedEmails.includes(e) && !trustedEmailSources.has(e.toLowerCase())
    );
    const emailNeedsReview = suspiciousAllowed.length > 0;

    const contactPathType = inferContactPathTypeFromFields(
      emailMerge.allowedEmails,
      contactFormUrl
    );

    const contactPathConfidence = computeContactPathConfidence({
      contactPathType,
      emailConfidence: emailCandidateConfidence,
      hasContactForm: Boolean(contactFormUrl),
      additionalPagesFetched,
    });

    let collectionStatus: WebsiteContactExtraction['collectionStatus'] = 'collected';
    if (emailNeedsReview) {
      collectionStatus = 'needs_review';
    }

    return {
      websiteUrl: normalizedInput,
      sourceUrls,
      emailCandidates: emailMerge.allowedEmails,
      emailCandidateSourceUrls: emailMerge.emailCandidateSourceUrls,
      emailCandidateConfidence,
      emailContactType,
      contactPathType,
      contactPathConfidence,
      additionalPagesFetched,
      rejectedEmails: uniqueStrings([
        ...emailMerge.rejectedEmails,
        ...(emailNeedsReview ? suspiciousAllowed : []),
      ]),
      suspiciousEmails: suspiciousAllowed,
      emailNeedsReview,
      contactFormUrl,
      instagramUrl,
      recruitUrl,
      caseStudyUrl,
      companyProfileUrl,
      collectionStatus,
    };
  } catch (err) {
    return emptyResult({
      websiteUrl: trimmedUrl,
      sourceUrls: trimmedUrl ? [normalizeUrl(trimmedUrl)] : [],
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export { MAX_ADDITIONAL_CONTACT_PAGES };
