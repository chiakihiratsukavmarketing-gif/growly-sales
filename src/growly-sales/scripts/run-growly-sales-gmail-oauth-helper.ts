import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureProjectEnvLoaded } from '../config/env.js';

export const GMAIL_OAUTH_SCOPE =
  'https://www.googleapis.com/auth/gmail.compose https://www.googleapis.com/auth/gmail.settings.basic';

/** Google Cloud Desktop App 用 redirect_uri */
export const GMAIL_OAUTH_REDIRECT_URI = 'http://localhost';

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

function readRequiredEnv(key: string): string | null {
  const value = process.env[key]?.trim();
  return value || null;
}

export function buildGmailOAuthAuthorizationUrl(clientId: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: GMAIL_OAUTH_REDIRECT_URI,
    response_type: 'code',
    scope: GMAIL_OAUTH_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeAuthorizationCodeForRefreshToken(
  clientId: string,
  clientSecret: string,
  code: string
): Promise<string> {
  const body = new URLSearchParams({
    code: code.trim(),
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: GMAIL_OAUTH_REDIRECT_URI,
    grant_type: 'authorization_code',
  });

  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  const data = (await res.json()) as {
    refresh_token?: string;
    error?: string;
    error_description?: string;
  };

  if (!res.ok) {
    const detail = data.error_description ?? data.error ?? 'unknown';
    throw new Error(`Token exchange failed (${res.status}): ${detail}`);
  }

  if (!data.refresh_token) {
    throw new Error(
      'refresh_token が応答に含まれていません。Google アカウントの再認証（prompt=consent）を試してください。'
    );
  }

  return data.refresh_token;
}

async function promptAuthorizationCode(): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const code = await new Promise<string>((resolve) => {
    rl.question('Authorization code を貼り付けて Enter: ', resolve);
  });
  rl.close();
  return code.trim();
}

async function main(): Promise<void> {
  console.log('Growly Sales — Gmail OAuth Helper');
  console.log('=================================');
  console.log('※ refresh token 取得補助のみです。');
  console.log('※ Gmail送信・下書き作成・.env自動編集・tokenファイル保存は行いません。');
  console.log('※ settings.sendAs 確認には gmail.settings.basic スコープが必要です（既存 token は再認証が必要な場合があります）。');
  console.log('');

  ensureProjectEnvLoaded();

  const clientId = readRequiredEnv('GMAIL_CLIENT_ID');
  const clientSecret = readRequiredEnv('GMAIL_CLIENT_SECRET');

  if (!clientId || !clientSecret) {
    console.error('エラー: GMAIL_CLIENT_ID と GMAIL_CLIENT_SECRET が必要です。');
    console.error('');
    console.error('  1. .env.example をコピーして .env を作成');
    console.error('  2. Google Cloud OAuth クライアントの ID / Secret を手動で設定');
    console.error('  3. このスクリプトを再実行');
    console.error('');
    console.error('（.env は git にコミットしないでください）');
    process.exit(1);
  }

  const authUrl = buildGmailOAuthAuthorizationUrl(clientId);

  console.log('次のURLをブラウザで開き、Googleアカウントで認証してください。');
  console.log('');
  console.log(authUrl);
  console.log('');
  console.log(`redirect_uri: ${GMAIL_OAUTH_REDIRECT_URI}`);
  console.log(`scope: ${GMAIL_OAUTH_SCOPE}`);
  console.log('');
  console.log('認証後、ブラウザに表示される authorization code をコピーして貼り付けてください。');
  console.log('（Desktop App の場合、http://localhost/?code=... の code= 以降です）');
  console.log('');

  const code = await promptAuthorizationCode();
  if (!code) {
    console.error('エラー: authorization code が空です。');
    process.exit(1);
  }

  const refreshToken = await exchangeAuthorizationCodeForRefreshToken(clientId, clientSecret, code);

  console.log('');
  console.log('--- GMAIL_REFRESH_TOKEN ---');
  console.log(refreshToken);
  console.log('---------------------------');
  console.log('');
  console.log('この値を .env の GMAIL_REFRESH_TOKEN に手動で貼ってください。');
  console.log('.env は自動編集しません。secret / token はファイルに保存しません。');
}

const isDirectRun =
  process.argv[1] !== undefined &&
  resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1]);

if (isDirectRun) {
  main().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Fatal error:', message);
    process.exit(1);
  });
}
