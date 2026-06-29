import { loadTargetProfile } from '../config/targetProfile.js';
import { loadEnv } from '../config/env.js';
import { loadLeadsFromJson } from '../storage/jsonLeadRepository.js';
import { loadExternalCandidatesFromJson } from '../storage/externalCandidatesRepository.js';
import { getLeadsJsonPath, getInputSitesCsvPath } from '../config/paths.js';
import { buildCandidateCollectionPlan } from '../candidates/buildCandidateCollectionPlan.js';
import {
  auditCandidateCollection,
  formatCollectionProgress,
} from '../candidates/auditCandidateCollection.js';
import { buildExternalPreviewSample } from '../adapters/fetchExternalLeadCandidates.js';
import { FETCH_CANDIDATES_PROMPT } from '../candidates/candidateCollectionConfig.js';

async function main(): Promise<void> {
  console.log('Growly Sales — Candidates Preview (Phase 21 dry-run)');
  console.log('==================================================');
  console.log('※ 外部API・Web検索・Google Places には接続しません。');
  console.log('※ leads.json / sendStatus は変更しません。');
  console.log('');

  const profile = await loadTargetProfile();
  const env = loadEnv();
  const leads = await loadLeadsFromJson(getLeadsJsonPath());
  const external = await loadExternalCandidatesFromJson();

  const plan = buildCandidateCollectionPlan(
    profile,
    env,
    leads.length,
    getLeadsJsonPath(),
    getInputSitesCsvPath()
  );
  const audit = auditCandidateCollection(leads, external);

  console.log('--- 30件候補収集プラン ---');
  for (const line of formatCollectionProgress(audit)) {
    console.log(`  ${line}`);
  }
  console.log('');
  console.log(`対象エリア: ${plan.targetAreas.join(' / ')}`);
  console.log(`対象業種: ${plan.targetCategories.join(' / ')}`);
  console.log(`シグナル（参考）: ${plan.targetSignals.join(' / ')}`);
  console.log('');
  console.log('--- 検索クエリ（実fetch時・最大' + plan.maxQueries + '件） ---');
  for (const q of plan.searchQueries) {
    console.log(`  - ${q}`);
  }
  console.log('');
  console.log('--- 使用API（実fetch時） ---');
  console.log(`  API_PRODUCTION_ENABLED: ${plan.apis.productionEnabled ? 'true' : 'false'}`);
  console.log(`  Google Places: ${plan.apis.placesConfigured ? 'キー設定あり' : '未設定'}`);
  console.log(`  Web Search: ${plan.apis.webSearchConfigured ? 'キー設定あり' : '未設定'}`);
  console.log('');
  console.log('--- 保存先 ---');
  console.log(`  外部候補: ${plan.savePaths.externalJson}`);
  console.log(`  外部候補CSV: ${plan.savePaths.externalCsv}`);
  console.log(`  既存Lead: ${plan.savePaths.leadsJson}`);
  console.log(`  取り込み先: ${plan.savePaths.inputSitesCsv}（IMPORT_APPROVED 後）`);
  console.log('');
  console.log('--- 重複排除 ---');
  for (const rule of plan.dedupeRules) {
    console.log(`  - ${rule}`);
  }
  console.log('');
  console.log('--- 件数制限 ---');
  for (const rule of plan.limitRules) {
    console.log(`  - ${rule}`);
  }
  console.log(`  今回の残枠（新規取得上限の目安）: ${plan.remainingToTarget} 件`);
  console.log('');
  console.log('--- 既存Lead（パイロット） ---');
  for (const row of audit.leadRows) {
    console.log(`  ${row.companyName}`);
    console.log(`    website: ${row.websiteUrl}`);
    console.log(`    sourceUrls: ${row.sourceUrls.join(', ') || '（なし）'}`);
    console.log(`    contactForm: ${row.contactFormUrl ?? '—'} / email: ${row.emailCandidates.join(', ') || '—'}`);
    console.log(`    duplicateKey: ${row.duplicateKey}`);
  }
  console.log('');
  if (audit.externalRows.length > 0) {
    console.log('--- 外部候補プール ---');
    for (const row of audit.externalRows) {
      console.log(`  ${row.companyName} [${row.importStatus}] ${row.officialSiteUrl ?? '公式URLなし'}`);
    }
    console.log('');
  }
  console.log('--- 取得候補の想定構造（サンプル・API未使用） ---');
  const samples = buildExternalPreviewSample(profile);
  for (const sample of samples) {
    console.log('');
    console.log(`会社名: ${sample.companyName}`);
    console.log(`地域: ${sample.area} / 業種: ${sample.category}`);
    console.log(`officialSiteUrl: ${sample.officialSiteUrl ?? '（なし → needs_review）'}`);
    console.log(`sourceUrl: ${sample.sourceUrl ?? '—'}`);
    console.log(`duplicateKey: ${sample.duplicateKey}`);
    console.log(`importStatus: ${sample.importStatus}`);
  }
  console.log('');
  console.log('--- ワークフロー ---');
  for (const step of plan.workflowSteps) {
    console.log(`  ${step}`);
  }
  console.log('');
  console.log(`実取得: npm run growly-sales:fetch-candidates`);
  console.log(plan.fetchGate);
  console.log(`（または互換: npm run growly-sales:external-fetch — 同じ ${FETCH_CANDIDATES_PROMPT}）`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
