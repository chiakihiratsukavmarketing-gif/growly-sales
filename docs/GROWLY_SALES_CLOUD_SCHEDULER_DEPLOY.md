# Growly Sales — Cloud Scheduler デプロイ手順（Phase 29）

> **プロジェクト:** `growly-scheduler`  
> **リージョン:** `asia-northeast1`  
> **自動化範囲:** Daily 30 **候補収集のみ**（Gmail・営業文・Lead取り込みはしない）

## 前提確認

```bash
gcloud auth login
gcloud config set project growly-scheduler
gcloud auth application-default login   # ローカルから GCS 確認する場合

# Billing 有効化は GCP Console で確認
gcloud beta billing projects describe growly-scheduler
```

### 必要 API の有効化

```bash
gcloud services enable \
  run.googleapis.com \
  cloudscheduler.googleapis.com \
  artifactregistry.googleapis.com \
  storage.googleapis.com \
  secretmanager.googleapis.com \
  cloudbuild.googleapis.com \
  --project=growly-scheduler
```

## 1. Artifact Registry

```bash
gcloud artifacts repositories create growly-sales \
  --repository-format=docker \
  --location=asia-northeast1 \
  --description="Growly Sales Daily 30 images" \
  --project=growly-scheduler

gcloud auth configure-docker asia-northeast1-docker.pkg.dev
```

イメージ URI:

```
asia-northeast1-docker.pkg.dev/growly-scheduler/growly-sales/growly-sales-daily30:latest
```

## 2. Cloud Storage バケット

```bash
gcloud storage buckets create gs://growly-sales-daily30 \
  --project=growly-scheduler \
  --location=asia-northeast1 \
  --uniform-bucket-level-access \
  --public-access-prevention

# 推奨: オブジェクトバージョニング（上書き前の復旧用）
gcloud storage buckets update gs://growly-sales-daily30 --versioning
```

保存パス:

| オブジェクト | パス |
|-------------|------|
| 候補 JSON | `gs://growly-sales-daily30/prod/growly-sales/external-candidates.json` |
| 実行状態 | `gs://growly-sales-daily30/prod/growly-sales/daily30-cloud-run-state.json` |

- Public access は不要
- Cloud Run サービスアカウントのみ読み書き（後述 IAM）

## 3. Secret Manager

**Secret 名のみ記載。値は Console / CLI で入力し、docs・ログ・UI に書かない。**

```bash
# トークン生成例（値は表示後すぐメモ、docs に貼らない）
openssl rand -base64 32

echo -n "<生成したトークン>" | gcloud secrets create daily30-cloud-run-token \
  --data-file=- \
  --replication-policy=automatic \
  --project=growly-scheduler

echo -n "<Places API キー>" | gcloud secrets create google-places-api-key \
  --data-file=- \
  --replication-policy=automatic \
  --project=growly-scheduler
```

| Secret 名 | 環境変数 |
|-----------|----------|
| `daily30-cloud-run-token` | `DAILY30_CLOUD_RUN_TOKEN` |
| `google-places-api-key` | `GOOGLE_PLACES_API_KEY` |

**Gmail token は作成しない。**

## 4. サービスアカウント & IAM

```bash
gcloud iam service-accounts create growly-daily30-runner \
  --display-name="Growly Daily 30 Cloud Run runner" \
  --project=growly-scheduler

SA="growly-daily30-runner@growly-scheduler.iam.gserviceaccount.com"

# GCS（対象バケットのみ）
gcloud storage buckets add-iam-policy-binding gs://growly-sales-daily30 \
  --member="serviceAccount:${SA}" \
  --role="roles/storage.objectUser" \
  --project=growly-scheduler

# Secret Accessor
for SEC in daily30-cloud-run-token google-places-api-key; do
  gcloud secrets add-iam-policy-binding "$SEC" \
    --member="serviceAccount:${SA}" \
    --role="roles/secretmanager.secretAccessor" \
    --project=growly-scheduler
done
```

