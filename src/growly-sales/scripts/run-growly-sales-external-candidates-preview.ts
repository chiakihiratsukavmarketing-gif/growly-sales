import { loadTargetProfile } from '../config/targetProfile.js';
import { buildLeadSearchQueries, describeSearchQueryPlan } from '../adapters/buildLeadSearchQueries.js';
import { buildExternalPreviewSample } from '../adapters/fetchExternalLeadCandidates.js';
import { loadEnv } from '../config/env.js';

async function main(): Promise<void> {
  console.log('Growly Sales — External Candidates Preview (dry-run)');
  console.log('====================================================');
  console.log('※ 外部APIには接続しません。leads.json / sendStatus は変更しません。');
  console.log('');

  const profile = await loadTargetProfile();
  const env = loadEnv();
  const plan = describeSearchQueryPlan(profile);
  const queries = buildLeadSearchQueries(profile);

  console.log('--- 検索クエリ（targetProfile から生成） ---');
  for (const q of queries) {
    console.log(`  - ${q}`);
  }
  console.log('');
  console.log(`クエリ数: ${plan.queries.length} / 1クエリあたり最大 ${plan.maxResultsPerQuery} 件`);
  console.log(`Places API: ${env.isPlacesConfigured ? 'キー設定あり（本previewでは未使用）' : '未設定 → dry-run'}`);
  console.log(
    `Web Search API: ${env.isWebSearchConfigured ? 'キー設定あり（本previewでは未使用）' : '未設定 → dry-run'}`
  );
  console.log('');

  console.log('--- 取得候補の想定構造（サンプル） ---');
  const samples = buildExternalPreviewSample(profile);
  for (const sample of samples) {
    console.log('');
    console.log(`会社名: ${sample.companyName}`);
    console.log(`地域: ${sample.area} / 業種: ${sample.industry}`);
    console.log(`websiteUrl: ${sample.websiteUrl ?? '（なし → needs_review）'}`);
    console.log(`sourceType: ${sample.sourceType}`);
    console.log(`sourceQuery: ${sample.sourceQuery}`);
    console.log(`confidenceScore: ${sample.confidenceScore}`);
    console.log(`importStatus: ${sample.importStatus}`);
    console.log(`riskLevel: ${sample.riskLevel}`);
  }

  console.log('');
  console.log(plan.note);
  console.log('');
  console.log('保存先（実取得時）: data/growly-sales/external-candidates.json / .csv');
  console.log('実取得: npm run growly-sales:external-fetch（FETCH_CANDIDATES 確認必須）');
  console.log('取り込み: npm run growly-sales:external-import-approved（人間承認後）');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
