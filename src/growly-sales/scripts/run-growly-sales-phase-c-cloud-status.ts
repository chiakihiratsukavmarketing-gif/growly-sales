/**
 * Phase C（Cloud Daily 30 復旧）診断 — 読み取り専用
 * Secret / token / credential の中身は表示しません。
 */
import { loadEnv } from '../config/env.js';
import {
  describeStorageBackendStatus,
  getStorageBackend,
  assertGcsStorageConfigured,
} from '../config/storageBackend.js';
import {
  diagnoseGcsAuth,
  formatGcsAuthDiagnosticsSummary,
} from '../config/gcsAuthDiagnostics.js';
import {
  EXTERNAL_CANDIDATES_JSON,
  DAILY30_CLOUD_RUN_STATE_JSON,
} from '../storage/jsonDocumentNames.js';
import { jsonDocumentExists, readJsonDocument } from '../storage/jsonDocumentStorage.js';
import { summarizeDaily30ContactPaths } from '../candidates/summarizeDaily30ContactPaths.js';
import { todayBatchIdJst } from '../candidates/daily30AreaConfig.js';
import type { ExternalLeadCandidate } from '../adapters/externalLeadCandidateTypes.js';
import { sanitizeErrorMessageSafe } from '../candidates/daily30CloudRunErrors.js';
import { loadExternalCandidatesFromJson } from '../storage/externalCandidatesRepository.js';
import { getLatestCloudRunEntry } from '../storage/daily30CloudRunState.js';
import { listEligibleManualExternalReferenceCandidates } from '../candidates/daily30ExternalReferenceSupplement.js';

function countCandidates(raw: string | null): number {
  if (!raw?.trim()) return 0;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return -1;
  }
}

function safeString(v: unknown): string {
  if (v == null) return '—';
  if (typeof v === 'string' && v.trim()) return v;
  return String(v);
}