**付与しない:** Gmail API 権限、`roles/editor` 等の過剰権限。

## 5. Docker build / push / Cloud Run deploy

リポジトリルートで:

```bash
export PROJECT=growly-scheduler
export REGION=asia-northeast1
export IMAGE="${REGION}-docker.pkg.dev/${PROJECT}/growly-sales/growly-sales-daily30:latest"

docker build -t "$IMAGE" .
docker push "$IMAGE"

gcloud run deploy growly-sales-daily30 \
  --image="$IMAGE" \
  --region="$REGION" \
  --project="$PROJECT" \
  --service-account="growly-daily30-runner@${PROJECT}.iam.gserviceaccount.com" \
  --port=8080 \
  --min-instances=0 \
  --max-instances=1 \
  --concurrency=1 \
  --timeout=900 \
  --no-allow-unauthenticated \
  --set-env-vars="NODE_ENV=production,API_PRODUCTION_ENABLED=true,GROWLY_STORAGE_BACKEND=gcs,GROWLY_GCS_BUCKET=growly-sales-daily30,GROWLY_GCS_PREFIX=prod/growly-sales,GROWLY_CLOUD_SCHEDULER_CONFIGURED=true" \
  --set-secrets="DAILY30_CLOUD_RUN_TOKEN=daily30-cloud-run-token:latest,GOOGLE_PLACES_API_KEY=google-places-api-key:latest"
```

デプロイ後 URL を控える:

```bash
CLOUD_RUN_URL=$(gcloud run services describe growly-sales-daily30 \
  --region=asia-northeast1 \
  --project=growly-scheduler \
  --format='value(status.url)')
echo "Cloud Run URL: ${CLOUD_RUN_URL}"
```

ローカル UI 表示用（任意）: `.env` に `GROWLY_CLOUD_RUN_SERVICE_URL=<URL>` を設定（Secret ではない）。

## 6. Cloud Run dry-run 確認

```bash
# トークンは Secret から取得（画面に貼らない・ログに残さない）
TOKEN=$(gcloud secrets versions access latest --secret=daily30-cloud-run-token --project=growly-scheduler)

# Cloud Run Invoker（ローカル gcloud ユーザーまたは専用 SA）
gcloud run services add-iam-policy-binding growly-sales-daily30 \
  --region=asia-northeast1 \
  --member="user:YOUR_EMAIL" \
  --role=roles/run.invoker \
  --project=growly-scheduler

curl -sS -X POST "${CLOUD_RUN_URL}/api/cloud/daily30/auto-fetch" \
  -H "Authorization: Bearer $(gcloud auth print-identity-token)" \
  -H "x-growly-daily30-token: ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"dryRun":true,"force":false}' | jq .

unset TOKEN
```

確認項目:

- `ok: true`, `mode: "dry_run"`
- `batchId`, `nextArea`, `existingCount` が含まれる
- 外部通信・GCS 保存なし
- Gmail API 未使用

## 7. Cloud Scheduler ジョブ作成

Scheduler 用 SA に Run Invoker を付与:

```bash
gcloud run services add-iam-policy-binding growly-sales-daily30 \
  --region=asia-northeast1 \
  --member="serviceAccount:growly-daily30-runner@growly-scheduler.iam.gserviceaccount.com" \
  --role=roles/run.invoker \
  --project=growly-scheduler
```

ジョブ作成（OIDC + アプリトークン）:

```bash
TOKEN=$(gcloud secrets versions access latest --secret=daily30-cloud-run-token --project=growly-scheduler)

gcloud scheduler jobs create http growly-daily30-auto-fetch-9am \
  --location=asia-northeast1 \
  --schedule="0 9 * * *" \
  --time-zone="Asia/Tokyo" \
  --uri="${CLOUD_RUN_URL}/api/cloud/daily30/auto-fetch" \
  --http-method=POST \
  --headers="Content-Type=application/json,x-growly-daily30-token=${TOKEN}" \
  --message-body='{"dryRun":false,"force":false}' \
  --oidc-service-account-email=growly-daily30-runner@growly-scheduler.iam.gserviceaccount.com \
  --oidc-token-audience="${CLOUD_RUN_URL}" \
  --project=growly-scheduler

unset TOKEN
```

