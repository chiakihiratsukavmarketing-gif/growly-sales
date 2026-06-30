# Growly Sales — Daily 30 運用 Runbook（Phase 26 完成版）

## 目的

住宅会社・工務店・リフォーム会社向けに、**毎日30件**の営業候補を収集し、  
営業文生成 → 品質チェック → Gmail下書き候補化 → **人間による手動送信**までを安全に回す。

- 自動送信は**しない**
- Gmail `messages.send` は**使わない**
- Gmail下書きは `users.drafts.create` のみ（`CREATE_DRAFTS` ゲート付き）

## エリア拡大順

1. 宮城県（優先）
2. 福島県
3. 北関東 — 茨城県 → 栃木県 → 群馬県

## 毎日の実行手順

1. Growly Sales UI を開く
2. **候補収集**タブで Daily 30 進捗を確認
3. 候補が足りなければ `FETCH_DAILY_30` で収集
4. `email_found` を確認し **Lead化承認**
5. `GENERATE_DAILY_30_COPY` で営業文生成・品質チェック
6. `ready_for_draft` を確認
7. `IMPORT_DAILY_30_DRAFT_CANDIDATES` で leads.json に取り込み（または1件ずつ）
8. **下書き候補**タブで内容確認・人間承認
9. `CREATE_DRAFTS` で Gmail 下書き作成
10. Gmail 画面で確認して**手動送信**
11. **送信記録**タブで `sent` / `manual_gmail` を記録
12. **返信管理**で返信状況を確認（`replySummary` のみ保存）

## ゲートの意味

| ゲート | 用途 | Gmail API |
|--------|------|-----------|
| `FETCH_DAILY_30` | 候補収集 | 呼ばない |
| `GENERATE_DAILY_30_COPY` | 営業文生成・品質チェック | 呼ばない |
| `IMPORT_DAILY_30_DRAFT_CANDIDATES` | leads.json への一括取り込み | 呼ばない |
| `CREATE_DRAFTS` | Gmail 下書き作成のみ | `drafts.create` のみ |

**重要:** 取り込みと下書き作成は別ゲート。取り込み時に Gmail API を呼ばない。

## Gmail下書き作成と送信の違い

| 操作 | 実行者 | ツール |
|------|--------|--------|
| 下書き作成 | Growly Sales UI + `CREATE_DRAFTS` | `users.drafts.create` |
| 送信 | **人間** | Gmail 画面で手動 |
| 送信記録 | 人間 | Growly Sales 送信記録タブ |

## 人間確認が必要なポイント

- Lead化承認（`email_found` → `approved_for_lead`）
- 下書き候補タブでの内容承認（`humanReviewStatus=approved`）
- Gmail 画面での送信前確認
- 送信記録・返信記録の入力

## トラブル時の確認箇所

| 症状 | 確認 |
|------|------|
| 収集できない | `.env` APIキー、`API_PRODUCTION_ENABLED=true`、`FETCH_DAILY_30` |
| 営業文が生成されない | Lead化承認済みか、`GENERATE_DAILY_30_COPY` 入力 |
| 取り込めない | `ready_for_draft` / 重複 / `needs_review` / `failureReason` |
| 下書き作成できない | `humanReviewStatus=approved`、`CREATE_DRAFTS`、Gmail OAuth |
| 送信記録できない | 先に下書き作成・手動送信済みか |

データファイル:

- `data/growly-sales/external-candidates.json`
- `data/growly-sales/leads.json`

## 既存11社の送信履歴保護

- パイロット・送信済み Lead の `sendStatus` / `replyStatus` / 返信メモは**上書きしない**
- Daily 30 取り込みは重複 Lead を拒否
- `generate` / 取り込みパイプラインは送信済み Lead に触れない

## CLI（参考）

```powershell
cd "C:\Users\chiak\AI_\Growly Sales"
npm run growly-sales:daily30-preview          # dry-run
npm run growly-sales:daily30-fetch              # FETCH_DAILY_30
npm run growly-sales:daily30-generate-copy      # GENERATE_DAILY_30_COPY
npm run growly-sales:daily30-import-draft-candidates  # IMPORT_DAILY_30_DRAFT_CANDIDATES
npm run growly-sales:gmail-create-drafts        # CREATE_DRAFTS（別途）
```

## Cloud 自動収集（Phase 27）

毎朝9時の候補収集のみ（Cloud Scheduler → Cloud Run）:

- `POST /api/cloud/daily30/auto-fetch`
- 認証: `DAILY30_CLOUD_RUN_TOKEN`（`Authorization: Bearer` または `x-growly-daily30-token`）
- `dryRun: true` — 外部通信・保存なし
- `force: true` — 同日再実行（トークン必須）
- **Gmail・営業文・leads 取り込みは実行しない**

```powershell
npm run growly-sales:cloud-daily30-dry-run
npm run growly-sales:cloud-daily30-auto-fetch  # DAILY30_CLOUD_RUN_TOKEN 必須
```

## Cloud Storage 保存（Phase 28）

Cloud Run ではローカル `data/growly-sales/*.json` に書けないため、GCS を保存先に切り替え可能。

