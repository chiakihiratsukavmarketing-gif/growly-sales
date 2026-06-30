import { ensureProjectEnvLoaded } from './env.js';

export const DAILY30_CLOUD_RUN_TOKEN_ENV = 'DAILY30_CLOUD_RUN_TOKEN';

export class Daily30CloudNotConfiguredError extends Error {
  constructor() {
    super('DAILY30_CLOUD_RUN_TOKEN が未設定のため Cloud 自動収集 API は無効です');
    this.name = 'Daily30CloudNotConfiguredError';
  }
}

export class Daily30CloudUnauthorizedError extends Error {
  constructor() {
    super('Cloud 自動収集 API の認証トークンが無効です');
    this.name = 'Daily30CloudUnauthorizedError';
  }
}

export function isDaily30CloudRunTokenConfigured(): boolean {
  ensureProjectEnvLoaded();
  const value = process.env[DAILY30_CLOUD_RUN_TOKEN_ENV]?.trim();
  return Boolean(value);
}

export function getDaily30CloudRunToken(): string | null {
  ensureProjectEnvLoaded();
  const value = process.env[DAILY30_CLOUD_RUN_TOKEN_ENV]?.trim();
  return value || null;
}

export function assertDaily30CloudToken(provided: string | null | undefined): void {
  const expected = getDaily30CloudRunToken();
  if (!expected) throw new Daily30CloudNotConfiguredError();
  if (!provided?.trim() || provided.trim() !== expected) {
    throw new Daily30CloudUnauthorizedError();
  }
}

export function extractDaily30CloudTokenFromHeaders(
  headers: Record<string, string | string[] | undefined>
): string | null {
  const auth = headers.authorization;
  if (typeof auth === 'string' && auth.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim();
  }
  const custom = headers['x-growly-daily30-token'];
  if (typeof custom === 'string') return custom.trim();
  return null;
}
