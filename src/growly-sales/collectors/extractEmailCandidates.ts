import {
  extractMailtoEmails,
  extractNormalizedEmailStrings,
  uniqueStrings,
} from './htmlUtils.js';
import {
  classifyEmailCandidate,
  type ClassifiedEmailCandidate,
  type EmailExtractionSource,
} from './classifyEmailCandidate.js';

export interface PageEmailExtraction {
  pageUrl: string;
  candidates: ClassifiedEmailCandidate[];
}

function classifyRawEmails(
  emails: string[],
  pageUrl: string,
  source: EmailExtractionSource
): ClassifiedEmailCandidate[] {
  return emails.map((email) => classifyEmailCandidate(email, pageUrl, source));
}

export function extractEmailCandidatesFromHtml(html: string, pageUrl: string): ClassifiedEmailCandidate[] {
  const mailtoEmails = extractMailtoEmails(html);
  const normalizedEmails = extractNormalizedEmailStrings(html);

  const mailtoSet = new Set(mailtoEmails.map((e) => e.toLowerCase()));
  const visibleOnly = normalizedEmails.filter((e) => !mailtoSet.has(e.toLowerCase()));

  const mailtoCandidates = classifyRawEmails(mailtoEmails, pageUrl, 'mailto');
  const visibleCandidates = classifyRawEmails(visibleOnly, pageUrl, 'visible');

  const atNotationCandidates: ClassifiedEmailCandidate[] = [];
  for (const raw of normalizedEmails) {
    if (raw.includes('[at]') || raw.includes('＠')) {
      atNotationCandidates.push(
        classifyEmailCandidate(
          raw,
          pageUrl,
          raw.includes('＠') ? 'fullwidth_at' : 'at_notation'
        )
      );
    }
  }

  const merged = [...mailtoCandidates, ...visibleCandidates, ...atNotationCandidates];
  const seen = new Map<string, ClassifiedEmailCandidate>();

  for (const candidate of merged) {
    const key = candidate.email;
    const existing = seen.get(key);
    if (!existing || (existing.rejected && !candidate.rejected)) {
      seen.set(key, candidate);
    } else if (!existing.rejected && !candidate.rejected) {
      const rank = { high: 3, medium: 2, low: 1 };
      if (rank[candidate.confidence] > rank[existing.confidence]) {
        seen.set(key, candidate);
      }
    }
  }

  return Array.from(seen.values());
}

export function mergePageEmailExtractions(pages: PageEmailExtraction[]): {
  allowedEmails: string[];
  emailCandidateSourceUrls: string[];
  classified: ClassifiedEmailCandidate[];
  rejectedEmails: string[];
} {
  const classified: ClassifiedEmailCandidate[] = [];
  const seenEmail = new Set<string>();

  for (const page of pages) {
    for (const candidate of page.candidates) {
      if (seenEmail.has(candidate.email)) continue;
      seenEmail.add(candidate.email);
      classified.push(candidate);
    }
  }

  const allowed = classified.filter((c) => !c.rejected).map((c) => c.email);
  const rejectedEmails = uniqueStrings(
    classified.filter((c) => c.rejected).map((c) => c.email)
  );
  const emailCandidateSourceUrls = uniqueStrings(
    classified.filter((c) => !c.rejected).map((c) => c.sourceUrl)
  );

  return {
    allowedEmails: allowed,
    emailCandidateSourceUrls,
    classified,
    rejectedEmails,
  };
}
