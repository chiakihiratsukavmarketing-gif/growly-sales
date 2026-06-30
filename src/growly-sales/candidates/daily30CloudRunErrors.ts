/**
 * Daily 30 Cloud 自動収集 — 失敗分類と安全なリカバリーメッセージ（Phase 30）
 * Secret / token / API key の値はここにもログにも含めない。
 */

export const DAILY30_CLOUD_ERROR_CODES = [
  'TOKEN_MISSING',
  'TOKEN_INVALID',
  'API_PRODUCTION_DISABLED',
  'GCS_NOT_CONFIGURED',
  'GCS_READ_FAILED',
  'GCS_WRITE_FAILED',
  'PLACES_API_KEY_MISSING',
  'PLACES_API_FAILED',
  'FETCH_FAILED',
  'DUPLICATE_GUARD_ALREADY_RAN',
  'UNKNOWN_ERROR',
] as const;

export type Daily30CloudErrorCode = (typeof DAILY30_CLOUD_ERROR_CODES)[number];

export interface Daily30CloudErrorDefinition {
  errorCode: Daily30CloudErrorCode;
  errorMessageSafe: string;
  recoveryHint: string;
  recoverySteps: string[];
}

const ERROR_DEFINITIONS: Record<Daily30CloudErrorCode, Daily30CloudErrorDefinition> = {
  TOKEN_MISSING: {
    errorCode: 'TOKEN_MISSING',
    errorMessageSafe: 'Cloud 自動収集 API の認証トークンが未設定です',
    recoveryHint:
      'DAILY30_CLOUD_RUN_TOKEN が Cloud Run 環境変数 / Secret Manager に設定されているか確認してください。',
    recoverySteps: [
      'Secret Manager の daily30-cloud-run-token を確認',
      'Cloud Run の Secret 環境変数注入（DAILY30_CLOUD_RUN_TOKEN）を確認',
      'Cloud Scheduler の x-growly-daily30-token ヘッダー設定を確認',
    ],
  },
  TOKEN_INVALID: {
    errorCode: 'TOKEN_INVALID',
    errorMessageSafe: 'Cloud 自動収集 API の認証トークンが無効です',
    recoveryHint:
      'Scheduler / 手動呼び出しのトークンが Secret Manager の値と一致するか確認してください（値はログに出さない）。',
    recoverySteps: [
      'Secret Manager の daily30-cloud-run-token の最新バージョンを確認',
      'Cloud Scheduler ジョブのヘッダーを再設定（トークン値は画面に貼らない）',
      'Cloud Run の DAILY30_CLOUD_RUN_TOKEN Secret バインドを確認',
    ],
  },
  API_PRODUCTION_DISABLED: {
    errorCode: 'API_PRODUCTION_DISABLED',
    errorMessageSafe: 'API_PRODUCTION_ENABLED が true ではないため外部収集は実行できません',
    recoveryHint: 'Cloud Run 環境変数 API_PRODUCTION_ENABLED=true を設定してください。',
    recoverySteps: [
      'Cloud Run サービス growly-sales-daily30 の環境変数を確認',
      'API_PRODUCTION_ENABLED=true を設定して再デプロイ',
    ],
  },
  GCS_NOT_CONFIGURED: {
    errorCode: 'GCS_NOT_CONFIGURED',
    errorMessageSafe: 'GCS ストレージが正しく設定されていません',
    recoveryHint:
      'GROWLY_STORAGE_BACKEND=gcs / GROWLY_GCS_BUCKET / GROWLY_GCS_PREFIX を確認してください。',
    recoverySteps: [
      'GROWLY_STORAGE_BACKEND=gcs を確認',
      'GROWLY_GCS_BUCKET=growly-sales-daily30 を確認',
      'GROWLY_GCS_PREFIX=prod/growly-sales を確認',
    ],
  },
  GCS_READ_FAILED: {
    errorCode: 'GCS_READ_FAILED',
    errorMessageSafe: 'GCS から実行状態または候補 JSON の読み込みに失敗しました',
    recoveryHint:
      'Cloud Run サービスアカウントに対象バケットの storage.objectUser 権限があるか確認してください。',
    recoverySteps: [
      'growly-daily30-runner SA に gs://growly-sales-daily30 の objectUser 権限があるか確認',
      'バケットが asia-northeast1 に存在するか確認',
      'GROWLY_GCS_BUCKET / prefix が正しいか確認',
    ],
  },
  GCS_WRITE_FAILED: {
    errorCode: 'GCS_WRITE_FAILED',
    errorMessageSafe: 'GCS への候補 JSON または実行状態の保存に失敗しました',
    recoveryHint:
      'Cloud Run サービスアカウントに対象バケットの書き込み権限があるか確認してください。',
    recoverySteps: [
      'Cloud Run service account に対象バケットの roles/storage.objectUser があるか確認',
      'GROWLY_GCS_BUCKET が正しいか確認',
      'バケットが asia-northeast1 に存在するか確認',
    ],
  },
  PLACES_API_KEY_MISSING: {
    errorCode: 'PLACES_API_KEY_MISSING',
    errorMessageSafe: 'Places / Web Search API キーが未設定のため収集できません',
    recoveryHint:
      'Secret Manager の google-places-api-key と Cloud Run への Secret 注入を確認してください。',
    recoverySteps: [
      'Secret Manager の google-places-api-key を確認',
      'Cloud Run の GOOGLE_PLACES_API_KEY Secret バインドを確認',
      'API_PRODUCTION_ENABLED=true を確認',
    ],
  },
  PLACES_API_FAILED: {
    errorCode: 'PLACES_API_FAILED',
    errorMessageSafe: 'Places API の呼び出しに失敗しました',
    recoveryHint: 'Places API が有効か、API キー制限・クォータを確認してください。',
    recoverySteps: [
      'GCP Console で Places API が有効か確認',
      'API キーの IP / API 制限を確認（Cloud Run から利用可能か）',
      'クォータ・課金状態を確認',
    ],
  },
  FETCH_FAILED: {
    errorCode: 'FETCH_FAILED',
    errorMessageSafe: 'Daily 30 候補収集処理中にエラーが発生しました',
    recoveryHint: 'Cloud Logging で [daily30-cloud] ログを確認し、外部 API 応答を調査してください。',
    recoverySteps: [
      'Cloud Logging フィルタで [daily30-cloud] ログを確認',
      'Places / Web Search の応答エラーを確認',
      '一時的な障害の場合は翌日の Scheduler 実行を待つ',
    ],
  },
  DUPLICATE_GUARD_ALREADY_RAN: {
    errorCode: 'DUPLICATE_GUARD_ALREADY_RAN',
    errorMessageSafe: '同日の Cloud 自動収集は既に完了しています',
    recoveryHint:
      '同日の再実行は原則不要です。必要な場合のみ Cloud Shell で force=true（候補収集のみ）を使用してください。',
    recoverySteps: [
      '本日の実行記録（batchId）を確認',
      '同日再実行は原則しない',
      '必要時のみ docs の force=true 手順を Cloud Shell で実行',
    ],
  },
  UNKNOWN_ERROR: {
    errorCode: 'UNKNOWN_ERROR',
    errorMessageSafe: '予期しないエラーが発生しました',
    recoveryHint: 'Cloud Logging で [daily30-cloud] ログを確認してください。',
    recoverySteps: [
      'Cloud Logging フィルタでエラー時刻前後のログを確認',
      'Cloud Run のリビジョン・環境変数・Secret バインドを確認',
    ],
  },
};

