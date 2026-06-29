import { createInterface } from 'node:readline';
import { importApprovedExternalCandidates } from '../workflow/importApprovedExternalCandidates.js';
import { loadExternalCandidatesFromJson } from '../storage/externalCandidatesRepository.js';

import { IMPORT_APPROVED_CONFIRM_TOKEN } from './externalCandidateCliTokens.js';

export { IMPORT_APPROVED_CONFIRM_TOKEN };

async function promptImportConfirmation(count: number): Promise<boolean> {
  console.log('');
  console.log(
    `承認済み外部候補 ${count} 件を input-sites.csv に追記します。Leadには直接書き込みません。続行するには ${IMPORT_APPROVED_CONFIRM_TOKEN} と入力してください。`
  );

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>((resolve) => {
    rl.question('> ', resolve);
  });
  rl.close();
  return answer.trim() === IMPORT_APPROVED_CONFIRM_TOKEN;
}

async function main(): Promise<void> {
  console.log('Growly Sales — Import Approved External Candidates');
  console.log('===================================================');
  console.log('※ leads.json には直接書き込みません。input-sites.csv に追記後、day1 を実行してください。');
  console.log('');

  const candidates = await loadExternalCandidatesFromJson();
  const approved = candidates.filter((c) => c.importStatus === 'approved_for_import');

  if (approved.length === 0) {
    console.log('取り込み対象（approved_for_import）の候補がありません。');
    console.log('  UIの「営業候補」タブで個別に取り込み承認するか、');
    console.log('  external-candidates.json の importStatus を approved_for_import に変更してください。');
    return;
  }

  console.log('取り込み候補:');
  for (const c of approved) {
    console.log(`  - ${c.companyName} (${c.websiteUrl})`);
  }

  const confirmed = await promptImportConfirmation(approved.length);
  if (!confirmed) {
    console.log('');
    console.log('キャンセルしました。input-sites.csv は変更されていません。');
    return;
  }

  const result = await importApprovedExternalCandidates({ onlyApproved: true });

  console.log('');
  console.log(`取り込み完了: ${result.imported.length} 件 → ${result.inputSitesPath}`);
  if (result.skipped.length > 0) {
    console.log(`スキップ: ${result.skipped.length} 件`);
    for (const s of result.skipped.slice(0, 10)) {
      console.log(`  - ${s.candidate.companyName}: ${s.reason}`);
    }
  }
  console.log('');
  console.log('次: npm run growly-sales:day1 で公式サイト解析');
}

const isDirectRunImport =
  process.argv[1] &&
  (process.argv[1].endsWith('run-growly-sales-import-approved-candidates.ts') ||
    process.argv[1].endsWith('run-growly-sales-import-approved-candidates.js'));

if (isDirectRunImport) {
  main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
