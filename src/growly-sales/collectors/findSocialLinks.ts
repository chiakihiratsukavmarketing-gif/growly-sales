import {
  extractLinks,
  matchesKeywords,
  normalizeInstagramUrl,
  normalizeUrl,
  pickBestMatch,
  uniqueNormalizedUrls,
} from './htmlUtils.js';

const NON_PROFILE_INSTAGRAM_PATHS = /^\/(p|reel|reels|stories|tv|explore|accounts|direct|about)\b/i;

export function findSocialLinks(html: string, baseUrl: string): {
  instagramUrls: string[];
  allSocialUrls: string[];
} {
  const links = extractLinks(html, baseUrl);
  const instagramUrls: string[] = [];
  const allSocialUrls: string[] = [];

  for (const link of links) {
    const normalizedIg = normalizeInstagramUrl(link.resolvedUrl);
    if (normalizedIg) {
      instagramUrls.push(normalizedIg);
      allSocialUrls.push(normalizedIg);
      continue;
    }

    try {
      const parsed = new URL(link.resolvedUrl);
      const host = parsed.hostname.toLowerCase().replace(/^www\./, '');

      if (['twitter.com', 'x.com', 'facebook.com', 'youtube.com', 'tiktok.com', 'line.me'].includes(host)) {
        allSocialUrls.push(normalizeUrl(link.resolvedUrl));
      }
    } catch {
      // skip invalid URLs
    }
  }

  const instagramFromText =
    html.match(/https?:\/\/(?:www\.)?instagram\.com\/[a-zA-Z0-9._]+/gi) ?? [];
  for (const raw of instagramFromText) {
    const normalized = normalizeInstagramUrl(raw);
    if (normalized) instagramUrls.push(normalized);
  }

  return {
    instagramUrls: uniqueNormalizedUrls(instagramUrls),
    allSocialUrls: uniqueNormalizedUrls(allSocialUrls),
  };
}

export function findBestInstagramUrl(html: string, baseUrl: string): string | null {
  const { instagramUrls } = findSocialLinks(html, baseUrl);
  const profiles = instagramUrls.filter((url) => {
    try {
      const path = new URL(url).pathname;
      return !NON_PROFILE_INSTAGRAM_PATHS.test(path);
    } catch {
      return false;
    }
  });
  return pickBestMatch(profiles);
}
