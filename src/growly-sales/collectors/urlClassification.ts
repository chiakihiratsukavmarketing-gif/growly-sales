/**
 * URL classification helpers for collectors and verify.
 */

export const SOCIAL_MEDIA_HOSTS = [
  'facebook.com',
  'instagram.com',
  'twitter.com',
  'x.com',
  'youtube.com',
  'line.me',
  'tiktok.com',
  'linkedin.com',
  'pinterest.com',
] as const;

export const INVALID_CONTACT_PATH_PATTERNS = [
  /\/reform(?:\/|$)/i,
  /\/works(?:\/|$)/i,
  /\/work(?:\/|$)/i,
  /\/case(?:s)?(?:\/|$)/i,
  /\/about(?:\/|$)/i,
  /\/company(?:\/|$)/i,
  /\/news(?:\/|$)/i,
  /\/blog(?:\/|$)/i,
  /\/event(?:s)?(?:\/|$)/i,
  /\/modelhouse(?:\/|$)/i,
  /\/gallery(?:\/|$)/i,
  /\/portfolio(?:\/|$)/i,
] as const;

export const STRONG_CONTACT_PATH_PATTERNS = [
  /\/contact(?:\/|$)/i,
  /\/inquiry(?:\/|$)/i,
  /\/inquiries(?:\/|$)/i,
  /\/request(?:\/|$)/i,
  /\/reserve(?:\/|$)/i,
  /\/reservation(?:\/|$)/i,
  /\/consultation(?:\/|$)/i,
  /\/toiawase(?:\/|$)/i,
  /\/otoiawase(?:\/|$)/i,
  /\/form(?:\/|$)/i,
  /\/yoyaku(?:\/|$)/i,
  /\/moushikomi(?:\/|$)/i,
] as const;

export function getHostname(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

export function isSocialMediaUrl(url: string): boolean {
  const host = getHostname(url);
  if (!host) return false;
  return SOCIAL_MEDIA_HOSTS.some((social) => host === social || host.endsWith(`.${social}`));
}

export function isSameSiteUrl(url: string, baseUrl: string): boolean {
  const urlHost = getHostname(url);
  const baseHost = getHostname(baseUrl);
  if (!urlHost || !baseHost) return false;
  return urlHost === baseHost || urlHost.endsWith(`.${baseHost}`) || baseHost.endsWith(`.${urlHost}`);
}

export function hasStrongContactPath(url: string): boolean {
  try {
    const path = new URL(url).pathname;
    return STRONG_CONTACT_PATH_PATTERNS.some((pattern) => pattern.test(path));
  } catch {
    return false;
  }
}

export function hasExcludedContactPath(url: string): boolean {
  try {
    const path = new URL(url).pathname;
    return INVALID_CONTACT_PATH_PATTERNS.some((pattern) => pattern.test(path));
  } catch {
    return false;
  }
}

export function isInvalidContactFormUrl(url: string | null): boolean {
  if (!url) return false;
  if (isSocialMediaUrl(url)) return true;
  if (!hasStrongContactPath(url)) return true;
  if (hasExcludedContactPath(url) && !hasStrongContactPath(url)) return true;
  return false;
}

export function isInvalidCompanyProfileUrl(url: string | null): boolean {
  if (!url) return false;
  return isSocialMediaUrl(url);
}

export function isValidCompanyProfileUrl(url: string | null, baseUrl?: string): boolean {
  if (!url) return true;
  if (isSocialMediaUrl(url)) return false;
  if (baseUrl && !isSameSiteUrl(url, baseUrl)) return false;
  return true;
}
