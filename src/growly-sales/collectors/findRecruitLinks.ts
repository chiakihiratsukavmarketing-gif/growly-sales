import { extractLinks, matchesKeywords, pickBestMatch, uniqueNormalizedUrls } from './htmlUtils.js';

const RECRUIT_KEYWORDS = [
  'recruit',
  'recruitment',
  'career',
  'careers',
  'jobs',
  '採用',
  '採用情報',
  '求人',
  'リクルート',
  'entry',
  '新卒',
];

const RECRUIT_PATH_KEYWORDS = [
  '/recruit',
  '/recruitment',
  '/career',
  '/careers',
  '/jobs',
  '/saiyo',
  '/recruit-info',
];

export function findRecruitLinks(html: string, baseUrl: string): string[] {
  const links = extractLinks(html, baseUrl);
  const matches: string[] = [];

  for (const link of links) {
    const combined = `${link.href} ${link.text} ${link.resolvedUrl}`;
    if (
      matchesKeywords(combined, RECRUIT_KEYWORDS) ||
      matchesKeywords(link.resolvedUrl, RECRUIT_PATH_KEYWORDS)
    ) {
      matches.push(link.resolvedUrl);
    }
  }

  return uniqueNormalizedUrls(matches);
}

export function findBestRecruitUrl(html: string, baseUrl: string): string | null {
  return pickBestMatch(findRecruitLinks(html, baseUrl));
}
