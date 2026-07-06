import type { UserAgentCategory } from './openTrackingTypes.js';

const GMAIL_PROXY_PATTERNS = [/GoogleImageProxy/i, /Google-Image-Proxy/i];
const APPLE_MPP_PATTERNS = [/Mozilla\/5\.0.*Mac OS X.*AppleWebKit/i, /Apple-Mail/i];

export function categorizeUserAgent(userAgent: string): UserAgentCategory {
  const ua = userAgent.trim();
  if (!ua) return 'unknown';
  if (GMAIL_PROXY_PATTERNS.some((re) => re.test(ua))) return 'gmail_proxy';
  if (APPLE_MPP_PATTERNS.some((re) => re.test(ua))) return 'apple_mpp';
  if (/Mobile|Android|iPhone|iPad/i.test(ua)) return 'mobile';
  if (/Windows|Macintosh|Linux|X11/i.test(ua)) return 'desktop';
  return 'unknown';
}

export function isPrivacyProxyCategory(category: UserAgentCategory): boolean {
  return category === 'gmail_proxy' || category === 'apple_mpp';
}

export function shortenUserAgent(userAgent: string, maxLen = 160): string {
  const trimmed = userAgent.trim();
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, maxLen - 1)}…`;
}

export const OPEN_TRACKING_PRIVACY_NOTE =
  '開封率は画像読み込みに基づく参考値です。メールプロキシ（Gmail/Apple等）や画像ブロックでは正確に計測できません。IPは保存しません。人が実際に読んだとは断定できません。';
