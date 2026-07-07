import type { GrowlyStorageBackend } from '../../config/storageBackend.js';
import { ensureProjectEnvLoaded } from '../../config/env.js';

export type MailOpsMode = 'mock' | 'live';

export const MAIL_OPS_APPROVED_PUBLIC_HOST = 'mailops.wantreach.jp';
export const MAIL_OPS_PUBLIC_BASE_URL_APPROVED_ENV = 'MAIL_OPS_PUBLIC_BASE_URL_APPROVED';
export const MAIL_OPS_EXTERNAL_CONNECTION_ENV = 'MAIL_OPS_LIVE_EXTERNAL_CONNECTED';
export const MAIL_OPS_SERVICE_NAME_CONFIG = 'growly-sales-mail-ops';
export const MAIL_OPS_DEFAULT_REGION_HINT = 'asia-northeast1';

export interface MailOpsRuntimeConfig {
  mode: MailOpsMode;
  /** env の PUBLIC_BASE_URL のみ（tenant 既定は含めない） */
  publicBaseUrl: string | null;
  publicBaseUrlConfigured: boolean;
  publicBaseUrlHost: string | null;
  publicBaseUrlApproved: boolean;
  storageBackend: GrowlyStorageBackend | 'unknown' | null;
  gcsBucketConfigured: boolean;
  gcsPrefixConfigured: boolean;
  unsubscribePepperConfigured: boolean;
  serviceName: string;
  regionHint: string;
}

function parseMode(env: NodeJS.ProcessEnv): MailOpsMode {
  return env.MAIL_OPS_MODE?.trim().toLowerCase() === 'live' ? 'live' : 'mock';
}

function parseStorageBackend(env: NodeJS.ProcessEnv): GrowlyStorageBackend | 'unknown' | null {
  const raw = env.GROWLY_STORAGE_BACKEND?.trim().toLowerCase();
  if (!raw) return 'local';
  if (raw === 'local') return 'local';
  if (raw === 'gcs') return 'gcs';
  return 'unknown';
}

function parsePublicBaseUrlHost(publicBaseUrl: string | null): string | null {
  if (!publicBaseUrl) return null;
  try {
    return new URL(publicBaseUrl).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function isPublicBaseUrlExplicitlyApproved(env: NodeJS.ProcessEnv): boolean {
  return env[MAIL_OPS_PUBLIC_BASE_URL_APPROVED_ENV]?.trim().toLowerCase() === 'true';
}

export function isMailOpsLiveExternallyConnected(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[MAIL_OPS_EXTERNAL_CONNECTION_ENV]?.trim().toLowerCase() === 'true';
}

export function loadMailOpsRuntimeConfig(env: NodeJS.ProcessEnv = process.env): MailOpsRuntimeConfig {
  ensureProjectEnvLoaded();
  const mode = parseMode(env);
  const publicBaseUrl = env.PUBLIC_BASE_URL?.trim() || null;
  const publicBaseUrlHost = parsePublicBaseUrlHost(publicBaseUrl);
  const hostApproved =
    publicBaseUrlHost === MAIL_OPS_APPROVED_PUBLIC_HOST ||
    (publicBaseUrlHost !== null && isPublicBaseUrlExplicitlyApproved(env));

  return {
    mode,
    publicBaseUrl,
    publicBaseUrlConfigured: Boolean(publicBaseUrl),
    publicBaseUrlHost,
    publicBaseUrlApproved: hostApproved,
    storageBackend: parseStorageBackend(env),
    gcsBucketConfigured: Boolean(env.GROWLY_GCS_BUCKET?.trim()),
    gcsPrefixConfigured: Boolean(env.GROWLY_GCS_PREFIX?.trim()),
    unsubscribePepperConfigured: Boolean(env.UNSUBSCRIBE_TOKEN_PEPPER?.trim()),
    serviceName: MAIL_OPS_SERVICE_NAME_CONFIG,
    regionHint: env.GCP_REGION?.trim() || MAIL_OPS_DEFAULT_REGION_HINT,
  };
}
