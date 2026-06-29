const FETCH_TIMEOUT_MS = 10_000;
const USER_AGENT = 'GrowlySales/0.2 (contact research; +https://github.com/growly-sales)';

const SKIP_HREF_PREFIXES = ['javascript:', 'tel:', '#', 'data:'];

export function stripScriptsAndStyles(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
}

export function stripHiddenElements(html: string): string {
  return html
    .replace(/<[^>]*\bhidden\b[^>]*>[\s\S]*?<\/[^>]+>/gi, '')
    .replace(/<input[^>]*type=["']hidden["'][^>]*>/gi, '')
    .replace(/<[^>]*style=["'][^"']*display\s*:\s*none[^"']*["'][^>]*>[\s\S]*?<\/[^>]+>/gi, '');
}

export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url.trim());
    parsed.hash = '';
    parsed.hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');

    if (
      (parsed.protocol === 'https:' && parsed.port === '443') ||
      (parsed.protocol === 'http:' && parsed.port === '80')
    ) {
      parsed.port = '';
    }

    if (parsed.pathname !== '/' && parsed.pathname.endsWith('/')) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }

    return parsed.href;
  } catch {
    return url.trim();
  }
}

export function resolveUrl(href: string, baseUrl: string): string | null {
  try {
    const trimmed = href.trim();
    if (!trimmed) return null;

    const lower = trimmed.toLowerCase();
    if (SKIP_HREF_PREFIXES.some((prefix) => lower.startsWith(prefix))) {
      return null;
    }
    if (lower.startsWith('mailto:') || lower.startsWith('tel:')) {
      return null;
    }

    const resolved = new URL(trimmed, baseUrl).href;
    return normalizeUrl(resolved);
  } catch {
    return null;
  }
}

export interface ExtractedLink {
  href: string;
  text: string;
  resolvedUrl: string;
}

export function extractLinks(html: string, baseUrl: string): ExtractedLink[] {
  const links: ExtractedLink[] = [];
  const anchorRegex = /<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = anchorRegex.exec(html)) !== null) {
    const href = match[1];
    const text = match[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    const resolvedUrl = resolveUrl(href, baseUrl);
    if (resolvedUrl) {
      links.push({ href, text, resolvedUrl });
    }
  }

  return links;
}

function decodeMailtoAddress(raw: string): string {
  const withoutParams = raw.split('?')[0].split('#')[0];
  try {
    return decodeURIComponent(withoutParams).toLowerCase().trim();
  } catch {
    return withoutParams.toLowerCase().trim();
  }
}

export function extractMailtoEmails(html: string): string[] {
  const emails: string[] = [];
  const patterns = [
    /href=["']mailto:([^"'?#]+)/gi,
    /mailto:([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/gi,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(html)) !== null) {
      const decoded = decodeMailtoAddress(match[1]);
      if (decoded.includes('@')) {
        emails.push(decoded);
      }
    }
  }

  return emails;
}

export function extractVisibleEmails(html: string): string[] {
  const cleaned = stripHiddenElements(stripScriptsAndStyles(html));
  const normalized = normalizeEmailText(cleaned);
  const emails: string[] = [];
  const emailRegex = /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/gi;
  let match: RegExpExecArray | null;
  while ((match = emailRegex.exec(normalized)) !== null) {
    emails.push(match[0].toLowerCase());
  }
  return emails;
}

/** 全角＠・[at]・*（アスタリスク）表記を ASCII メールに正規化して抽出 */
export function normalizeEmailText(text: string): string {
  return text
    .replace(/＠/g, '@')
    .replace(/\[at\]/gi, '@')
    .replace(/\(at\)/gi, '@')
    .replace(/\s*@\s*/g, '@');
}

export function extractStarNotationEmails(html: string): string[] {
  const cleaned = stripHiddenElements(stripScriptsAndStyles(html));
  const emails: string[] = [];
  const pattern = /\b([a-z0-9._%+-]+)\*([a-z0-9.-]+\.[a-z]{2,})\b/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(cleaned)) !== null) {
    emails.push(`${match[1]}@${match[2]}`.toLowerCase());
  }
  return emails;
}

