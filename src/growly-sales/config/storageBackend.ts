import { ensureProjectEnvLoaded } from './env.js';

export type GrowlyStorageBackend = 'local' | 'gcs';

export const GROWLY_STORAGE_BACKEND_ENV = 'GROWLY_STORAGE_BACKEND';
export const GROWLY_GCS_BUCKET_ENV = 'GROWLY_GCS_BUCKET';
export const GROWLY_GCS_PREFIX_ENV = 'GROWLY_GCS_PREFIX';

export class InvalidStorageBackendError extends Error {
  constructor(value: string) {
    super(
      `GROWLY_STORAGE_BACKEND が不正です: "${value}"（有効値: local, gcs）`
    );
    this.name = 'InvalidStorageBackendError';
  }
}

export class GcsStorageNotConfiguredError extends Error {
  constructor(detail: string) {
    super(`GCS ストレージ未設定: ${detail}`);
    this.name = 'GcsStorageNotConfiguredError';
  }
}

export function getStorageBackend(): GrowlyStorageBackend {
  ensureProjectEnvLoaded();
  const raw = process.env[GROWLY_STORAGE_BACKEND_ENV]?.trim().toLowerCase() || 'local';
  if (raw === 'local') return 'local';
  if (raw === 'gcs') return 'gcs';
  throw new InvalidStorageBackendError(raw);
}

export function isGcsStorageBackend(): boolean {
  return getStorageBackend() === 'gcs';
}

export function getGcsBucketName(): string | null {
  ensureProjectEnvLoaded();
  const value = process.env[GROWLY_GCS_BUCKET_ENV]?.trim();
  return value || null;
}

export function getGcsPrefix(): string {
  ensureProjectEnvLoaded();
  const raw = process.env[GROWLY_GCS_PREFIX_ENV]?.trim() ?? 'prod/growly-sales';
  return raw.replace(/^\/+|\/+$/g, '');
}

export function buildGcsObjectPath(logicalFileName: string): string {
  const prefix = getGcsPrefix();
  const name = logicalFileName.replace(/^\/+/, '');
  return prefix ? `${prefix}/${name}` : name;
}

export function describeGcsUri(logicalFileName: string): string {
  const bucket = getGcsBucketName();
  if (!bucket) return `gs://<bucket未設定>/${buildGcsObjectPath(logicalFileName)}`;
  return `gs://${bucket}/${buildGcsObjectPath(logicalFileName)}`;
}

export function assertGcsStorageConfigured(): void {
  if (getStorageBackend() !== 'gcs') return;
  const bucket = getGcsBucketName();
  if (!bucket) {
    throw new GcsStorageNotConfiguredError(
      `${GROWLY_GCS_BUCKET_ENV} が未設定です（GROWLY_STORAGE_BACKEND=gcs）`
    );
  }
}

export interface StorageBackendStatus {
  backend: GrowlyStorageBackend;
  gcsBucket: string | null;
  gcsPrefix: string;
  externalCandidatesUri: string;
  cloudRunStateUri: string;
}

export function describeStorageBackendStatus(): StorageBackendStatus {
  const backend = getStorageBackend();
  return {
    backend,
    gcsBucket: backend === 'gcs' ? getGcsBucketName() : null,
    gcsPrefix: getGcsPrefix(),
    externalCandidatesUri:
      backend === 'gcs'
        ? describeGcsUri('external-candidates.json')
        : 'local:data/growly-sales/external-candidates.json',
    cloudRunStateUri:
      backend === 'gcs'
        ? describeGcsUri('daily30-cloud-run-state.json')
        : 'local:data/growly-sales/daily30-cloud-run-state.json',
  };
}
