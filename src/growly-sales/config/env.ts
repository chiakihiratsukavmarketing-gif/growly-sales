/**
 * Environment configuration — loads project .env (read-only) then reads process.env.
 * External API calls require API_PRODUCTION_ENABLED=true explicitly.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getProjectRoot } from './paths.js';

export interface GrowlyEnv {
  googlePlacesApiKey: string | null;
  webSearchApiKey: string | null;
  webSearchEngineId: string | null;
  openaiApiKey: string | null;
  googleSheetsCredentialsPath: string | null;
  gmailCredentialsPath: string | null;
  isPlacesConfigured: boolean;
  isWebSearchConfigured: boolean;
  isOpenAiConfigured: boolean;
  isGmailConfigured: boolean;
}

let projectDotEnvLoaded = false;

function applyDotEnvLine(line: string): void {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return;
  const eq = trimmed.indexOf('=');
  if (eq === -1) return;
  const key = trimmed.slice(0, eq).trim();
  if (!key) return;
  let value = trimmed.slice(eq + 1).trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  if (process.env[key] === undefined) {
    process.env[key] = value;
  }
}

/**
 * Loads `{projectRoot}/.env` into process.env without overwriting existing variables.
 * Does not write or modify the .env file.
 */
export function ensureProjectEnvLoaded(): void {
  if (projectDotEnvLoaded) return;
  projectDotEnvLoaded = true;

  const envPath = join(getProjectRoot(), '.env');
  if (!existsSync(envPath)) return;

  if (typeof process.loadEnvFile === 'function') {
    try {
      process.loadEnvFile(envPath);
      return;
    } catch {
      // manual parse fallback
    }
  }

  let content = readFileSync(envPath, 'utf-8');
  if (content.charCodeAt(0) === 0xfeff) {
    content = content.slice(1);
  }
  for (const line of content.split(/\r?\n/)) {
    applyDotEnvLine(line);
  }
}

/** @internal verify / tests only */
export function resetProjectEnvLoadedForTests(): void {
  projectDotEnvLoaded = false;
}

function readEnv(key: string): string | null {
  const value = process.env[key]?.trim();
  return value || null;
}

export function isApiProductionEnabled(): boolean {
  ensureProjectEnvLoaded();
  return readEnv('API_PRODUCTION_ENABLED') === 'true';
}

/** @deprecated use isApiProductionEnabled() — kept for verify backward compatibility */
export const API_PRODUCTION_ENABLED = isApiProductionEnabled();

export function loadEnv(): GrowlyEnv {
  ensureProjectEnvLoaded();

  const googlePlacesApiKey = readEnv('GOOGLE_PLACES_API_KEY');
  const webSearchApiKey = readEnv('WEB_SEARCH_API_KEY');
  const webSearchEngineId = readEnv('WEB_SEARCH_ENGINE_ID');
  const openaiApiKey = readEnv('OPENAI_API_KEY');
  const googleSheetsCredentialsPath = readEnv('GOOGLE_SHEETS_CREDENTIALS_PATH');
  const gmailCredentialsPath = readEnv('GMAIL_CREDENTIALS_PATH');
  const gmailClientId = readEnv('GMAIL_CLIENT_ID');
  const gmailClientSecret = readEnv('GMAIL_CLIENT_SECRET');
  const gmailRefreshToken = readEnv('GMAIL_REFRESH_TOKEN');

  return {
    googlePlacesApiKey,
    webSearchApiKey,
    webSearchEngineId,
    openaiApiKey,
    googleSheetsCredentialsPath,
    gmailCredentialsPath,
    isPlacesConfigured: Boolean(googlePlacesApiKey),
    isWebSearchConfigured: Boolean(webSearchApiKey && webSearchEngineId),
    isOpenAiConfigured: Boolean(openaiApiKey),
    isGmailConfigured: Boolean(
      (gmailClientId && gmailClientSecret && gmailRefreshToken) || gmailCredentialsPath
    ),
  };
}

export function isExternalFetchConfigured(): boolean {
  const env = loadEnv();
  return (
    isApiProductionEnabled() &&
    (env.isPlacesConfigured || env.isWebSearchConfigured)
  );
}

/**
 * 1回の gmail-create-drafts 実行で作成する下書き数の上限。
 * 未設定・空・不正値の場合は null（制限なし）。
 */
export function getGmailDraftCreateLimit(): number | null {
  ensureProjectEnvLoaded();
  const raw = readEnv('GMAIL_DRAFT_CREATE_LIMIT');
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return null;
  return n;
}

/** 営業メール署名に表示するメールアドレス（未設定時は OUTREACH_FROM_EMAIL と同じ） */
export function getOutreachFromEmail(): string {
  ensureProjectEnvLoaded();
  return readEnv('OUTREACH_FROM_EMAIL') ?? 'c_hiratsuka@wantreach.jp';
}

export function getOutreachFromDisplayName(): string {
  ensureProjectEnvLoaded();
  return readEnv('OUTREACH_FROM_DISPLAY_NAME') ?? '平塚千明';
}

export function getOutreachReplyToEmail(): string {
  ensureProjectEnvLoaded();
  return readEnv('OUTREACH_REPLY_TO_EMAIL') ?? getOutreachFromEmail();
}

export function getOutreachSignatureEmail(): string {
  ensureProjectEnvLoaded();
  return readEnv('OUTREACH_SIGNATURE_EMAIL') ?? getOutreachFromEmail();
}
