export const ALLOWED_EMAIL_PREFIXES = [
  'info',
  'contact',
  'sales',
  'recruit',
  'support',
  'office',
  'toiawase',
  'inquiry',
  'reception',
  'hello',
] as const;

export const FREE_EMAIL_DOMAINS = [
  'gmail.com',
  'googlemail.com',
  'yahoo.co.jp',
  'yahoo.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'icloud.com',
  'me.com',
  'aol.com',
] as const;

const PERSONAL_NAME_PATTERNS = [
  /^[a-z]+\.[a-z]+@/i,
  /^[a-z]{2,15}@[a-z0-9.-]+\.[a-z]{2,}$/i,
];

const SUSPICIOUS_PATTERNS = [
  /noreply@/i,
  /no-reply@/i,
  /no_reply@/i,
  /mailer-daemon@/i,
  /postmaster@/i,
  /example@/i,
  /test@/i,
  /sample@/i,
  /@example\.com$/i,
  /@example\.co\.jp$/i,
  /@test\.local$/i,
  /@dummy\./i,
  /@sentry\./i,
  /@webpack\./i,
  /\.png$/i,
  /\.jpg$/i,
  /\.gif$/i,
];

const BASIC_EMAIL_REGEX = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;

export function isValidEmailFormat(email: string): boolean {
  return BASIC_EMAIL_REGEX.test(email.trim());
}

export function getEmailLocalPart(email: string): string {
  return email.split('@')[0]?.toLowerCase() ?? '';
}

export function getEmailDomain(email: string): string {
  return email.split('@')[1]?.toLowerCase() ?? '';
}

export function isFreeEmailDomain(email: string): boolean {
  const domain = getEmailDomain(email);
  return FREE_EMAIL_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`));
}

export function isRejectedEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return true;
  for (const pattern of SUSPICIOUS_PATTERNS) {
    if (pattern.test(normalized)) return true;
  }
  if (normalized.includes('dummy') || normalized.includes('sample')) return true;
  return false;
}

export function isAllowedCorporateEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  if (!isValidEmailFormat(normalized)) return false;
  if (isRejectedEmail(normalized)) return false;
  if (isFreeEmailDomain(normalized)) return false;

  const localPart = getEmailLocalPart(normalized);
  return ALLOWED_EMAIL_PREFIXES.some(
    (prefix) => localPart === prefix || localPart.startsWith(`${prefix}.`) || localPart.startsWith(`${prefix}-`)
  );
}

export function looksLikePersonalEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  if (!isValidEmailFormat(normalized)) return true;
  if (isFreeEmailDomain(normalized)) return true;

  const localPart = getEmailLocalPart(normalized);

  if (ALLOWED_EMAIL_PREFIXES.includes(localPart as (typeof ALLOWED_EMAIL_PREFIXES)[number])) {
    return false;
  }

  for (const prefix of ALLOWED_EMAIL_PREFIXES) {
    if (localPart.startsWith(`${prefix}.`) || localPart.startsWith(`${prefix}-`)) {
      return false;
    }
  }

  for (const pattern of PERSONAL_NAME_PATTERNS) {
    if (pattern.test(normalized)) return true;
  }

  if (/^[a-z]+[0-9]*@/.test(normalized) && localPart.length <= 12 && !localPart.includes('.')) {
    return true;
  }

  return false;
}

export function filterAllowedEmails(emails: string[]): {
  allowed: string[];
  rejected: string[];
} {
  const allowed: string[] = [];
  const rejected: string[] = [];
  const seen = new Set<string>();

  for (const email of emails) {
    const normalized = email.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);

    if (isAllowedCorporateEmail(normalized)) {
      allowed.push(normalized);
    } else {
      rejected.push(normalized);
    }
  }

  return { allowed, rejected };
}

export function isHousingIndustry(industry: string): boolean {
  const keywords = ['工務店', '住宅', 'リフォーム', '注文', '建築', 'ハウス', 'ホーム'];
  const normalized = industry.toLowerCase();
  return keywords.some((kw) => industry.includes(kw) || normalized.includes(kw));
}
