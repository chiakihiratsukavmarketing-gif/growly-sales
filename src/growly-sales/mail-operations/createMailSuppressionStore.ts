import type { GrowlyStorageBackend } from '../config/storageBackend.js';
import {
  GcsStorageNotConfiguredError,
  InvalidStorageBackendError,
  getGcsBucketName,
  getStorageBackend,
} from '../config/storageBackend.js';
import type { MailSuppressionStore } from './suppressionTypes.js';
import { LocalJsonMailSuppressionStore } from './suppressionStoreInterface.js';
import { GcsJsonMailSuppressionStore } from './gcsJsonMailSuppressionStore.js';
import type { GcsJsonStoragePort } from './gcsJsonStoragePort.js';
import { getMailOpsMode } from './suppressionPolicy.js';

export type MailSuppressionStoreMode = 'mock' | 'live';

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
}

export function createMailSuppressionStore(
  input: CreateMailSuppressionStoreInput = {}
): MailSuppressionStore {
  const mode = input.mode ?? getMailOpsMode();
  let backend: GrowlyStorageBackend;
  try {
    backend = input.storageBackend ?? getStorageBackend();
  } catch (err) {
    if (err instanceof InvalidStorageBackendError) {
      throw new MailOpsConfigurationError(err.message);
    }
    throw err;
  }

  if (mode !== 'live') {
    return new LocalJsonMailSuppressionStore();
  }

  if (backend === 'local') {
    throw new MailOpsConfigurationError(
      'MAIL_OPS_MODE=live では GROWLY_STORAGE_BACKEND=gcs が必須です'
    );
  }

  if (backend !== 'gcs') {
    throw new MailOpsConfigurationError('不明なストレージ backend です');
  }

  if (!getGcsBucketName()) {
    throw new MailOpsConfigurationError('GCS バケットが未設定です');
  }

  return new GcsJsonMailSuppressionStore({
    storage: input.gcsStorage,
  });
}

export function assertMailOpsLiveStorageConfigured(): void {
  createMailSuppressionStore({ mode: 'live' });
}

export function isMailOpsStorageReady(mode: MailSuppressionStoreMode = getMailOpsMode()): boolean {
  try {
    if (mode === 'mock') {
      createMailSuppressionStore({ mode: 'mock', storageBackend: 'local' });
      return true;
    }
    if (!process.env.UNSUBSCRIBE_TOKEN_PEPPER?.trim()) {
      return false;
    }
    createMailSuppressionStore({ mode: 'live', storageBackend: 'gcs' });
    return true;
  } catch (err) {
    if (err instanceof GcsStorageNotConfiguredError) return false;
    if (err instanceof MailOpsConfigurationError) return false;
    return false;
  }
}
