/**
 * Gmail fetch 診断 — secret / token はログに含めない。
 */

export type GmailFetchStage = 'gmail_oauth_token_refresh' | 'gmail_drafts_create';

export function formatSafeFetchError(err: unknown): string {
  if (!(err instanceof Error)) {
    return `name=UnknownError | message=${String(err)}`;
  }

  const parts = [`name=${err.name}`, `message=${err.message}`];
  const cause = err.cause;

  if (cause && typeof cause === 'object') {
    const c = cause as Record<string, unknown>;
    if (c.code !== undefined && c.code !== null) {
      parts.push(`cause.code=${String(c.code)}`);
    }
    if (typeof c.message === 'string' && c.message) {
      parts.push(`cause.message=${c.message}`);
    }
    if (typeof c.hostname === 'string' && c.hostname) {
      parts.push(`cause.hostname=${c.hostname}`);
    }
  }

  return parts.join(' | ');
}

function readNestedMessage(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const obj = value as Record<string, unknown>;
  if (typeof obj.message === 'string' && obj.message.trim()) {
    return obj.message.trim();
  }
  return null;
}

/** Google API / OAuth JSON から error.message のみ安全に抽出 */
export function parseGoogleApiErrorMessage(bodyText: string): string | null {
  try {
    const parsed = JSON.parse(bodyText) as Record<string, unknown>;
    const err = parsed.error;
    if (typeof err === 'string' && err.trim()) {
      const desc =
        typeof parsed.error_description === 'string' ? parsed.error_description.trim() : '';
      return desc ? `${err}: ${desc}` : err;
    }
    const msg = readNestedMessage(err);
    if (!msg) return null;
    const status =
      err && typeof err === 'object' && typeof (err as Record<string, unknown>).status === 'string'
        ? String((err as Record<string, unknown>).status)
        : null;
    return status ? `${status}: ${msg}` : msg;
  } catch {
    return null;
  }
}

export function formatHttpResponseDiagnostics(
  status: number,
  statusText: string,
  bodyText: string,
  apiLabel: string
): string[] {
  const lines = [`http.status=${status}`, `http.statusText=${statusText || '(empty)'}`];
  const apiMessage = parseGoogleApiErrorMessage(bodyText);
  if (apiMessage) {
    lines.push(`${apiLabel}=${apiMessage}`);
  } else {
    lines.push(`${apiLabel}=(response body omitted — no safe error.message)`);
  }
  return lines;
}

export class GmailFetchDiagnosticError extends Error {
  readonly stage: GmailFetchStage;
  readonly diagnostics: string[];

  constructor(stage: GmailFetchStage, summary: string, diagnostics: string[]) {
    super(summary);
    this.name = 'GmailFetchDiagnosticError';
    this.stage = stage;
    this.diagnostics = diagnostics;
  }

  toLogLines(): string[] {
    return [`stage=${this.stage}`, ...this.diagnostics];
  }

  toPersistMessage(): string {
    return `${this.stage}: ${this.diagnostics.join('; ')}`;
  }
}

export async function runGmailFetchStage<T>(
  stage: GmailFetchStage,
  summaryOnNetworkFailure: string,
  fn: () => Promise<T>
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof GmailFetchDiagnosticError) {
      throw err;
    }
    throw new GmailFetchDiagnosticError(stage, summaryOnNetworkFailure, [formatSafeFetchError(err)]);
  }
}

export function logGmailFetchDiagnosticError(prefix: string, err: GmailFetchDiagnosticError): void {
  console.error(`${prefix} ${err.message}`);
  for (const line of err.toLogLines()) {
    console.error(`   ${line}`);
  }
}
