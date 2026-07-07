import type { MailOpsRuntimeConfig } from './config/mailOpsRuntimeConfig.js';
import { MAIL_OPS_PUBLIC_BASE_URL_APPROVED_ENV } from './config/mailOpsRuntimeConfig.js';

export interface MailOpsLiveReadinessResult {
  ready: boolean;
  missing: string[];
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function isLocalhostHost(host: string): boolean {
  const normalized = host.toLowerCase();
  return (
    normalized === 'localhost' ||
    normalized === '127.0.0.1' ||
    normalized === '::1' ||
    normalized.endsWith('.localhost')
  );
}

export function validateMailOpsLiveReadiness(
  config: MailOpsRuntimeConfig
): MailOpsLiveReadinessResult {
  if (config.mode !== 'live') {
    return { ready: true, missing: [] };
  }

  const missing = new Set<string>();

  if (!config.publicBaseUrlConfigured || !config.publicBaseUrl) {
    missing.add('PUBLIC_BASE_URL');
  } else {
    if (!isHttpsUrl(config.publicBaseUrl)) {
      missing.add('PUBLIC_BASE_URL_HTTPS');
    }
    if (config.publicBaseUrlHost && isLocalhostHost(config.publicBaseUrlHost)) {
      missing.add('PUBLIC_BASE_URL_NOT_LOCALHOST');
    }
    if (!config.publicBaseUrlApproved) {
      missing.add(MAIL_OPS_PUBLIC_BASE_URL_APPROVED_ENV);
    }
  }

  if (config.storageBackend !== 'gcs') {
    missing.add('GROWLY_STORAGE_BACKEND');
  }

  if (!config.gcsBucketConfigured) {
    missing.add('GROWLY_GCS_BUCKET');
  }

  if (!config.gcsPrefixConfigured) {
    missing.add('GROWLY_GCS_PREFIX');
  }

  if (!config.unsubscribePepperConfigured) {
    missing.add('UNSUBSCRIBE_TOKEN_PEPPER');
  }

  if (config.storageBackend === 'local') {
    missing.add('LOCAL_SUPPRESSION_STORE_NOT_ALLOWED');
  }

  if (config.storageBackend === 'unknown') {
    missing.add('GROWLY_STORAGE_BACKEND');
  }

  return {
    ready: missing.size === 0,
    missing: [...missing],
  };
}