const SECRET_PATTERNS = [
  /Bearer\s+\S+/gi,
  /x-growly-daily30-token[:\s]+\S+/gi,
  /DAILY30_CLOUD_RUN_TOKEN[=:]+\S+/gi,
  /GOOGLE_PLACES_API_KEY[=:]+\S+/gi,
  /AIza[0-9A-Za-z_-]{20,}/g,
  /ya29\.[0-9A-Za-z_-]+/g,
  /sk-[a-zA-Z0-9]{20,}/g,
];

export function getDaily30CloudErrorDefinition(
  code: Daily30CloudErrorCode
): Daily30CloudErrorDefinition {
  return ERROR_DEFINITIONS[code];
}

export function isDaily30CloudErrorCode(value: string): value is Daily30CloudErrorCode {
  return (DAILY30_CLOUD_ERROR_CODES as readonly string[]).includes(value);
}

export function sanitizeErrorMessageSafe(raw: string): string {
  let text = raw.slice(0, 500);
  for (const pattern of SECRET_PATTERNS) {
    text = text.replace(pattern, '[REDACTED]');
  }
  if (/api[_-]?key/i.test(text) && text.length > 80) {
    return '外部 API 関連のエラーが発生しました（詳細は Cloud Logging を確認）';
  }
  return text;
}

export function classifyUnknownError(err: unknown): Daily30CloudErrorDefinition {
  const raw = err instanceof Error ? err.message : String(err);
  const safe = sanitizeErrorMessageSafe(raw);

  if (/API_PRODUCTION_ENABLED/i.test(raw)) {
    return { ...ERROR_DEFINITIONS.API_PRODUCTION_DISABLED, errorMessageSafe: safe };
  }
  if (/GCS|bucket|storage/i.test(raw) && /write|save|upload/i.test(raw)) {
    return { ...ERROR_DEFINITIONS.GCS_WRITE_FAILED, errorMessageSafe: safe };
  }
  if (/GCS|bucket|storage/i.test(raw) && /read|download|ENOENT/i.test(raw)) {
    return { ...ERROR_DEFINITIONS.GCS_READ_FAILED, errorMessageSafe: safe };
  }
  if (/Places|places/i.test(raw)) {
    return { ...ERROR_DEFINITIONS.PLACES_API_FAILED, errorMessageSafe: safe };
  }

  return {
    ...ERROR_DEFINITIONS.UNKNOWN_ERROR,
    errorMessageSafe: safe || ERROR_DEFINITIONS.UNKNOWN_ERROR.errorMessageSafe,
  };
}

export function assertErrorMessageSafeDoesNotLeakSecrets(text: string): boolean {
  const lower = text.toLowerCase();
  if (SECRET_PATTERNS.some((p) => p.test(text))) return false;
  if (lower.includes('bearer ')) return false;
  if (text.includes('AIza')) return false;
  if (/refresh_token/i.test(text)) return false;
  return true;
}
