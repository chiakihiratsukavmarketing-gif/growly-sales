import { readFile } from 'node:fs/promises';
import { ensureProjectEnvLoaded, loadEnv } from '../../config/env.js';
import {
  GmailFetchDiagnosticError,
  formatHttpResponseDiagnostics,
  formatSafeFetchError,
  runGmailFetchStage,
} from './gmailFetchDiagnostics.js';

export interface GmailOAuthCredentials {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

export class GmailAuthNotConfiguredError extends Error {
  constructor(message = 'Gmail認証情報が設定されていません。.env または GMAIL_CREDENTIALS_PATH を確認してください。') {
    super(message);
    this.name = 'GmailAuthNotConfiguredError';
  }
}

function readEnvVar(key: string): string | null {
  const value = process.env[key]?.trim();
  return value || null;
}

async function loadCredentialsFromFile(path: string): Promise<GmailOAuthCredentials | null> {
  try {
    const raw = await readFile(path, 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, string>;
    const clientId = parsed.client_id ?? parsed.clientId ?? '';
    const clientSecret = parsed.client_secret ?? parsed.clientSecret ?? '';
    const refreshToken = parsed.refresh_token ?? parsed.refreshToken ?? '';
    if (!clientId || !clientSecret || !refreshToken) return null;
    return { clientId, clientSecret, refreshToken };
  } catch {
    return null;
  }
}

export async function loadGmailCredentials(): Promise<GmailOAuthCredentials | null> {
  ensureProjectEnvLoaded();
  const env = loadEnv();
  const clientId = readEnvVar('GMAIL_CLIENT_ID');
  const clientSecret = readEnvVar('GMAIL_CLIENT_SECRET');
  const refreshToken = readEnvVar('GMAIL_REFRESH_TOKEN');

  if (clientId && clientSecret && refreshToken) {
    return { clientId, clientSecret, refreshToken };
  }

  if (env.gmailCredentialsPath) {
    return loadCredentialsFromFile(env.gmailCredentialsPath);
  }

  return null;
}

export async function isGmailConfigured(): Promise<boolean> {
  const creds = await loadGmailCredentials();
  return creds !== null;
}

export async function getGmailAccessToken(): Promise<string> {
  const creds = await loadGmailCredentials();
  if (!creds) {
    throw new GmailAuthNotConfiguredError();
  }

  return runGmailFetchStage(
    'gmail_oauth_token_refresh',
    'Gmail OAuth token refresh: network request failed',
    async () => {
      const body = new URLSearchParams({
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
        refresh_token: creds.refreshToken,
        grant_type: 'refresh_token',
      });

      let res: Response;
      try {
        res = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: body.toString(),
        });
      } catch (err) {
        throw new GmailFetchDiagnosticError('gmail_oauth_token_refresh', 'Gmail OAuth token refresh: fetch failed', [
          formatSafeFetchError(err),
        ]);
      }

      if (!res.ok) {
        const text = await res.text();
        throw new GmailFetchDiagnosticError(
          'gmail_oauth_token_refresh',
          `Gmail OAuth token refresh failed (HTTP ${res.status})`,
          formatHttpResponseDiagnostics(res.status, res.statusText, text, 'oauth.error')
        );
      }

      let data: { access_token?: string };
      try {
        data = (await res.json()) as { access_token?: string };
      } catch (err) {
        throw new GmailFetchDiagnosticError(
          'gmail_oauth_token_refresh',
          'Gmail OAuth token refresh: invalid JSON response',
          [formatSafeFetchError(err)]
        );
      }

      if (!data.access_token) {
        throw new GmailFetchDiagnosticError('gmail_oauth_token_refresh', 'Gmail OAuth token refresh: no access_token', [
          'oauth.error=(access_token not present in response — value omitted)',
        ]);
      }

      return data.access_token;
    }
  );
}
