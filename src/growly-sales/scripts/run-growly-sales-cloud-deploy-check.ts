import { loadEnv } from '../config/env.js';
import {
  CLOUD_RUN_SERVICE_NAME,
  GCP_PROJECT_ID,
  GCP_REGION,
  GCS_BUCKET_NAME,
  GCS_OBJECT_PREFIX,
  getArtifactRegistryImageUri,
  REQUIRED_GCP_APIS,
  SCHEDULER_CRON,
  SCHEDULER_JOB_NAME,
  SCHEDULER_TARGET_PATH,
  SCHEDULER_TIMEZONE,
  SECRET_DAILY30_TOKEN,
  SECRET_PLACES_API_KEY,
} from '../config/cloudDeployConfig.js';
import { describeStorageBackendStatus } from '../config/storageBackend.js';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getProjectRoot } from '../config/paths.js';

async function main(): Promise<void> {
  console.log('Growly Sales — Cloud Deploy Readiness Check (Phase 29)');
  console.log('======================================================');
  console.log('※ gcloud 実行・実デプロイは行いません');
  console.log('');

  loadEnv();

  const root = getProjectRoot();
  const dockerfile = await readFile(join(root, 'Dockerfile'), 'utf-8');
  const dockerignore = await readFile(join(root, '.dockerignore'), 'utf-8');

  const checks: Array<{ name: string; ok: boolean; detail: string }> = [];

  checks.push({
    name: 'Dockerfile',
    ok: dockerfile.includes('growly-sales:ui:build') && !dockerfile.includes('.env'),
    detail: 'UI build + no .env COPY',
  });
  checks.push({
    name: '.dockerignore',
    ok: dockerignore.includes('.env') && dockerignore.includes('credentials'),
    detail: 'secrets excluded',
  });
  checks.push({
    name: 'GCP project',
    ok: GCP_PROJECT_ID === 'growly-scheduler',
    detail: GCP_PROJECT_ID,
  });
  checks.push({
    name: 'Artifact Registry image URI',
    ok: getArtifactRegistryImageUri().includes('asia-northeast1-docker.pkg.dev'),
    detail: getArtifactRegistryImageUri(),
  });
  checks.push({
    name: 'GCS bucket name',
    ok: GCS_BUCKET_NAME === 'growly-sales-daily30',
    detail: GCS_BUCKET_NAME,
  });
  checks.push({
    name: 'GCS prefix',
    ok: GCS_OBJECT_PREFIX === 'prod/growly-sales',
    detail: GCS_OBJECT_PREFIX,
  });
  checks.push({
    name: 'Scheduler cron',
    ok: SCHEDULER_CRON === '0 9 * * *' && SCHEDULER_TIMEZONE === 'Asia/Tokyo',
    detail: `${SCHEDULER_CRON} ${SCHEDULER_TIMEZONE}`,
  });
  checks.push({
    name: 'Scheduler target path',
    ok: SCHEDULER_TARGET_PATH === '/api/cloud/daily30/auto-fetch',
    detail: SCHEDULER_TARGET_PATH,
  });
  checks.push({
    name: 'Secret names (not values)',
    ok: SECRET_DAILY30_TOKEN === 'daily30-cloud-run-token',
    detail: `${SECRET_DAILY30_TOKEN}, ${SECRET_PLACES_API_KEY}`,
  });
  checks.push({
    name: 'Cloud Run service name',
    ok: CLOUD_RUN_SERVICE_NAME === 'growly-sales-daily30',
    detail: CLOUD_RUN_SERVICE_NAME,
  });

  const storage = describeStorageBackendStatus();
  checks.push({
    name: 'Storage backend (local default OK)',
    ok: storage.backend === 'local' || storage.backend === 'gcs',
    detail: `${storage.backend}`,
  });

  checks.push({
    name: 'Required GCP APIs list',
    ok: REQUIRED_GCP_APIS.length >= 6,
    detail: REQUIRED_GCP_APIS.join(', '),
  });

  const deployDoc = await readFile(
    join(root, 'docs/GROWLY_SALES_CLOUD_SCHEDULER_DEPLOY.md'),
    'utf-8'
  );
  checks.push({
    name: 'Deploy documentation',
    ok: deployDoc.includes('growly-daily30-auto-fetch-9am') && !deployDoc.includes('refresh_token'),
    detail: 'docs present, no Gmail refresh_token',
  });

  for (const c of checks) {
    console.log(`${c.ok ? 'OK' : 'NG'} ${c.name}: ${c.detail}`);
  }

  const failed = checks.filter((c) => !c.ok);
  if (failed.length > 0) {
    process.exit(1);
  }

  console.log('');
  console.log('Deploy readiness check passed.');
  console.log(`次: Cloud Shell で scripts/cloud/growly-daily30/deploy-all.sh を実行`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
