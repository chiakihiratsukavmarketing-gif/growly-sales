import { loadEnv } from '../config/env.js';
import { loadLeadsFromJson } from '../storage/jsonLeadRepository.js';
import { getLeadsJsonPath } from '../config/paths.js';
import { loadExternalCandidatesFromJson } from '../storage/externalCandidatesRepository.js';
import { buildDaily30Dashboard } from '../candidates/buildDaily30Dashboard.js';
import { buildDaily30DraftPipelineProgress } from '../candidates/buildDaily30DraftPipelineProgress.js';
import {
  importDaily30DraftCandidatesBulk,
  selectDaily30ReadyForDraftImportCandidates,
} from '../workflow/importDaily30DraftCandidates.js';
import {
  IMPORT_DAILY_30_DRAFT_CANDIDATES_CONFIRM_TOKEN,
  IMPORT_DAILY_30_DRAFT_CANDIDATES_PROMPT,
} from './externalCandidateCliTokens.js';
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

async function promptBulkImportConfirmation(): Promise<boolean> {
  const rl = readline.createInterface({ input, output });
  try {
    const answer = await rl.question(`${IMPORT_DAILY_30_DRAFT_CANDIDATES_PROMPT}\n> `);
    return answer.trim() === IMPORT_DAILY_30_DRAFT_CANDIDATES_CONFIRM_TOKEN;
  } finally {
    rl.close();
  }
}

async function main(): Promise<void> {
  console.log('Growly Sales — Daily 30 Draft Import (Phase 25)');
  console.log('==============================================');
  console.log('※ ready_for_draft 候補を leads.json に取り込みます');
  console.log('※ Gmail送信・下書き作成は行いません（CREATE_DRAFTS は別途）');
  console.log('');

  loadEnv();
  const [candidates, leads] = await Promise.all([
    loadExternalCandidatesFromJson(),
    loadLeadsFromJson(getLeadsJsonPath()),
  ]);

  const targets = selectDaily30ReadyForDraftImportCandidates(candidates);
  const dashboard = buildDaily30Dashboard(candidates, leads);
  const pipeline = buildDaily30DraftPipelineProgress(candidates, leads, dashboard.batchId);

  console.log(`バッチ: ${dashboard.batchId}`);
  console.log(`取り込み対象: ${targets.length} 件`);
  console.log(pipeline.todayProgressLabel);
  console.log('');

  if (targets.length === 0) {
    console.log('取り込み対象がありません。先に GENERATE_DAILY_30_COPY で ready_for_draft を作成してください。');
    return;
  }

  console.log(IMPORT_DAILY_30_DRAFT_CANDIDATES_PROMPT);
  console.log(`一括取り込みには ${IMPORT_DAILY_30_DRAFT_CANDIDATES_CONFIRM_TOKEN} の入力が必要です。`);
  console.log('');

  const confirmed = await promptBulkImportConfirmation();
  if (!confirmed) {
    console.log('キャンセルしました。leads.json は変更されていません。');
    return;
  }

  console.log('');
  console.log('一括取り込みを開始します…');

  const result = await importDaily30DraftCandidatesBulk({
    confirmToken: IMPORT_DAILY_30_DRAFT_CANDIDATES_CONFIRM_TOKEN,
  });

  console.log('');
  console.log('完了');
  console.log(`  取り込み: ${result.imported.length}`);
  console.log(`  スキップ: ${result.skipped.length}`);
  for (const { lead } of result.imported) {
    console.log(`  - ${lead.companyName} (${lead.id})`);
  }
  console.log('');
  console.log('次: UI 下書き候補タブで内容確認 → 承認 → CREATE_DRAFTS');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
