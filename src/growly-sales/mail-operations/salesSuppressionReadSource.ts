import { loadMailOpsRuntimeConfig } from './config/mailOpsRuntimeConfig.js';

export type SalesSuppressionReadSource = 'local' | 'gcs';

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
