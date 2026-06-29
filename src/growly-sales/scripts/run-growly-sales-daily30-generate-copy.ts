import { loadEnv } from '../config/env.js';
import { loadLeadsFromJson } from '../storage/jsonLeadRepository.js';
import { getLeadsJsonPath } from '../config/paths.js';
import { loadExternalCandidatesFromJson } from '../storage/externalCandidatesRepository.js';
import { buildDaily30Dashboard } from '../candidates/buildDaily30Dashboard.js';
import { runDaily30CopyPipeline } from '../candidates/runDaily30CopyPipeline.js';
import {
  GENERATE_DAILY_30_COPY_CONFIRM_TOKEN,
  GENERATE_DAILY_30_COPY_PROMPT,
} from './externalCandidateCliTokens.js';
import { promptGenerateDaily30CopyConfirmation } from './daily30CopyCliPrompt.js';
import { selectDaily30CopyPipelineTargets } from '../candidates/selectDaily30LeadCandidates.js';

async function main(): Promise<void> {
  console.log('Growly Sales — Daily 30 Copy Generation (Phase 24)');
  console.log('====================================================');
  console.log('※ 承認済み候補に営業文を生成し品質チェックします');
  console.log('※ Gmail送信・下書き作成は行いません');
  console.log('※ leads.json への取り込みは行いません');
  console.log('');

  loadEnv();
  const [candidates, leads] = await Promise.all([
    loadExternalCandidatesFromJson(),
    loadLeadsFromJson(getLeadsJsonPath()),
  ]);

  const targets = selectDaily30CopyPipelineTargets(candidates);
  const dashboard = buildDaily30Dashboard(candidates, leads);

  console.log(`バッチ: ${dashboard.batchId}`);
  console.log(`営業文生成対象: ${targets.length} 件`);
  console.log(`Lead化承認待ち: ${dashboard.leadApprovalPendingCount} 件`);
  console.log('');

  if (targets.length === 0) {
    console.log('対象候補がありません。先に Lead 化承認（approved_for_lead）を行ってください。');
    return;
  }

  console.log(GENERATE_DAILY_30_COPY_PROMPT);
  console.log(`実行には ${GENERATE_DAILY_30_COPY_CONFIRM_TOKEN} の入力が必要です。`);
  console.log('');

  const confirmed = await promptGenerateDaily30CopyConfirmation();
  if (!confirmed) {
    console.log('キャンセルしました。営業文は生成されていません。');
    return;
  }

  console.log('');
  console.log('営業文生成・品質チェックを開始します…');

  const { stats } = await runDaily30CopyPipeline();
  const afterDashboard = buildDaily30Dashboard(
    await loadExternalCandidatesFromJson(),
    leads
  );

  console.log('');
  console.log('完了');
  console.log(`  処理: ${stats.processed}`);
  console.log(`  生成: ${stats.generated}`);
  console.log(`  品質チェック通過 (ready_for_draft): ${stats.passed}`);
  console.log(`  needs_review: ${stats.needsReview}`);
  console.log(`  excluded: ${stats.excluded}`);
  console.log('');
  console.log(`ready_for_draft 合計: ${afterDashboard.readyForDraftCount}`);
  console.log(`次にやること: ${afterDashboard.nextAction}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
