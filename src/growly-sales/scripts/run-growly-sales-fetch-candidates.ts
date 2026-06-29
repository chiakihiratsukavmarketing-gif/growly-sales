import { loadTargetProfile } from '../config/targetProfile.js';
import { loadEnv, isExternalFetchConfigured } from '../config/env.js';
import { fetchExternalLeadCandidates } from '../adapters/fetchExternalLeadCandidates.js';
import { loadLeadsFromJson } from '../storage/jsonLeadRepository.js';
import { getLeadsJsonPath, getInputSitesCsvPath } from '../config/paths.js';
import {
  loadExternalCandidatesFromJson,
  persistExternalCandidates,
} from '../storage/externalCandidatesRepository.js';
import { buildCandidateCollectionPlan } from '../candidates/buildCandidateCollectionPlan.js';
import { CANDIDATE_FETCH_MAX_QUERIES } from '../candidates/candidateCollectionConfig.js';
import { promptFetchCandidatesConfirmation } from './run-growly-sales-external-fetch.js';
import { FETCH_CANDIDATES_CONFIRM_TOKEN } from './externalCandidateCliTokens.js';

async function main(): Promise<void> {
  console.log('Growly Sales — Fetch Candidates (Phase 21)');
  console.log('==========================================');
  console.log('※ Google Places / Web Search API のみ。送信・Lead自動化は行いません。');
  console.log('※ Google Maps画面スクレイピングは行いません。');
  console.log('');

  const env = loadEnv();
  const leads = await loadLeadsFromJson(getLeadsJsonPath());
  const profile = await loadTargetProfile();
  const plan = buildCandidateCollectionPlan(
    profile,
    env,
    leads.length,
    getLeadsJsonPath(),
    getInputSitesCsvPath()
  );

  console.log('--- 取得予定 ---');
  console.log(`  目標: ${plan.targetCount}件 / 現在Lead: ${plan.currentLeadCount}件 / 残枠: ${plan.remainingToTarget}件`);
  console.log(`  エリア: ${plan.targetAreas.join(' / ')}`);
  console.log(`  業種: ${plan.targetCategories.join(' / ')}`);
  console.log(`  クエリ数: 最大 ${plan.maxQueries}`);
  console.log(`  保存先: ${plan.savePaths.externalJson}`);
  console.log(`  Places: ${plan.apis.placesConfigured ? '利用可' : '未設定'}`);
  console.log(`  Web Search: ${plan.apis.webSearchConfigured ? '利用可' : '未設定'}`);
  console.log('');

  console.log(`実取得には ${FETCH_CANDIDATES_CONFIRM_TOKEN} の入力が必要です。`);
  console.log('');

  if (!isExternalFetchConfigured()) {
    console.error('スキップ: 外部API取得の条件を満たしていません。');
    console.error('  - GOOGLE_PLACES_API_KEY または WEB_SEARCH_API_KEY + WEB_SEARCH_ENGINE_ID');
    console.error('  - API_PRODUCTION_ENABLED=true');
    console.error('');
    console.error('dry-run のみ: npm run growly-sales:candidates-preview');
    process.exit(1);
  }

  const confirmed = await promptFetchCandidatesConfirmation();
  if (!confirmed) {
    console.log('');
    console.log('キャンセルしました。外部APIは呼び出されていません。');
    return;
  }

  const existing = await loadExternalCandidatesFromJson();

  console.log('');
  console.log('外部API取得を開始します…');

  const { candidates, stats } = await fetchExternalLeadCandidates(
    profile,
    leads,
    existing,
    {
      maxQueries: CANDIDATE_FETCH_MAX_QUERIES,
      maxNewCandidates: plan.remainingToTarget,
    }
  );

  const mergedMap = new Map(existing.map((c) => [c.externalCandidateId, c]));
  for (const c of candidates) {
    mergedMap.set(c.externalCandidateId, c);
  }
  const merged = Array.from(mergedMap.values());

  await persistExternalCandidates(merged);

  console.log('');
  console.log(`クエリ数: ${stats.queries}`);
  console.log(`Places結果: ${stats.placesResults} / Web結果: ${stats.webResults}`);
  console.log(
    `候補数: ${stats.candidates}（重複: ${stats.duplicates} / 要レビュー: ${stats.needsReview} / 上限defer: ${stats.deferredByLimit}）`
  );
  console.log('');
  console.log('保存完了: data/growly-sales/external-candidates.json / .csv');
  console.log('監査: npm run growly-sales:candidates-audit');
  console.log('次: UIで approved_for_import → npm run growly-sales:external-import-approved');
}

const isDirectRun =
  process.argv[1] &&
  (process.argv[1].endsWith('run-growly-sales-fetch-candidates.ts') ||
    process.argv[1].endsWith('run-growly-sales-fetch-candidates.js'));

if (isDirectRun) {
  main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
