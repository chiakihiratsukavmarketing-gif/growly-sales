import type { GrowlyStorageBackend } from '../config/storageBackend.js';
import { InvalidStorageBackendError } from '../config/storageBackend.js';
import type { MailSuppressionStore } from './suppressionTypes.js';
import { LocalJsonMailSuppressionStore } from './suppressionStoreInterface.js';
import { GcsJsonMailSuppressionStore } from './gcsJsonMailSuppressionStore.js';
import type { GcsJsonStoragePort } from './gcsJsonStoragePort.js';
import {
  loadMailOpsRuntimeConfig,
  type MailOpsMode,
  type MailOpsRuntimeConfig,
} from './config/mailOpsRuntimeConfig.js';
import { validateMailOpsLiveReadiness } from './validateMailOpsLiveReadiness.js';
import { assertUnsubscribeTokenPepperForLive } from './resolveUnsubscribeTokenPepper.js';

export type MailSuppressionStoreMode = MailOpsMode;

export class MailOpsConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MailOpsConfigurationError';
  }
}

export interface CreateMailSuppressionStoreInput {
  mode?: MailSuppressionStoreMode;
  storageBackend?: GrowlyStorageBackend;
  gcsStorage?: GcsJsonStoragePort;
  env?: NodeJS.ProcessEnv;
  config?: MailOpsRuntimeConfig;
}

export function createMailSuppressionStore(
  input: CreateMailSuppressionStoreInput = {}
): MailSuppressionStore {
  const env = input.env ?? process.env;
  const config = input.config ?? loadMailOpsRuntimeConfig(env);
  const mode = input.mode ?? config.mode;
  const backend = input.storageBackend ?? config.storageBackend;

  if (mode !== 'live') {
    return new LocalJsonMailSuppressionStore();
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

  try {
    assertUnsubscribeTokenPepperForLive('live', env);
  } catch (err) {
    if (err instanceof MailOpsConfigurationError) throw err;
    throw new MailOpsConfigurationError('UNSUBSCRIBE_TOKEN_PEPPER が未設定です');
  }

  if (!config.gcsBucketConfigured) {
    throw new MailOpsConfigurationError('GCS バケットが未設定です');
  }

  return new GcsJsonMailSuppressionStore({
    storage: input.gcsStorage,
  });
}

export function tryCreateMailSuppressionStore(
  input: CreateMailSuppressionStoreInput = {}
): MailSuppressionStore | null {
  try {
    return createMailSuppressionStore(input);
  } catch (err) {
    if (err instanceof MailOpsConfigurationError) return null;
    if (err instanceof InvalidStorageBackendError) return null;
    throw err;
  }
}

export function isMailOpsStorageReady(
  mode: MailSuppressionStoreMode = loadMailOpsRuntimeConfig().mode,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const config = loadMailOpsRuntimeConfig(env);
  if (mode === 'mock' || config.mode === 'mock') {
    return true;
  }
  const readiness = validateMailOpsLiveReadiness({ ...config, mode: 'live' });
  if (!readiness.ready) {
    return false;
  }
  return tryCreateMailSuppressionStore({ mode: 'live', env, config }) !== null;
}
