import { loadMailOpsRuntimeConfig } from './config/mailOpsRuntimeConfig.js';

export type SalesSuppressionReadSource = 'local' | 'gcs';
export type SalesSuppressionWriteSource = SalesSuppressionReadSource;

/**
 * Sales pipeline suppression reads:
 * - default/local/mock: local JSON runtime file
 * - live + gcs env: GCS mail-suppressions.json (read-only in Step 16A)
 */
export function resolveSalesSuppressionReadSource(
  env: NodeJS.ProcessEnv = process.env
): SalesSuppressionReadSource {
  const config = loadMailOpsRuntimeConfig(env);
  if (config.mode !== 'live') {
    return 'local';
  }
  if (config.storageBackend !== 'gcs') {
    return 'local';
  }
  if (!config.gcsBucketConfigured || !config.gcsPrefixConfigured) {
    return 'local';
  }
  return 'gcs';
}

export function isSalesSuppressionGcsReadEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return resolveSalesSuppressionReadSource(env) === 'gcs';
}

/**
 * Sales pipeline suppression writes (Step 16E):
 * - mock/local: local JSON runtime file
 * - live + gcs env: GCS mail-suppressions.json (readiness validated at persist time)
 */
export function resolveSalesSuppressionWriteSource(
  env: NodeJS.ProcessEnv = process.env
): SalesSuppressionWriteSource {
  return resolveSalesSuppressionReadSource(env);
}

export function isSalesSuppressionGcsWriteEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return resolveSalesSuppressionWriteSource(env) === 'gcs';
}
