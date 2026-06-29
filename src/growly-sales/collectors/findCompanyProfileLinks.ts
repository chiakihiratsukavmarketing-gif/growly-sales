import { extractLinks, matchesKeywords, uniqueNormalizedUrls, type ExtractedLink } from './htmlUtils.js';
import { isSameSiteUrl, isSocialMediaUrl } from './urlClassification.js';
import { isSameSiteUrl, isSocialMediaUrl } from './urlClassification.js';

const PROFILE_TEXT_KEYWORDS = [
  '会社概要',
  '会社案内',
  '企業情報',
  '私たちについて',
  '会社情報',
  'コンセプト',
  'about us',
  'corporate',
];

const PROFILE_PATH_KEYWORDS = [
  '/about',
  '/company',
  '/profile',
  '/corporate',
  '/overview',
  '/concept',
  '/gaiyou',
  '/kaisha',
  '/about-us',
];

const MIN_PROFILE_SCORE = 4;

function scoreProfileLink(link: ExtractedLink, baseUrl: string): number {
  if (isSocialMediaUrl(link.resolvedUrl)) return -1;
  if (!isSameSiteUrl(link.resolvedUrl, baseUrl)) return -1;

  const path = (() => {
    try {
      return new URL(link.resolvedUrl).pathname.toLowerCase();
    } catch {
      return '';
    }
  })();

  let score = 0;

  if (path.includes('/about')) score += 12;
  if (path.includes('/company')) score += 11;
  if (path.includes('/concept')) score += 10;
  if (path.includes('/corporate')) score += 10;
  if (path.includes('/overview')) score += 9;
  if (path.includes('/profile') && !path.includes('profile.php')) score += 8;
  if (path.includes('/gaiyou') || path.includes('/kaisha')) score += 9;

  if (matchesKeywords(link.text, PROFILE_TEXT_KEYWORDS)) {
    score += 6;
  }

  const pathMatch = PROFILE_PATH_KEYWORDS.some((kw) => path.includes(kw));
  if (!pathMatch && score < MIN_PROFILE_SCORE) {
    return -1;
  }

  return score;
}

export function findCompanyProfileLinks(html: string, baseUrl: string): string[] {
  const links = extractLinks(html, baseUrl);
  const scored: Array<{ url: string; score: number }> = [];

  for (const link of links) {
    const score = scoreProfileLink(link, baseUrl);
    if (score >= MIN_PROFILE_SCORE) {
      scored.push({ url: link.resolvedUrl, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return uniqueNormalizedUrls(scored.map((s) => s.url));
}

export function findBestCompanyProfileUrl(html: string, baseUrl: string): string | null {
  const links = extractLinks(html, baseUrl);
  let best: { url: string; score: number } | null = null;

  for (const link of links) {
    const score = scoreProfileLink(link, baseUrl);
    if (score >= MIN_PROFILE_SCORE && (!best || score > best.score)) {
      best = { url: link.resolvedUrl, score };
    }
  }

  return best?.url ?? null;
}
