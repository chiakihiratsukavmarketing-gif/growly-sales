import { createInterface } from 'node:readline';
import { loadTargetProfile } from '../config/targetProfile.js';
import { loadEnv, isExternalFetchConfigured } from '../config/env.js';
import { fetchExternalLeadCandidates } from '../adapters/fetchExternalLeadCandidates.js';
import { loadLeadsFromJson } from '../storage/jsonLeadRepository.js';
import { getLeadsJsonPath } from '../config/paths.js';
import {
  loadExternalCandidatesFromJson,
  persistExternalCandidates,
} from '../storage/externalCandidatesRepository.js';

import { CANDIDATE_FETCH_MAX_QUERIES } from '../candidates/candidateCollectionConfig.js';
import { buildCandidateCollectionPlan } from '../candidates/buildCandidateCollectionPlan.js';
import { getInputSitesCsvPath } from '../config/paths.js';
import { FETCH_CANDIDATES_CONFIRM_TOKEN } from './externalCandidateCliTokens.js';

export { FETCH_CANDIDATES_CONFIRM_TOKEN };

export async function promptFetchCandidatesConfirmation(): Promise<boolean> {
  console.log('');
  console.log(
    '外部APIを使用して営業候補を取得します。送信はしません。続行するには FETCH_CANDIDATES と入力してください。'
  );

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>((resolve) => {
    rl.question('> ', resolve);
  });
  rl.close();
  return answer.trim() === FETCH_CANDIDATES_CONFIRM_TOKEN;
}

async function main(): Promise<void> {
  console.log('Growly Sales — External Candidates Fetch');
  console.log('=========================================');
  console.log('※ Google Places / Web Search API のみ。送信・Lead自動化は行いません。');
  console.log('');

  const env = loadEnv();
  if (!isExternalFetchConfigured()) {
    console.error('スキップ: 外部API取得の条件を満たしていません。');
    if (!env.isPlacesConfigured && !env.isWebSearchConfigured) {
      console.error('  - GOOGLE_PLACES_API_KEY または WEB_SEARCH_API_KEY + WEB_SEARCH_ENGINE_ID が未設定');
    }
    console.error('  - API_PRODUCTION_ENABLED=true が必要');
    console.error('');
    console.error('preview のみ実行する場合: npm run growly-sales:external-preview');
    process.exit(1);
  }

  const confirmed = await promptFetchCandidatesConfirmation();
  if (!confirmed) {
    console.log('');
    console.log('キャンセルしました。外部APIは呼び出されていません。');
    return;
  }

  const profile = await loadTargetProfile();
  const leads = await loadLeadsFromJson(getLeadsJsonPath());
  const existing = await loadExternalCandidatesFromJson();
  const plan = buildCandidateCollectionPlan(
    profile,
    env,
    leads.length,
    getLeadsJsonPath(),
    getInputSitesCsvPath()
  );

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
  console.log(`候補数: ${stats.candidates}（重複: ${stats.duplicates} / 要レビュー: ${stats.needsReview} / 上限defer: ${stats.deferredByLimit}）`);
  console.log('');
  console.log('保存完了: data/growly-sales/external-candidates.json / .csv');
  console.log('次のステップ: UIまたはJSONで approved_for_import にし、');
  console.log('  npm run growly-sales:external-import-approved を実行');
}

const isDirectRun =
  process.argv[1] &&
  (process.argv[1].endsWith('run-growly-sales-external-fetch.ts') ||
    process.argv[1].endsWith('run-growly-sales-external-fetch.js'));

if (isDirectRun) {
  main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
