import { loadEnv } from '../config/env.js';
import {
  assertDaily30CloudToken,
  getDaily30CloudRunToken,
  isDaily30CloudRunTokenConfigured,
} from '../config/daily30CloudAuth.js';
import { runDaily30CloudAutoFetch } from '../candidates/runDaily30CloudAutoFetch.js';

async function main(): Promise<void> {
  console.log('Growly Sales — Cloud Daily 30 Dry Run (Phase 27)');
  console.log('==================================================');
  console.log('※ 外部通信・保存は行いません');
  console.log('');

  loadEnv();

  if (!isDaily30CloudRunTokenConfigured()) {
    console.log('注意: DAILY30_CLOUD_RUN_TOKEN 未設定（dry-run はローカル確認用に実行します）');
  } else {
    const token = getDaily30CloudRunToken();
    assertDaily30CloudToken(token);
  }

  const result = await runDaily30CloudAutoFetch({ dryRun: true, force: false });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
