import { loadMailOpsRuntimeConfig } from './config/mailOpsRuntimeConfig.js';
import { validateMailOpsLiveReadiness } from './validateMailOpsLiveReadiness.js';
import { resolveUnsubscribeTokenPepper } from './resolveUnsubscribeTokenPepper.js';
import { UnsubscribeTokenIssueError } from './unsubscribeTokenIssueTypes.js';
import { MailOpsConfigurationError } from './mailOpsConfigurationError.js';
import { resolveMailOperationsPublicBaseUrl } from './publicUrlResolver.js';

export type SalesUnsubscribeTokenIssueSource = 'mock' | 'live-gcs';

/**
 * Sales pipeline token issue:
 * - default/mock: in-memory mock registry (existing registerMockUnsubscribeToken)
 * - live+gcs env configured: live-gcs (readiness validated at issue time)
 */
export function resolveSalesUnsubscribeTokenIssueSource(
  env: NodeJS.ProcessEnv = process.env
): SalesUnsubscribeTokenIssueSource {
  const config = loadMailOpsRuntimeConfig(env);
  if (config.mode !== 'live') {
    return 'mock';
  }
  if (config.storageBackend !== 'gcs') {
    return 'mock';
  }
  if (!config.gcsBucketConfigured || !config.gcsPrefixConfigured) {
    return 'mock';
  }
  return 'live-gcs';
}

export function isSalesUnsubscribeTokenLiveGcsIssueEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return resolveSalesUnsubscribeTokenIssueSource(env) === 'live-gcs';
}

/** URL 前提と pepper を GCS write 前に検証（fail-closed） */
export function assertUnsubscribeUrlIssueReadiness(input: {
  tenantId: string;
  env?: NodeJS.ProcessEnv;
}): void {
  const env = input.env ?? process.env;
  const config = loadMailOpsRuntimeConfig(env);
  const readiness = validateMailOpsLiveReadiness({ ...config, mode: 'live' });
  if (!readiness.ready) {
    throw new UnsubscribeTokenIssueError();
  }
  if (!resolveUnsubscribeTokenPepper(env)) {
    throw new MailOpsConfigurationError('UNSUBSCRIBE_TOKEN_PEPPER が未設定です');
  }
  try {
    resolveMailOperationsPublicBaseUrl(input.tenantId.trim());
  } catch {
    throw new UnsubscribeTokenIssueError();
  }
}
