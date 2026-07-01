import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { ensureProjectEnvLoaded } from './env.js';

export interface GcsAuthDiagnostics {
  adcCredentialFileFound: boolean;
  adcCredentialFileLabel: string | null;
  googleApplicationCredentialsSet: boolean;
  googleApplicationCredentialsFileExists: boolean;
  gcloudCliAvailable: boolean;
  projectIdEnvSet: boolean;
  recommendedAction: string;
}

function adcCandidatePaths(): string[] {
  const paths: string[] = [];
  if (process.env.APPDATA) {
    paths.push(join(process.env.APPDATA, 'gcloud', 'application_default_credentials.json'));
  }
  paths.push(join(homedir(), '.config', 'gcloud', 'application_default_credentials.json'));
  return paths;
}

function isGcloudCliAvailable(): boolean {
  try {
    execSync('gcloud --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** Secret の中身は返さない。ADC / サービスアカウント鍵の有無のみ。 */
export function diagnoseGcsAuth(): GcsAuthDiagnostics {
  ensureProjectEnvLoaded();

  let adcCredentialFileFound = false;
  let adcCredentialFileLabel: string | null = null;
  for (const p of adcCandidatePaths()) {
    if (existsSync(p)) {
      adcCredentialFileFound = true;
      adcCredentialFileLabel = p.includes('AppData')
        ? '%APPDATA%/gcloud/application_default_credentials.json'
        : '~/.config/gcloud/application_default_credentials.json';
      break;
    }
  }

  const saPath = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim() ?? '';
  const googleApplicationCredentialsSet = Boolean(saPath);
  const googleApplicationCredentialsFileExists = saPath ? existsSync(saPath) : false;

  const projectIdEnvSet = Boolean(
    process.env.GOOGLE_CLOUD_PROJECT?.trim() || process.env.GCLOUD_PROJECT?.trim()
  );

  const gcloudCliAvailable = isGcloudCliAvailable();

  let recommendedAction =
    'gcloud CLI をインストールし、gcloud auth application-default login を実行してください。';
  if (gcloudCliAvailable && !adcCredentialFileFound && !googleApplicationCredentialsFileExists) {
    recommendedAction = 'gcloud auth application-default login を実行してください。';
  } else if (googleApplicationCredentialsSet && !googleApplicationCredentialsFileExists) {
    recommendedAction =
      'GOOGLE_APPLICATION_CREDENTIALS で指定したサービスアカウント鍵ファイルのパスを確認してください。';
  } else if (adcCredentialFileFound || googleApplicationCredentialsFileExists) {
    recommendedAction =
      '認証情報は見つかりました。バケット権限（roles/storage.objectViewer または storage.objectUser）と project ID を確認してください。';
  }

  return {
    adcCredentialFileFound,
    adcCredentialFileLabel,
    googleApplicationCredentialsSet,
    googleApplicationCredentialsFileExists,
    gcloudCliAvailable,
    projectIdEnvSet,
    recommendedAction,
  };
}

export function formatGcsAuthDiagnosticsSummary(diag: GcsAuthDiagnostics): string[] {
  const lines: string[] = [];
  lines.push(`ADC 認証ファイル: ${diag.adcCredentialFileFound ? 'あり' : 'なし'}`);
  if (diag.adcCredentialFileLabel) {
    lines.push(`  場所: ${diag.adcCredentialFileLabel}`);
  }
  lines.push(`gcloud CLI: ${diag.gcloudCliAvailable ? '利用可能' : '未インストール / PATH外'}`);
  lines.push(
    `GOOGLE_APPLICATION_CREDENTIALS: ${
      diag.googleApplicationCredentialsSet
        ? diag.googleApplicationCredentialsFileExists
          ? '設定済み（ファイルあり）'
          : '設定済み（ファイル未検出）'
        : '未設定'
    }`
  );
  lines.push(`GOOGLE_CLOUD_PROJECT / GCLOUD_PROJECT: ${diag.projectIdEnvSet ? '設定あり' : '未設定'}`);
  lines.push(`推奨: ${diag.recommendedAction}`);
  return lines;
}