/** JSON-LD 等 structured data 内の email フィールドを抽出 */
export function extractStructuredDataEmails(html: string): string[] {
  const emails: string[] = [];
  const emailFieldPattern = /"email"\s*:\s*"([^"]+@[^"]+)"/gi;
  let match: RegExpExecArray | null;
  while ((match = emailFieldPattern.exec(html)) !== null) {
    const normalized = match[1].trim().toLowerCase();
    if (normalized.includes('@')) {
      emails.push(normalized);
    }
  }
  return emails;
}

export function extractAtNotationEmails(html: string): string[] {
  const cleaned = stripHiddenElements(stripScriptsAndStyles(html));
  const normalized = normalizeEmailText(cleaned);
  const emails: string[] = [];
  const patterns = [
    /\b([a-z0-9._%+-]+)\s*@\s*([a-z0-9.-]+\.[a-z]{2,})\b/gi,
    /\b([a-z0-9._%+-]+)\s*\[at\]\s*([a-z0-9.-]+\.[a-z]{2,})\b/gi,
    /\b([a-z0-9._%+-]+)\s*\(at\)\s*([a-z0-9.-]+\.[a-z]{2,})\b/gi,
  ];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(normalized)) !== null) {
      emails.push(`${match[1]}@${match[2]}`.toLowerCase());
    }
  }
  return emails;
}

export function extractNormalizedEmailStrings(html: string): string[] {
  const mailto = extractMailtoEmails(html);
  const visible = extractVisibleEmails(html);
  const atNotation = extractAtNotationEmails(html);
  const starNotation = extractStarNotationEmails(html);
  const structured = extractStructuredDataEmails(html);
  return uniqueStrings([...mailto, ...visible, ...atNotation, ...starNotation, ...structured]);
}

export function extractSuspiciousEmails(html: string): string[] {
  const emails: string[] = [];
  const emailRegex = /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/gi;

  const scriptBlocks = html.match(/<script[\s\S]*?<\/script>/gi) ?? [];
  for (const block of scriptBlocks) {
    let match: RegExpExecArray | null;
    while ((match = emailRegex.exec(block)) !== null) {
      emails.push(match[0].toLowerCase());
    }
  }

  const hiddenInputs = html.match(/<input[^>]*type=["']hidden["'][^>]*>/gi) ?? [];
  for (const input of hiddenInputs) {
    const valueMatch = input.match(/value=["']([^"']+)["']/i);
    if (valueMatch && valueMatch[1].includes('@')) {
      const found = valueMatch[1].match(emailRegex);
      if (found) emails.push(...found.map((e) => e.toLowerCase()));
    }
  }

  return emails;
}

export function normalizeInstagramUrl(url: string): string | null {
  try {
    const parsed = new URL(url.trim());
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    if (host !== 'instagram.com') return null;

    const path = parsed.pathname.replace(/\/$/, '') || '/';
    if (/^\/(p|reel|reels|stories|tv|explore|accounts|direct|about)\b/i.test(path)) {
      return null;
    }

    const profileMatch = path.match(/^\/([a-zA-Z0-9._]+)$/);
    if (!profileMatch) return null;

    return normalizeUrl(`https://www.instagram.com/${profileMatch[1]}/`);
  } catch {
    return null;
  }
}

export function isInstagramUrl(url: string | null): boolean {
  if (!url) return false;
  return normalizeInstagramUrl(url) !== null;
}

export async function fetchWebsiteHtml(url: string): Promise<{ html: string; finalUrl: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${url}`);
    }

    const html = await response.text();
    const finalUrl = normalizeUrl(response.url || url);
    return { html, finalUrl };
  } finally {
    clearTimeout(timeout);
  }
}

export function pickBestMatch(candidates: string[]): string | null {
  if (candidates.length === 0) return null;
  return candidates[0];
}

export function uniqueStrings(items: string[]): string[] {
  return [...new Set(items.map((s) => s.trim()).filter(Boolean))];
}

export function uniqueNormalizedUrls(urls: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const url of urls) {
    if (!url?.trim()) continue;
    try {
      const normalized = normalizeUrl(url);
      if (!seen.has(normalized)) {
        seen.add(normalized);
        result.push(normalized);
      }
    } catch {
      // skip invalid
    }
  }
  return result;
}

export function matchesKeywords(text: string, keywords: string[]): boolean {
  const normalized = text.toLowerCase();
  return keywords.some((kw) => {
    const kwLower = kw.toLowerCase();
    return normalized.includes(kwLower) || text.includes(kw);
  });
}
