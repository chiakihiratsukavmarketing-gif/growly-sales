/**
 * Phase 44.1 Step 15 dry-run helper — issue token / GET / POST (Human Approval gates).
 * Never logs raw token, pepper, or full email.
 */
import { writeFileSync, readFileSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  generateUnsubscribeToken,
  hashUnsubscribeTokenWithPepper,
  normalizeEmailAddress,
} from '../mail-operations/suppressionToken.js';
import { GcsUnsubscribeTokenStore } from '../mail-operations/gcsUnsubscribeTokenStore.js';
import { createDefaultGcsJsonStoragePort } from '../mail-operations/gcsJsonStoragePort.js';
import { DEFAULT_TENANT_ID } from '../mail-operations/tenantResolver.js';

const TOKEN_CACHE = join(tmpdir(), 'growly-sales-step15-token.cache');
const PUBLIC_BASE = process.env.PUBLIC_BASE_URL?.trim() || 'https://mailops.wantreach.jp';
const STEP15_LEAD_ID = 'phase44-smoke-test';

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`Missing required env: ${name}`);
    process.exit(1);
  }
  return value;
}

function safeSummary(input: {
  phase: string;
  ok: boolean;
  httpStatus?: number;
  screenState?: string;
  liveConnected?: boolean;
  maskedEmail?: string | null;
  tokenIssued?: boolean;
  tokenHashPrefix?: string;
  error?: string;
}): void {
  console.log(JSON.stringify(input));
}

async function issueToken(): Promise<string> {
  const email = requireEnv('STEP15_TEST_EMAIL');
  const pepper = requireEnv('UNSUBSCRIBE_TOKEN_PEPPER');
  process.env.GROWLY_STORAGE_BACKEND = 'gcs';
  process.env.GROWLY_GCS_BUCKET = process.env.GROWLY_GCS_BUCKET || 'growly-sales-daily30';
  process.env.GROWLY_GCS_PREFIX = process.env.GROWLY_GCS_PREFIX || 'prod/growly-sales';

  const rawToken = generateUnsubscribeToken();
  const tokenHash = hashUnsubscribeTokenWithPepper(rawToken, pepper);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const store = new GcsUnsubscribeTokenStore({ storage: createDefaultGcsJsonStoragePort() });
  await store.add({
    tokenHash,
    tenantId: DEFAULT_TENANT_ID,
    leadId: STEP15_LEAD_ID,
    sendRecordId: `step15-dry-run-${now.toISOString().slice(0, 10)}`,
    normalizedEmail: normalizeEmailAddress(email),
    expiresAt,
    createdAt: now.toISOString(),
  });

  writeFileSync(TOKEN_CACHE, rawToken, { encoding: 'utf8', mode: 0o600 });
  return rawToken;
}

function readCachedToken(): string {
  if (!existsSync(TOKEN_CACHE)) {
    console.error('Token cache missing. Run issue phase first.');
    process.exit(1);
  }
  return readFileSync(TOKEN_CACHE, 'utf8').trim();
}

function clearCachedToken(): void {
  if (existsSync(TOKEN_CACHE)) {
    unlinkSync(TOKEN_CACHE);
  }
}

async function fetchUnsubscribe(method: 'GET' | 'POST', rawToken: string) {
  const url = `${PUBLIC_BASE}/u/${encodeURIComponent(rawToken)}`;
  const res = await fetch(url, { method, headers: { Accept: 'application/json' } });
  const text = await res.text();
  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    body = { parseError: true };
  }
  return { status: res.status, body };
}

async function main(): Promise<void> {
  const phase = process.argv[2]?.trim();
  if (!phase) {
    console.error('Usage: tsx run-growly-sales-mail-ops-step15-dry-run.ts <issue|get|post|cleanup>');
    process.exit(1);
  }

  if (phase === 'issue') {
    const rawToken = await issueToken();
    const get = await fetchUnsubscribe('GET', rawToken);
    safeSummary({
      phase: 'issue+get',
      ok: get.status === 200 && get.body.screenState === 'confirm',
      httpStatus: get.status,
      screenState: String(get.body.screenState ?? ''),
      liveConnected: Boolean(get.body.liveConnected),
      maskedEmail: typeof get.body.maskedEmail === 'string' ? get.body.maskedEmail : null,
      tokenIssued: true,
      tokenHashPrefix: undefined,
    });
    return;
  }

  if (phase === 'get') {
    const rawToken = readCachedToken();
    const get = await fetchUnsubscribe('GET', rawToken);
    safeSummary({
      phase: 'get',
      ok: get.status === 200,
      httpStatus: get.status,
      screenState: String(get.body.screenState ?? ''),
      liveConnected: Boolean(get.body.liveConnected),
      maskedEmail: typeof get.body.maskedEmail === 'string' ? get.body.maskedEmail : null,
    });
    return;
  }

  if (phase === 'post') {
    if (process.env.STEP15_POST_APPROVED !== '1') {
      console.error('STEP15_POST_APPROVED=1 required for POST phase');
      process.exit(1);
    }
    const rawToken = readCachedToken();
    const post = await fetchUnsubscribe('POST', rawToken);
    safeSummary({
      phase: 'post',
      ok: post.status === 200 && (post.body.screenState === 'completed' || post.body.screenState === 'already_unsubscribed'),
      httpStatus: post.status,
      screenState: String(post.body.screenState ?? ''),
      liveConnected: Boolean(post.body.liveConnected),
      maskedEmail: typeof post.body.maskedEmail === 'string' ? post.body.maskedEmail : null,
    });
    return;
  }

  if (phase === 'post-idempotent') {
    const rawToken = readCachedToken();
    const post = await fetchUnsubscribe('POST', rawToken);
    safeSummary({
      phase: 'post-idempotent',
      ok: post.status === 200 && post.body.screenState === 'already_unsubscribed',
      httpStatus: post.status,
      screenState: String(post.body.screenState ?? ''),
      liveConnected: Boolean(post.body.liveConnected),
    });
    return;
  }

  if (phase === 'cleanup') {
    clearCachedToken();
    safeSummary({ phase: 'cleanup', ok: true });
    return;
  }

  console.error(`Unknown phase: ${phase}`);
  process.exit(1);
}

main().catch((err) => {
  safeSummary({
    phase: 'error',
    ok: false,
    error: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});
