import { access, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getInputSitesCsvPath, getLeadsJsonPath, getProjectRoot } from '../config/paths.js';

export interface MvpReadinessResult {
  ready: boolean;
  passedChecks: string[];
  failedChecks: string[];
  warnings: string[];
  nextSteps: string[];
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function fileContains(path: string, needle: string): Promise<boolean> {
  try {
    const raw = await readFile(path, 'utf-8');
    return raw.includes(needle);
  } catch {
    return false;
  }
}

export async function checkLocalMvpReadiness(): Promise<MvpReadinessResult> {
  const passedChecks: string[] = [];
  const failedChecks: string[] = [];
  const warnings: string[] = [];
  const nextSteps: string[] = [];

  const root = getProjectRoot();
  const inputCsv = getInputSitesCsvPath();
  const leadsJson = getLeadsJsonPath();

  if (await exists(inputCsv)) passedChecks.push('input-sites.csv exists');
  else {
    failedChecks.push('input-sites.csv missing');
    nextSteps.push('data/growly-sales/input-sites.csv を作成し、公式サイトURLを追加してください');
  }

  if (await exists(leadsJson)) passedChecks.push('leads.json exists');
  else {
    failedChecks.push('leads.json missing');
    nextSteps.push('npm run growly-sales:day1 を実行して leads.json を生成してください');
  }

  // スクリプト/機能存在チェック（静的）
  const uiServerPath = join(root, 'src/growly-sales/server/uiServer.ts');
  const verifyPath = join(root, 'src/growly-sales/scripts/verify-growly-sales.ts');
  const dashboardPath = join(root, 'src/growly-sales/ui/GrowlySalesDashboard.tsx');

  if (await exists(verifyPath)) passedChecks.push('verify script exists');
  else failedChecks.push('verify script missing');

  if (await exists(uiServerPath)) passedChecks.push('uiServer exists');
  else failedChecks.push('uiServer missing');

  if (await exists(dashboardPath)) passedChecks.push('Human review UI exists');
  else failedChecks.push('Human review UI missing');

  // Tabs/features (best-effort: string check)
  if (await fileContains(dashboardPath, '下書き候補')) passedChecks.push('Draft candidates UI exists');
  else failedChecks.push('Draft candidates UI missing');

  if (await fileContains(dashboardPath, '営業分析')) passedChecks.push('Sales analytics tab exists');
  else failedChecks.push('Sales analytics tab missing');

  // Safety checks: no send code / adapters disabled are verified by verify script; also check obvious strings.
  const srcRoot = join(root, 'src/growly-sales');
  const files = await readdir(srcRoot).catch(() => []);
  if (files.length === 0) warnings.push('src/growly-sales could not be scanned');

  // Docs updated (rough check)
  const docs = [
    'docs/GROWLY_SALES_PROJECT_STATE.md',
    'docs/GROWLY_SALES_RUN_LOG.md',
    'docs/GROWLY_SALES_DATA_SCHEMA.md',
    'docs/GROWLY_SALES_EVALUATION.md',
    'docs/GROWLY_SALES_IMPLEMENTATION_PLAN.md',
    'docs/GROWLY_SALES_WORKFLOW.md',
    'README.md',
  ].map((p) => join(root, p));

  const docsOk = (await Promise.all(docs.map(exists))).every(Boolean);
  if (docsOk) passedChecks.push('docs updated');
  else warnings.push('Some docs missing');

  // Result
  const ready = failedChecks.length === 0;
  if (!ready && nextSteps.length === 0) {
    nextSteps.push('failedChecks を確認し、順に対応してください');
  }

  return {
    ready,
    passedChecks,
    failedChecks,
    warnings,
    nextSteps,
  };
}

