import { loadEnv } from '../config/env.js';
import {
  assertDaily30CloudToken,
  getDaily30CloudRunToken,
  isDaily30CloudRunTokenConfigured,
} from '../config/daily30CloudAuth.js';
import { runDaily30CloudAutoFetch } from '../candidates/runDaily30CloudAutoFetch.js';

function parseArgs(): { force: boolean } {
  const force = process.argv.includes('--force') || process.env.DAILY30_CLOUD_FORCE === 'true';
  return { force };
}

async function main(): Promise<void> {
  console.log('Growly Sales — Cloud Daily 30 Auto Fetch (Phase 27)');
  console.log('====================================================');
  console.log('※ 候補収集のみ。Gmail・営業文・leads.json 取り込みは行いません');
  console.log('');

  loadEnv();

  if (!isDaily30CloudRunTokenConfigured()) {
    console.error('エラー: DAILY30_CLOUD_RUN_TOKEN が未設定です');
    process.exit(1);
  }

  const token = getDaily30CloudRunToken();
  assertDaily30CloudToken(token);

  const { force } = parseArgs();
  if (force) {
    console.log('force=true — 同日二重実行ガードをバイパスします');
  }

  console.log('Cloud Daily 30 自動収集を開始します…');
  const result = await runDaily30CloudAutoFetch({ dryRun: false, force });
  console.log('');
  console.log(JSON.stringify(result, null, 2));

  if (!result.ok && result.mode === 'blocked') {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
