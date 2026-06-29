import { loadTargetProfile } from '../config/targetProfile.js';
import { loadEnv, isExternalFetchConfigured } from '../config/env.js';
import { fetchDaily30Candidates } from '../candidates/fetchDaily30Candidates.js';
import { loadLeadsFromJson } from '../storage/jsonLeadRepository.js';
import { getLeadsJsonPath } from '../config/paths.js';
import {
  loadExternalCandidatesFromJson,
  persistExternalCandidates,
} from '../storage/externalCandidatesRepository.js';
import { buildDaily30Dashboard } from '../candidates/buildDaily30Dashboard.js';
import { FETCH_DAILY_30_CONFIRM_TOKEN, FETCH_DAILY_30_PROMPT } from './externalCandidateCliTokens.js';
import { promptFetchDaily30Confirmation } from './daily30CliPrompt.js';

async function main(): Promise<void> {
  console.log('Growly Sales — Daily 30 Fetch (Phase 23)');
  console.log('========================================');
  console.log('※ Google Places / Web Search + 公開サイトメール確認');
  console.log('※ Gmail送信・下書き作成は行いません');
  console.log('');

  loadEnv();
  const leads = await loadLeadsFromJson(getLeadsJsonPath());
  const profile = await loadTargetProfile();
  const existing = await loadExternalCandidatesFromJson();

  if (!isExternalFetchConfigured()) {
    console.error('スキップ: 外部API取得の条件を満たしていません。');
    console.error('  - GOOGLE_PLACES_API_KEY または WEB_SEARCH_API_KEY + WEB_SEARCH_ENGINE_ID');
    console.error('  - API_PRODUCTION_ENABLED=true');
    console.error('');
    console.error('dry-run: npm run growly-sales:daily30-preview');
    process.exit(1);
  }

  console.log(FETCH_DAILY_30_PROMPT);
  console.log(`実取得には ${FETCH_DAILY_30_CONFIRM_TOKEN} の入力が必要です。`);
  console.log('');

  const confirmed = await promptFetchDaily30Confirmation();
  if (!confirmed) {
    console.log('キャンセルしました。外部APIは呼び出されていません。');
    return;
  }

  console.log('');
  console.log('Daily 30 収集を開始します…');

  const { candidates, stats } = await fetchDaily30Candidates(profile, leads, existing, {
    verifyEmails: true,
  });

  await persistExternalCandidates(candidates);

  const dashboard = buildDaily30Dashboard(candidates, leads, stats.batchId);

  console.log('');
  console.log(`バッチ: ${stats.batchId}`);
  console.log(`クエリ: ${stats.queriesRun} / Places: ${stats.placesResults} / Web: ${stats.webResults}`);
  console.log(
    `新規受理: ${stats.acceptedNew} / 重複: ${stats.duplicates} / メール確認: ${stats.emailChecksRun}`
  );
  console.log(`メールあり: ${stats.emailFound} / なし: ${stats.emailNotFound}`);
  console.log(`使用エリア: ${stats.areasUsed.join(' → ')}`);
  console.log('');
  console.log('--- ダッシュボード ---');
  console.log(`  本日収集: ${dashboard.collectedToday}/${dashboard.target}`);
  console.log(`  宮城/福島/北関東: ${dashboard.miyagiCount}/${dashboard.fukushimaCount}/${dashboard.northKantoCount}`);
  console.log(`  不足: ${dashboard.shortfall} / 次: ${dashboard.nextExploreArea}`);
  console.log('');
  console.log('保存完了: data/growly-sales/external-candidates.json');
  console.log('プレビュー: npm run growly-sales:daily30-preview');
}

const isDirectRun =
  process.argv[1] &&
  (process.argv[1].endsWith('run-growly-sales-daily30-fetch.ts') ||
    process.argv[1].endsWith('run-growly-sales-daily30-fetch.js'));

if (isDirectRun) {
  main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
