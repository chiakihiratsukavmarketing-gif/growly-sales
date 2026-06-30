/**
 * Growly Sales Cloud デプロイ定数（Phase 29）
 * Secret の値はここに書かない — Secret Manager の名前のみ。
 */

import { ensureProjectEnvLoaded } from './env.js';

export const GCP_PROJECT_ID = 'growly-scheduler';
export const GCP_REGION = 'asia-northeast1';

export const ARTIFACT_REGISTRY_REPO = 'growly-sales';
export const DOCKER_IMAGE_NAME = 'growly-sales-daily30';

export const GCS_BUCKET_NAME = 'growly-sales-daily30';
export const GCS_OBJECT_PREFIX = 'prod/growly-sales';

export const CLOUD_RUN_SERVICE_NAME = 'growly-sales-daily30';
export const CLOUD_RUN_SERVICE_ACCOUNT = `growly-daily30-runner@${GCP_PROJECT_ID}.iam.gserviceaccount.com`;

export const SCHEDULER_JOB_NAME = 'growly-daily30-auto-fetch-9am';
export const SCHEDULER_CRON = '0 9 * * *';
export const SCHEDULER_TIMEZONE = 'Asia/Tokyo';
export const SCHEDULER_TARGET_PATH = '/api/cloud/daily30/auto-fetch';

export const SECRET_DAILY30_TOKEN = 'daily30-cloud-run-token';
export const SECRET_PLACES_API_KEY = 'google-places-api-key';

export const CLOUD_RUN_PORT = 8080;
export const CLOUD_RUN_MIN_INSTANCES = 0;
export const CLOUD_RUN_MAX_INSTANCES = 1;
export const CLOUD_RUN_CONCURRENCY = 1;
export const CLOUD_RUN_TIMEOUT_SECONDS = 900;

export const GROWLY_CLOUD_SCHEDULER_CONFIGURED_ENV = 'GROWLY_CLOUD_SCHEDULER_CONFIGURED';
export const GROWLY_CLOUD_RUN_SERVICE_URL_ENV = 'GROWLY_CLOUD_RUN_SERVICE_URL';

export function getArtifactRegistryImageUri(
  projectId: string = GCP_PROJECT_ID,
  tag: string = 'latest'
): string {
  return `${GCP_REGION}-docker.pkg.dev/${projectId}/${ARTIFACT_REGISTRY_REPO}/${DOCKER_IMAGE_NAME}:${tag}`;
}

export function isCloudSchedulerConfigured(): boolean {
  ensureProjectEnvLoaded();
  return process.env[GROWLY_CLOUD_SCHEDULER_CONFIGURED_ENV]?.trim().toLowerCase() === 'true';
}

/** Cloud Run サービス URL（表示用。Secret ではない） */
export function getCloudRunServiceUrl(): string | null {
  ensureProjectEnvLoaded();
  const url = process.env[GROWLY_CLOUD_RUN_SERVICE_URL_ENV]?.trim();
  return url || null;
}

export function isCloudRunUrlConfigured(): boolean {
  return Boolean(getCloudRunServiceUrl());
}

export const NEXT_SCHEDULED_RUN_LABEL = '毎日 9:00 JST (Asia/Tokyo)';

/** Cloud Logging フィルタ（値のみ表示可 — ログ本文は UI に出さない） */
export const CLOUD_LOGGING_FILTER = `resource.type="cloud_run_revision"
resource.labels.service_name="${CLOUD_RUN_SERVICE_NAME}"
textPayload:"[daily30-cloud]"`;

export const CLOUD_LOGGING_FILTER_ONE_LINE = `resource.type="cloud_run_revision" resource.labels.service_name="${CLOUD_RUN_SERVICE_NAME}" textPayload:"[daily30-cloud]"`;

export const REQUIRED_GCP_APIS = [
  'run.googleapis.com',
  'cloudscheduler.googleapis.com',
  'artifactregistry.googleapis.com',
  'storage.googleapis.com',
  'secretmanager.googleapis.com',
  'cloudbuild.googleapis.com',
] as const;