**注意（トークン露出）:**

- Scheduler ジョブの HTTP ヘッダーにトークンが保存される
- `roles/cloudscheduler.admin` 等を持つユーザーはジョブ定義を閲覧可能
- 可能なら IAM を最小化し、トークンは定期ローテーション
- ジョブ作成時に `echo $TOKEN` しない

### 認証方式の整理

| 層 | 方式 |
|----|------|
| Cloud Run IAM | OIDC（Scheduler SA → `roles/run.invoker`） |
| アプリ層 | `x-growly-daily30-token` または `Authorization: Bearer`（`DAILY30_CLOUD_RUN_TOKEN`） |

## 8. Scheduler 手動テスト

```bash
gcloud scheduler jobs run growly-daily30-auto-fetch-9am \
  --location=asia-northeast1 \
  --project=growly-scheduler
```

確認:

```bash
# Scheduler 実行履歴
gcloud scheduler jobs describe growly-daily30-auto-fetch-9am \
  --location=asia-northeast1 \
  --project=growly-scheduler

# Cloud Run ログ
gcloud logging read \
  'resource.type="cloud_run_revision" AND textPayload:"daily30-cloud"' \
  --limit=20 \
  --project=growly-scheduler

# GCS 更新確認
gcloud storage ls gs://growly-sales-daily30/prod/growly-sales/
```

同日 2 回目（`force=false`）は `mode: "already_ran"` になることを dry-run または手動 POST で確認。

## 9. 同日二重実行ガード

- `daily30-cloud-run-state.json` に `batchId`（`YYYY-MM-DD`）単位で記録
- Cloud Run 上は GCS に保存
- `force=false` で同日再実行 → `already_ran`（HTTP 200）
- `force=true` はトークン必須の手動再実行のみ

## 10. トラブルシュート

| 症状 | 確認 |
|------|------|
| 401 / blocked | `DAILY30_CLOUD_RUN_TOKEN` Secret とヘッダー一致、Run Invoker |
| 503 blocked | `API_PRODUCTION_ENABLED`、Places API Secret |
| GCS 書き込み失敗 | SA の `storage.objectUser`、バケット名/prefix |
| Scheduler 失敗 | OIDC audience = Cloud Run URL、URI パス |
| already_ran | 正常（同日ガード）。再収集は `force=true` を手動のみ |
| Gmail 呼び出し | このサービスでは発生しない設計 — ログで `messages.send` を検索してもヒットしないこと |

## 11. 安全ルール（必須）

- 自動送信しない
- `messages.send` / `users.drafts.create` 不使用
- Gmail token を Cloud Run に注入しない
- 営業文生成・leads 取り込み・humanReviewStatus 自動承認なし
- 送信済み11社の履歴を変更しない
- API キー / token / secret をログ・UI・docs に出さない

## 一括スクリプト

`scripts/cloud/growly-daily30/deploy-all.sh` — Cloud Shell 向け（API 有効化〜Scheduler まで段階実行）。

```bash
chmod +x scripts/cloud/growly-daily30/*.sh
./scripts/cloud/growly-daily30/deploy-all.sh
```

## 12. 実行ログの見方（Phase 30）

### state JSON（GCS）

`gs://growly-sales-daily30/prod/growly-sales/daily30-cloud-run-state.json`