| 環境変数 | 説明 | 例 |
|----------|------|-----|
| `GROWLY_STORAGE_BACKEND` | `local`（既定）または `gcs` | `gcs` |
| `GROWLY_GCS_BUCKET` | GCS バケット名 | `growly-sales-daily30` |
| `GROWLY_GCS_PREFIX` | オブジェクト prefix | `prod/growly-sales` |

保存対象（gcs 時）:

- `gs://<bucket>/<prefix>/external-candidates.json`
- `gs://<bucket>/<prefix>/daily30-cloud-run-state.json`

ローカル確認（読み取りのみ・書き込みなし）:

```powershell
$env:GROWLY_STORAGE_BACKEND="gcs"
$env:GROWLY_GCS_BUCKET="growly-sales-daily30"
$env:GROWLY_GCS_PREFIX="prod/growly-sales"
npm run growly-sales:gcs-storage-check
```

### Cloud Run 環境変数サンプル（Daily 30 auto-fetch 専用）

```env
NODE_ENV=production
PORT=8080
API_PRODUCTION_ENABLED=true
GROWLY_STORAGE_BACKEND=gcs
GROWLY_GCS_BUCKET=growly-sales-daily30
GROWLY_GCS_PREFIX=prod/growly-sales
DAILY30_CLOUD_RUN_TOKEN=<Secret Manager から注入>
GOOGLE_PLACES_API_KEY=<Secret Manager から注入>
# Web Search 等、収集に必要な API キー
```

**不要（Daily 30 auto-fetch 用途）:**

- Gmail OAuth / refresh token — 下書き作成・送信は行わない
- `CREATE_DRAFTS` / `FETCH_DAILY_30` CLI ゲート — Cloud API は `DAILY30_CLOUD_RUN_TOKEN` で認証

サービスアカウントには対象バケットへの `storage.objects.get` / `storage.objects.create` 権限を付与。

Docker イメージには `.env`・credentials・token・ローカル JSON を含めない（`.dockerignore` 参照）。

```powershell
# イメージビルド例（ローカル）
docker build -t growly-sales-daily30 .
```

## Cloud Scheduler 朝9時実行（Phase 29）

**フル手順:** [GROWLY_SALES_CLOUD_SCHEDULER_DEPLOY.md](./GROWLY_SALES_CLOUD_SCHEDULER_DEPLOY.md)

### 概要

```
Cloud Scheduler (9:00 JST)
  → POST /api/cloud/daily30/auto-fetch  {"dryRun":false,"force":false}
  → Cloud Run (growly-sales-daily30)
  → GCS: external-candidates.json / daily30-cloud-run-state.json
```

| 項目 | 値 |
|------|-----|
| プロジェクト | `growly-scheduler` |
| リージョン | `asia-northeast1` |
| Scheduler ジョブ | `growly-daily30-auto-fetch-9am` |
| cron | `0 9 * * *` / `Asia/Tokyo` |
| Cloud Run サービス | `growly-sales-daily30` |
| イメージ | `asia-northeast1-docker.pkg.dev/growly-scheduler/growly-sales/growly-sales-daily30:latest` |

### Secret 名（値は docs に書かない）

- `daily30-cloud-run-token` → `DAILY30_CLOUD_RUN_TOKEN`
- `google-places-api-key` → `GOOGLE_PLACES_API_KEY`

### ローカル確認

```powershell
npm run growly-sales:cloud-deploy-check
npm run growly-sales:cloud-daily30-dry-run
```

Cloud Shell で一括デプロイ:

```bash
chmod +x scripts/cloud/growly-daily30/*.sh
./scripts/cloud/growly-daily30/deploy-all.sh
```

### 同日二重実行

- `force=false`（Scheduler 既定）で同日 2 回目 → `mode: already_ran`
- 手動再実行のみ `force=true`

### 安全ルール（Cloud 自動化）

- 自動送信しない / Gmail API send・下書き作成なし
- 営業文生成・leads 取り込み・humanReviewStatus 自動承認なし
- Gmail token を Cloud Run に注入しない

## 実行ログ・失敗リカバリー（Phase 30）

### UI パネル

**候補収集**タブ → **Cloud Scheduler（Daily 30 自動収集）** で本日の状態・最終実行ログ・errorCode・recoveryHint・Cloud Logging フィルタを確認。

### errorCode / 復旧

詳細: [GROWLY_SALES_CLOUD_SCHEDULER_DEPLOY.md](./GROWLY_SALES_CLOUD_SCHEDULER_DEPLOY.md) §12–14

- `force=true` は UI ボタンなし — Cloud Shell 手動のみ
- 同日再実行は原則しない

### Cloud Daily 30 運用開始

1. Cloud Shell で `deploy-all.sh`
2. dry-run → Scheduler 手動テスト
3. 毎朝 9:00 自動実行を UI で確認
4. 候補の Lead 化・営業文・下書き・送信は人間オペレーション（自動化外）

- `needs_review` / `excluded` は下書き候補化しない
- 署名 Email: `c_hiratsuka@wantreach.jp`
- 返信本文全文は保存せず `replySummary` のみ
- APIキー / refresh token / secret は画面・ログに出さない
