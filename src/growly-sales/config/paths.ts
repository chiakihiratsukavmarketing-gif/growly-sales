import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_NAME = 'growly-sales';

/** このモジュールの位置: src/growly-sales/config/paths.ts */
const MODULE_DIR = dirname(fileURLToPath(import.meta.url));

function readPackageName(packageJsonPath: string): string | null {
  try {
    const raw = readFileSync(packageJsonPath, 'utf-8');
    const pkg = JSON.parse(raw) as { name?: string };
    return pkg.name ?? null;
  } catch {
    return null;
  }
}

/**
 * package.json（name=growly-sales）を上方向に探索してプロジェクトルートを返す。
 * process.cwd() には依存しない。
 */
export function findProjectRoot(startDir: string): string {
  let dir = resolve(startDir);

  for (let i = 0; i < 12; i++) {
    const packageJsonPath = join(dir, 'package.json');
    if (existsSync(packageJsonPath) && readPackageName(packageJsonPath) === PACKAGE_NAME) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  // フォールバック: src/growly-sales/config から3階層上
  return resolve(MODULE_DIR, '../../..');
}

let cachedProjectRoot: string | null = null;

export function getProjectRoot(): string {
  if (!cachedProjectRoot) {
    cachedProjectRoot = findProjectRoot(MODULE_DIR);
  }
  return cachedProjectRoot;
}

/** テスト用: キャッシュをリセット */
export function resetProjectRootCache(): void {
  cachedProjectRoot = null;
}

export function getGrowlySalesDataDir(): string {
  return join(getProjectRoot(), 'data', 'growly-sales');
}

export function getLeadsJsonPath(): string {
  return join(getGrowlySalesDataDir(), 'leads.json');
}

export function getLeadsCsvPath(): string {
  return join(getGrowlySalesDataDir(), 'leads.csv');
}

export function getInputSitesCsvPath(): string {
  return join(getGrowlySalesDataDir(), 'input-sites.csv');
}

export function getDraftsDir(): string {
  return join(getGrowlySalesDataDir(), 'drafts');
}

export function getDraftCandidatesJsonPath(): string {
  return join(getDraftsDir(), 'draftCandidates.json');
}

export function getDraftCandidatesCsvPath(): string {
  return join(getDraftsDir(), 'draftCandidates.csv');
}

export function getDraftCopyTxtPath(): string {
  return join(getDraftsDir(), 'draft-copy.txt');
}

export function getConfigRoot(): string {
  return join(getProjectRoot(), 'config', 'growly-sales');
}

export function getExternalCandidatesJsonPath(): string {
  return join(getGrowlySalesDataDir(), 'external-candidates.json');
}

export function getExternalCandidatesCsvPath(): string {
  return join(getGrowlySalesDataDir(), 'external-candidates.csv');
}

export function getDaily30CloudRunStatePath(): string {
  return join(getGrowlySalesDataDir(), 'daily30-cloud-run-state.json');
}

export function getDaily30CollectionSchedulePath(): string {
  return join(getGrowlySalesDataDir(), 'daily30-collection-schedule.json');
}

export function getMailSuppressionsPath(): string {
  return join(getGrowlySalesDataDir(), 'mail-suppressions.json');
}

export function getOutreachTemplatesPath(): string {
  return join(getGrowlySalesDataDir(), 'outreach-templates.json');
}

export function getOutreachTemplateDefaultsPath(): string {
  return join(getConfigRoot(), 'outreach-template-defaults.json');
}

export function getUiDistDir(): string {
  return join(getProjectRoot(), 'dist', 'ui');
}

export function getGrowlySalesPathInfo(): {
  projectRoot: string;
  dataDir: string;
  leadsPath: string;
  draftsDir: string;
  cwd: string;
} {
  return {
    projectRoot: getProjectRoot(),
    dataDir: getGrowlySalesDataDir(),
    leadsPath: getLeadsJsonPath(),
    draftsDir: getDraftsDir(),
    cwd: process.cwd(),
  };
}
