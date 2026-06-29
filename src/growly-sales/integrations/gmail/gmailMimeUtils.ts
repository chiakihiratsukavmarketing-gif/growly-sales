/** RFC 2047 encoded-word (UTF-8 B) */
export function encodeMimeWordUtf8(value: string): string {
  if (/^[\x00-\x7F]*$/.test(value)) return value;
  const encoded = Buffer.from(value, 'utf-8').toString('base64');
  return `=?UTF-8?B?${encoded}?=`;
}

/** =?UTF-8?B?...?= をデコード（単一ワード想定） */
export function decodeMimeEncodedWords(value: string): string {
  return value.replace(/=\?UTF-8\?B\?([^?]+)\?=/gi, (_, b64: string) =>
    Buffer.from(b64, 'base64').toString('utf-8')
  );
}

export function subjectsMatch(actual: string, expected: string): boolean {
  const normalizedActual = decodeMimeEncodedWords(actual).trim();
  return normalizedActual === expected.trim();
}

export function formatFromHeader(displayName: string, email: string): string {
  const name = encodeMimeWordUtf8(displayName);
  return `${name} <${email}>`;
}

export function encodeBase64Body(body: string): string {
  const b64 = Buffer.from(body, 'utf-8').toString('base64');
  const lines: string[] = [];
  for (let i = 0; i < b64.length; i += 76) {
    lines.push(b64.slice(i, i + 76));
  }
  return lines.join('\r\n');
}

export function toBase64Url(raw: string): string {
  return Buffer.from(raw, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function fromBase64Url(data: string): string {
  const padded = data.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (padded.length % 4)) % 4;
  return Buffer.from(padded + '='.repeat(padLen), 'base64').toString('utf-8');
}

export function splitMimeRaw(raw: string): { headersText: string; bodyText: string } {
  const crlfIdx = raw.indexOf('\r\n\r\n');
  if (crlfIdx >= 0) {
    return { headersText: raw.slice(0, crlfIdx), bodyText: raw.slice(crlfIdx + 4) };
  }
  const lfIdx = raw.indexOf('\n\n');
  if (lfIdx >= 0) {
    return { headersText: raw.slice(0, lfIdx), bodyText: raw.slice(lfIdx + 2) };
  }
  return { headersText: raw, bodyText: '' };
}

export function parseMimeHeaders(headersText: string): Map<string, string> {
  const unfolded = headersText.replace(/\r?\n[ \t]+/g, ' ');
  const headers = new Map<string, string>();
  for (const line of unfolded.split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    headers.set(key, value);
  }
  return headers;
}

export function extractEmailAddress(headerValue: string): string {
  const angle = headerValue.match(/<([^>]+)>/);
  if (angle?.[1]) return angle[1].trim().toLowerCase();
  const email = headerValue.match(/[^\s<>]+@[^\s<>]+/);
  return email?.[0]?.trim().toLowerCase() ?? headerValue.trim().toLowerCase();
}

export function decodeMimeBody(bodyText: string, headers: Map<string, string>): string {
  const encoding = (headers.get('content-transfer-encoding') ?? '').toLowerCase();
  const trimmed = bodyText.trim();
  if (encoding === 'base64') {
    const compact = trimmed.replace(/\s+/g, '');
    return Buffer.from(compact, 'base64').toString('utf-8');
  }
  return bodyText;
}

export const BODY_HEADER_LEAK_PATTERNS: RegExp[] = [
  /^From:/m,
  /^Reply-To:/m,
  /^To:/m,
  /^Subject:/m,
  /^MIME-Version:/m,
  /^Content-Type:/m,
  /^Content-Transfer-Encoding:/m,
  /返信先:/,
  /下書きの宛先:/,
  /^c_hiratsuka@wantreach\.jp\s*</m,
];

export function bodyHasHeaderLeak(body: string): string | null {
  for (const pattern of BODY_HEADER_LEAK_PATTERNS) {
    if (pattern.test(body)) {
      return pattern.source;
    }
  }
  return null;
}
