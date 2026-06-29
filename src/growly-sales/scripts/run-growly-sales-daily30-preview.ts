import { loadTargetProfile } from '../config/targetProfile.js';
import { loadEnv, isExternalFetchConfigured } from '../config/env.js';
import { loadLeadsFromJson } from '../storage/jsonLeadRepository.js';
import { getLeadsJsonPath } from '../config/paths.js';
import { loadExternalCandidatesFromJson } from '../storage/externalCandidatesRepository.js';
import {
  buildDaily30Dashboard,
  describeDaily30AreaExpansion,
} from '../candidates/buildDaily30Dashboard.js';
import { buildDaily30FetchPlan } from '../candidates/fetchDaily30Candidates.js';

async function main(): Promise<void> {
  console.log('Growly Sales — Daily 30 Preview (Phase 23)');
  console.log('==========================================');
  console.log('※ dry-run のみ。外部API・サイト取得は行いません。');
  console.log('');

  loadEnv();
  const leads = await loadLeadsFromJson(getLeadsJsonPath());
  const candidates = await loadExternalCandidatesFromJson();
  const profile = await loadTargetProfile();
  const plan = buildDaily30FetchPlan();
  const dashboard = buildDaily30Dashboard(candidates, leads);

  console.log('--- Daily 30 ダッシュボード（既存データ集計） ---');
  console.log(`  バッチ: ${dashboard.batchId}`);
  console.log(`  目標: ${dashboard.target}件 / 本日収集: ${dashboard.collectedToday}件 / 不足: ${dashboard.shortfall}件`);
  console.log(`  宮城: ${dashboard.miyagiCount} / 福島: ${dashboard.fukushimaCount} / 北関東: ${dashboard.northKantoCount}`);
  console.log(`  メールあり: ${dashboard.withEmailCount} / なし: ${dashboard.withoutEmailCount}`);
  console.log(`  重複除外: ${dashboard.duplicateExcludedCount}`);
  console.log(`  次に探索: ${dashboard.nextExploreArea}`);
  console.log(`  次にやること: ${dashboard.nextAction}`);
  console.log('');
  console.log('--- エリア拡大順 ---');
  console.log(`  ${describeDaily30AreaExpansion()}`);
  console.log('');
  console.log('--- 取得プラン ---');
  console.log(`  対象エリア: ${plan.areas.map((a) => a.prefecture).join(' → ')}`);
  console.log(`  プロファイルエリア: ${profile.defaultAreas.join(' / ')}`);
  console.log(`  外部API: ${isExternalFetchConfigured() ? '利用可' : '未設定'}`);
  console.log('');
  console.log('実取得: npm run growly-sales:daily30-fetch（FETCH_DAILY_30 必須）');
}

const isDirectRun =
  process.argv[1] &&
  (process.argv[1].endsWith('run-growly-sales-daily30-preview.ts') ||
    process.argv[1].endsWith('run-growly-sales-daily30-preview.js'));

if (isDirectRun) {
  main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
