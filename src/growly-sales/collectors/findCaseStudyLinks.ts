import { extractLinks, matchesKeywords, pickBestMatch, uniqueNormalizedUrls } from './htmlUtils.js';

const CASE_STUDY_KEYWORDS = [
  '施工事例',
  '建築実例',
  '建築事例',
  '事例紹介',
  'お客様の声',
  '事例',
  '実績',
  'works',
  'portfolio',
  'gallery',
  'ギャラリー',
  '建築実績',
  'リフォーム事例',
  '施工実績',
  'case',
  'project',
  'voice',
  'お客様',
];

const CASE_STUDY_PATH_KEYWORDS = [
  '/works',
  '/work',
  '/case',
  '/cases',
  '/portfolio',
  '/gallery',
  '/jirei',
  '/sekou',
  '/voice',
  '/example',
  '/results',
];

export function findCaseStudyLinks(html: string, baseUrl: string): string[] {
  const links = extractLinks(html, baseUrl);
  const matches: string[] = [];

  for (const link of links) {
    const combined = `${link.href} ${link.text} ${link.resolvedUrl}`;
    if (
      matchesKeywords(combined, CASE_STUDY_KEYWORDS) ||
      matchesKeywords(link.resolvedUrl, CASE_STUDY_PATH_KEYWORDS)
    ) {
      matches.push(link.resolvedUrl);
    }
  }

  return uniqueNormalizedUrls(matches);
}

export function findBestCaseStudyUrl(html: string, baseUrl: string): string | null {
  return pickBestMatch(findCaseStudyLinks(html, baseUrl));
}