| フィールド | 意味 |
|-----------|------|
| `runId` | 実行 ID |
| `batchId` | 日付（YYYY-MM-DD） |
| `mode` | dry_run / run / already_ran / blocked / failed |
| `status` | success / failed / skipped / blocked |
| `durationMs` | 所要時間 |
| `errorCode` | 失敗分類（秘密情報なし） |
| `recoveryHint` | 人間向け復旧ヒント |
| `history` | 直近100件の実行履歴 |

token / API key / Authorization header は**記録しない**。

### Growly Sales UI

**候補収集**タブ → **Cloud Scheduler（Daily 30 自動収集）** パネル:

- 本日の自動収集状態（success / failed / skipped / blocked / 未実行）
- 最終実行時刻・所要時間・batchId・mode
- errorCode / recoveryHint / リカバリー手順リスト
- Cloud Logging フィルタ文字列（ログ本文は表示しない）

### Cloud Logging フィルタ

```
resource.type="cloud_run_revision"
resource.labels.service_name="growly-sales-daily30"
textPayload:"[daily30-cloud]"
```

1行版（UI / コピー用）:

```
resource.type="cloud_run_revision" resource.labels.service_name="growly-sales-daily30" textPayload:"[daily30-cloud]"
```

## 13. errorCode 別リカバリー

| errorCode | 最初に確認すること |
|-----------|-------------------|
| `TOKEN_MISSING` | Secret `daily30-cloud-run-token`、Cloud Run Secret 注入 |
| `TOKEN_INVALID` | Scheduler ヘッダーと Secret の一致（値はログに出さない） |
| `API_PRODUCTION_DISABLED` | `API_PRODUCTION_ENABLED=true` |
| `GCS_NOT_CONFIGURED` | `GROWLY_STORAGE_BACKEND` / `GROWLY_GCS_BUCKET` / prefix |
| `GCS_READ_FAILED` / `GCS_WRITE_FAILED` | SA のバケット権限、バケット存在 |
| `PLACES_API_KEY_MISSING` | Secret `google-places-api-key`、Cloud Run 注入 |
| `PLACES_API_FAILED` | Places API 有効化、キー制限、クォータ |
| `FETCH_FAILED` | Cloud Logging で `[daily30-cloud]` |
| `DUPLICATE_GUARD_ALREADY_RAN` | 正常 — 同日再実行は原則不要 |

## 14. force=true 再実行（手動のみ）

**UI からは実行できません。** Cloud Shell のみ:

```bash
# トークンは Secret から取得（echo しない）
TOKEN=$(gcloud secrets versions access latest --secret=daily30-cloud-run-token --project=growly-scheduler)
curl -sS -X POST "${CLOUD_RUN_URL}/api/cloud/daily30/auto-fetch" \
  -H "Authorization: Bearer $(gcloud auth print-identity-token)" \
  -H "x-growly-daily30-token: ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"dryRun":false,"force":true}'
unset TOKEN
```

- 同日再実行は**原則しない**
- `force=true` でも**候補収集のみ**（Gmail・営業文・Lead 取り込みなし）

## 15. Cloud Monitoring アラート（任意）

Phase 30 ではアラート実作成は必須ではありません。運用開始後に検討:

| アラート案 | 条件 |
|-----------|------|
| Scheduler 失敗 | Cloud Scheduler job failed |
| Cloud Run 5xx | リクエストエラー率 |
| auto-fetch 失敗 | ログ `auto-fetch failed` + `errorCode` |
| 通知 | Email / Slack（Monitoring 通知チャネル） |

## 16. Phase 30 完了後の運用開始手順

1. Cloud Shell で `deploy-all.sh` を実行（未デプロイの場合）
2. dry-run POST で `mode: dry_run` / `existingCount` を確認
3. Scheduler 手動実行 → GCS の state / external-candidates 更新を確認
4. 翌朝 9:00 JST の自動実行を UI パネルで確認
5. 失敗時は UI の errorCode / recoveryHint → Cloud Logging フィルタ
6. 人間オペレーション: Lead 化承認・営業文・下書き・送信は**別フロー**（自動化外）