async function main(): Promise<void> {
  console.log('Growly Sales — Phase C Cloud Daily 30 診断（読み取り専用）');
  console.log('============================================================');
  console.log('');

  loadEnv();

  const storage = describeStorageBackendStatus();
  const auth = diagnoseGcsAuth();

  console.log('## ストレージ設定');
  console.log(`GROWLY_STORAGE_BACKEND: ${storage.backend}`);
  console.log(`GCS bucket 設定: ${storage.gcsBucket ? 'あり' : 'なし'}`);
  if (storage.gcsBucket) {
    console.log(`  bucket 名: ${storage.gcsBucket}`);
  }
  console.log(`GCS prefix 設定: ${storage.gcsPrefix ? 'あり' : 'なし'}`);
  if (storage.gcsPrefix) {
    console.log(`  prefix: ${storage.gcsPrefix}`);
  }
  console.log(`external-candidates URI: ${storage.externalCandidatesUri}`);
  console.log(`cloud-run-state URI: ${storage.cloudRunStateUri}`);
  console.log('');

  console.log('## ADC / 認証（値は表示しません）');
  for (const line of formatGcsAuthDiagnosticsSummary(auth)) {
    console.log(line);
  }
  console.log('');

  if (getStorageBackend() !== 'gcs') {
    console.log('Phase C には GROWLY_STORAGE_BACKEND=gcs が必要です。');
    console.log('現在は local のため、Cloud GCS の Daily30 結果は読み込まれません。');
    process.exit(0);
  }

  try {
    assertGcsStorageConfigured();
  } catch (err) {
    console.log('## GCS 設定エラー');
    console.log(sanitizeErrorMessageSafe(err instanceof Error ? err.message : String(err)));
    process.exit(1);
  }

  console.log('## GCS オブジェクト確認');
  let gcsReachable = false;
  let externalExists = false;
  let stateExists = false;
  let externalCount = 0;
  let stateParseOk = false;
  let contactSummary: ReturnType<typeof summarizeDaily30ContactPaths> | null = null;
  let gcsError: string | null = null;
  let candidates: ExternalLeadCandidate[] = [];

  for (const doc of [EXTERNAL_CANDIDATES_JSON, DAILY30_CLOUD_RUN_STATE_JSON] as const) {
    try {
      const exists = await jsonDocumentExists(doc);
      const raw = await readJsonDocument(doc);
      if (doc === EXTERNAL_CANDIDATES_JSON) {
        externalExists = exists;
        // NOTE: Cloud/local で確実に同じ読み取り経路にするため、Repository 経由で件数を確定する。
        // readJsonDocument は JSON として読めても型が合わない場合があるため、診断は repository を優先する。
        candidates = await loadExternalCandidatesFromJson();
        externalCount = candidates.length;
        contactSummary = summarizeDaily30ContactPaths(candidates, todayBatchIdJst());
        console.log(
          `${doc}: ${exists ? '存在' : '未検出'} / 件数: ${externalCount >= 0 ? externalCount : 'JSON解析失敗'}`
        );
      } else {
        stateExists = exists;
        stateParseOk = Boolean(raw && JSON.parse(raw));
        console.log(`${doc}: ${exists ? '存在' : '未検出'} / JSON: ${stateParseOk ? 'OK' : '空または不正'}`);
      }
      gcsReachable = true;
    } catch (err) {
      gcsError = sanitizeErrorMessageSafe(err instanceof Error ? err.message : String(err));
      console.log(`${doc}: アクセス失敗 — ${gcsError}`);
    }
  }

  console.log('');
  console.log('## 候補収集タブ向けサマリー');
  console.log(`GCS 到達: ${gcsReachable ? 'OK' : 'NG'}`);
  console.log(`Daily30 候補 JSON: ${externalExists ? 'あり' : 'なし'}`);
  console.log(`最新候補総数: ${gcsReachable ? externalCount : '—'}`);
  if (contactSummary) {
    console.log(`本日 batch (${todayBatchIdJst()}) 件数: ${contactSummary.total}`);
    console.log(`  メールあり（メールのみ）: ${contactSummary.emailOnly}`);
    console.log(`  フォームあり（フォームのみ）: ${contactSummary.formOnly}`);
    console.log(`  メール+フォーム: ${contactSummary.both}`);
    console.log(`  導線なし: ${contactSummary.noContactPath}`);
  } else if (!gcsReachable) {
    console.log('本日 batch: —（GCS 未接続）');
  } else {
    console.log('本日 batch: 0 またはデータなし');
  }

  console.log('');
  console.log('## 手動外部参照候補（manual-external-reference）監査サマリー');
  const manualStats = listEligibleManualExternalReferenceCandidates(candidates, {
    includeImported: true,
  });
  console.log(`手動候補 total: ${manualStats.available}`);
  console.log(`  eligible（blocked_by_policy/duplicate/excluded 除外）: ${manualStats.eligible.length}`);
  console.log(`  blocked_by_policy: ${manualStats.blocked}`);

  console.log('');
  console.log('## Cloud Run state（最新エントリ）');
  try {
    const latest = await getLatestCloudRunEntry();
    if (!latest) {
      console.log('最新 state: なし');
    } else {
      const tokyoInAreasUsed = (latest.areasUsed ?? []).some((a) => /東京/.test(a));
      console.log(`batchId: ${safeString(latest.batchId)}`);
      console.log(`status: ${safeString(latest.status)}`);
      console.log(`emailFound: ${safeString(latest.emailFound)}`);
      console.log(`totalCollected: ${safeString(latest.totalCollected)}`);
      console.log(`stoppedReason: ${safeString(latest.stoppedReason)}`);
      console.log(`scheduleSource: ${safeString(latest.scheduleSource)}`);
      console.log(`collectionProfileId: ${safeString(latest.collectionProfileId)}`);
      console.log(`areaStrategy: ${safeString(latest.areaStrategy)}`);
      console.log(`areasUsed: ${(latest.areasUsed ?? []).join(', ') || '—'}`);
      console.log(`containsTokyoInAreasUsed: ${tokyoInAreasUsed ? 'YES' : 'NO'}`);
      console.log(`externalReferenceSupplementAttempted: ${String(latest.externalReferenceSupplementAttempted ?? false)}`);
      console.log(`externalReferenceSupplementMode: ${safeString(latest.externalReferenceSupplementMode)}`);
      console.log(`externalReferencePlanReason: ${safeString(latest.externalReferencePlanReason)}`);
      console.log(`externalReferenceNetworkAccessPerformed: ${String(latest.externalReferenceNetworkAccessPerformed ?? false)}`);
      console.log(`externalReferenceManualCandidatesAvailable: ${safeString(latest.externalReferenceManualCandidatesAvailable)}`);
      console.log(`externalReferenceManualCandidatesEligible: ${safeString(latest.externalReferenceManualCandidatesEligible)}`);
      console.log(`externalReferenceDisplayMessage: ${safeString(latest.externalReferenceDisplayMessage)}`);
    }
  } catch (err) {
    console.log(`最新 state 読み取り失敗: ${sanitizeErrorMessageSafe(err instanceof Error ? err.message : String(err))}`);
  }

  console.log('');
  console.log('## 判定');
  if (!gcsReachable) {
    console.log('⏳ Phase C 未完了 — ローカルから GCS を読めません');
    console.log('原因候補:');
    if (!auth.adcCredentialFileFound && !auth.googleApplicationCredentialsFileExists) {
      console.log('  - Application Default Credentials 未設定');
    }
    if (!auth.gcloudCliAvailable) {
      console.log('  - gcloud CLI 未インストール（ADC 取得に必要）');
    }
    if (gcsError?.includes('default credentials')) {
      console.log('  - Could not load the default credentials');
    }
    console.log('');
    console.log('必要な権限（サービスアカウントまたはユーザー）:');
    console.log('  - storage.objects.get');
    console.log('  - storage.objects.list');
    console.log('  （ロール例: roles/storage.objectViewer または roles/storage.objectUser）');
    console.log('');
    console.log('人間操作: Google Cloud SDK をインストール → gcloud auth application-default login');
    process.exit(1);
  }

  if (externalCount > 0 && contactSummary) {
    console.log('✅ Phase C 読み取り可能 — 候補収集タブにデータを表示できます');
  } else if (externalExists) {
    console.log('⚠️ GCS 接続 OK だが本日 batch の候補が 0 件 — Cloud Scheduler / Cloud Run 側の生成を確認');
  } else {
    console.log('⚠️ GCS 接続 OK だが候補 JSON 未作成 — Cloud 側の Daily30 実行を確認');
  }
}

main().catch((err) => {
  console.error(sanitizeErrorMessageSafe(err instanceof Error ? err.message : String(err)));
  process.exit(1);
});
