import { loadEnv } from '../config/env.js';
import {
  assertGcsStorageConfigured,
  describeStorageBackendStatus,
  isGcsStorageBackend,
} from '../config/storageBackend.js';
import {
  DAILY30_CLOUD_RUN_STATE_JSON,
  EXTERNAL_CANDIDATES_JSON,
} from '../storage/jsonDocumentNames.js';
import { jsonDocumentExists, readJsonDocument } from '../storage/jsonDocumentStorage.js';

async function main(): Promise<void> {
  console.log('Growly Sales — GCS Storage Check (Phase 28 dry-run)');
  console.log('==================================================');
  console.log('※ 書き込みは行いません');
  console.log('');

  loadEnv();

  const status = describeStorageBackendStatus();
  console.log('Storage backend:', status.backend);
  if (status.backend !== 'gcs') {
    console.log('');
    console.log('GROWLY_STORAGE_BACKEND が gcs ではありません。');
    console.log('GCS 接続確認を行うには GROWLY_STORAGE_BACKEND=gcs を設定してください。');
    process.exit(0);
  }

  assertGcsStorageConfigured();
  console.log('GCS bucket:', status.gcsBucket);
  console.log('GCS prefix:', status.gcsPrefix);
  console.log('external-candidates:', status.externalCandidatesUri);
  console.log('cloud-run-state:', status.cloudRunStateUri);
  console.log('');

  const checks: Array<{ name: string; ok: boolean; detail: string }> = [];

  for (const doc of [EXTERNAL_CANDIDATES_JSON, DAILY30_CLOUD_RUN_STATE_JSON] as const) {
    try {
      const exists = await jsonDocumentExists(doc);
      const raw = await readJsonDocument(doc);
      let parsed = false;
      if (raw) {
        JSON.parse(raw);
        parsed = true;
      }
      checks.push({
        name: doc,
        ok: true,
        detail: exists
          ? parsed
            ? 'exists, JSON parse OK'
            : 'exists, empty'
          : 'not found (empty initial state OK)',
      });
    } catch (err) {
      checks.push({
        name: doc,
        ok: false,
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }

  for (const c of checks) {
    console.log(`${c.ok ? 'OK' : 'NG'} ${c.name}: ${c.detail}`);
  }

  const allOk = checks.every((c) => c.ok);
  if (!allOk) {
    process.exit(1);
  }

  console.log('');
  console.log('GCS storage dry-run check passed (read-only).');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
