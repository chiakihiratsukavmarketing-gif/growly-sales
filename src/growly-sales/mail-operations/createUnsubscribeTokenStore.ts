import type { GrowlyStorageBackend } from '../config/storageBackend.js';
import { InvalidStorageBackendError } from '../config/storageBackend.js';
import {
  loadMailOpsRuntimeConfig,
  type MailOpsMode,
  type MailOpsRuntimeConfig,
} from './config/mailOpsRuntimeConfig.js';
import { validateMailOpsLiveReadiness } from './validateMailOpsLiveReadiness.js';
import { assertUnsubscribeTokenPepperForLive } from './resolveUnsubscribeTokenPepper.js';
import { MailOpsConfigurationError } from './mailOpsConfigurationError.js';
import type { GcsJsonStoragePort } from './gcsJsonStoragePort.js';
import { GcsUnsubscribeTokenStore } from './gcsUnsubscribeTokenStore.js';
import { InMemoryUnsubscribeTokenStore, type UnsubscribeTokenStore } from './unsubscribeTokenStore.js';

export type UnsubscribeTokenStoreMode = MailOpsMode;

export interface CreateUnsubscribeTokenStoreInput {
  mode?: UnsubscribeTokenStoreMode;
  storageBackend?: GrowlyStorageBackend;
  gcsStorage?: GcsJsonStoragePort;
  env?: NodeJS.ProcessEnv;
  config?: MailOpsRuntimeConfig;
}

export function createUnsubscribeTokenStore(
  input: CreateUnsubscribeTokenStoreInput = {}
): UnsubscribeTokenStore {
  const env = input.env ?? process.env;
  const config = input.config ?? loadMailOpsRuntimeConfig(env);
  const mode = input.mode ?? config.mode;
  const backend = input.storageBackend ?? config.storageBackend;

  if (mode !== 'live') {
    return new InMemoryUnsubscribeTokenStore();
  }

  const readiness = validateMailOpsLiveReadiness({ ...config, mode: 'live' });
  if (!readiness.ready) {
    throw new MailOpsConfigurationError(
      `mail-ops live 設定が不足しています: ${readiness.missing.join(', ')}`
    );
  }

  if (backend === 'local' || backend === null) {
    throw new MailOpsConfigurationError(
      'MAIL_OPS_MODE=live では GROWLY_STORAGE_BACKEND=gcs が必須です'
    );
  }

  if (backend === 'unknown') {
    throw new MailOpsConfigurationError('不明なストレージ backend です');
  }

  if (backend !== 'gcs') {
    throw new MailOpsConfigurationError('不明なストレージ backend です');
  }

  if (!config.gcsBucketConfigured) {
    throw new MailOpsConfigurationError('GCS バケットが未設定です');
  }

  try {
    assertUnsubscribeTokenPepperForLive('live', env);
  } catch (err) {
    if (err instanceof MailOpsConfigurationError) throw err;
    throw new MailOpsConfigurationError('UNSUBSCRIBE_TOKEN_PEPPER が未設定です');
  }

  return new GcsUnsubscribeTokenStore({ storage: input.gcsStorage });
}

export function tryCreateUnsubscribeTokenStore(
  input: CreateUnsubscribeTokenStoreInput = {}
): UnsubscribeTokenStore | null {
  try {
    return createUnsubscribeTokenStore(input);
  } catch (err) {
    if (err instanceof MailOpsConfigurationError) return null;
    if (err instanceof InvalidStorageBackendError) return null;
    throw err;
  }
}

