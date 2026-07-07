# Growly Sales — メール運用機能 live 化前安全確認（Phase 44）

> **正本:** Phase 44 live 化前の監査・Go/No-Go・人間作業一覧。
> **仕様正本（mock）:** `docs/GROWLY_SALES_MAIL_OPERATIONS_UPGRADE.md`
> **状態:** 2026-07-06 監査完了。**実装・デプロイ・env 変更は未実施。**

---

## 0. 進行

| Phase | 内容 | 状態 |
|-------|------|------|
| 43.1〜43.4 | mock 実装 | ✅ 完了（`98abff3` / `5ed05de` / `51acf05` / `fc1a686` / `e28e311`） |
| **44.0** | **live 化前安全確認** | **本ドキュメント** |
| 44.1 | 配信停止 live | **No-Go**（条件未達） |
| 44.2 | カスタムテンプレート live | 未着手 |
| 44.3 | 開封計測 live | 未着手 |

**live 化順（固定）:** ①配信停止 → ②カスタムテンプレート → ③開封計測

---

## 1. 現状

### 1.0 テナント方針（現時点: single tenant / 将来: SaaS）

- **現在:** single tenant deployment（自社運用）
  - `tenantId = want-reach`
  - 公開サブドメイン候補: `mailops.wantreach.jp`
  - **contactEmail（Human Approval 済み 2026-07-07）:** `info@wantreach.jp`
    - `tenantResolver` の Want Reach 既定 tenant のみ。Secret ではなく tenant 設定として一元管理
    - 配信停止 mock 画面は `buildUnsubscribeScreenCopy(tenant)` 経由で参照
    - **未適用:** Gmail 下書き本文 / live endpoint / 既存送信済みメール
  - **配信停止メール末尾（Human Approval 済み 2026-07-07）:** `buildUnsubscribeEmailFooterCopy(tenant)` — displayName / legalName / contactEmail / `buildUnsubscribeUrl` 経由。所在地は表示しない
    - mock プレビュー: `GET /api/mail-suppressions/unsubscribe-footer-preview`
    - **未適用:** Gmail 下書き本文 / live endpoint / 既存送信済みメール
  - **法務表示方針（Human Approval 済み 2026-07-07）:** §8.4 参照。メール全体で送信者名・所在地・問い合わせ先・配信停止方法を表示。所在地は本文内のみ（フッター重複なし）
  - **配信停止画面文案（Human Approval 済み 2026-07-07）:** `buildUnsubscribeScreenStateCopy(tenant, state)` — 5 状態（confirm / completed / already_unsubscribed / invalid_or_expired / temporary_error）
    - mock API: `/api/mock/unsubscribe/:token` が `screenState` を返す
    - **未適用:** 公開 `/u/{token}` / Gmail 下書き / live endpoint
- **将来:** multi-tenant SaaS へ移行可能な境界を保持
  - 公開 URL は `resolveMailOperationsPublicBaseUrl(tenantId)` で解決
  - 共通 Growly ドメイン / 顧客独自ドメインへ交換可能

### 1.1 固定する通常営業ルート

```
候補収集（FETCH_DAILY_30）
  → Human Approval による Lead 化
  → AI 営業文生成（GENERATE_DAILY_30_COPY）
  → 人間による内容確認・カスタム
  → Gmail 下書き候補化（IMPORT_DAILY_30_DRAFT_CANDIDATES）
  → Gmail 下書き作成（CREATE_DRAFTS / users.drafts.create のみ）
  → Gmail で人間が手動送信（Growly Sales は送信しない）
  → 送信記録（record-manual-gmail-sent）
  → 開封参考値・返信・配信停止・フォローアップ
```

### 1.2 mock 実装の所在（コード監査）

| 機能 | モジュール | 永続化（runtime・gitignore） | mock API |
|------|-----------|------------------------------|----------|
| 配信停止 | `mail-operations/suppression*.ts` | `mail-suppressions.json` | `/api/mail-suppressions/*`, `/api/mock/unsubscribe/:token` |
| テンプレート | `mail-operations/template*.ts` | `outreach-templates.json` | `/api/outreach-templates/*` |
| 開封計測 | `mail-operations/openTracking*.ts` | `email-send-tracking.json`, `email-open-events.json` | `/api/mock/open-events`, `/api/open-tracking/sent-leads` |

**suppression チェック挿入済み（mock store 参照）:**

| 処理 | ファイル |
|------|----------|
| Daily30 営業文生成 | `candidates/generateDaily30SalesCopy.ts` |
| Lead 営業文生成 | `generation/applyFullGeneration.ts` |
| 下書き候補選定 | `outreach/outreachPolicy.ts` / `drafts/selectDraftCandidates.ts` |
| Gmail 下書き作成 | `workflow/createGmailDraftForLead.ts` |
| フォローアップ / 再送 | `outreach/outreachPolicy.ts`, `analytics/buildTodaySalesQueue.ts` |

**未 live 化（監査確認）:**

- 公開 `/u/{token}` — **未作成**
- 公開 `/t/{token}.gif` — **未作成**
- Gmail 下書きへの停止リンク自動挿入 — **未実装**（`buildMockUnsubscribeNoticePreview` はプレビュー用のみ）
- Gmail MIME への tracking pixel — **未実装**
- `MAIL_OPS_MODE` 既定は実質 `mock`（`live` 明示時のみ live 扱い）

### 1.3 既存 Cloud / ストレージ

| 項目 | 現状 |
|------|------|
| Cloud Run | `growly-sales-daily30`（Daily 30 自動収集・`GROWLY_CLOUD_RUN_API_ONLY`） |
| GCS | `growly-sales-daily30` / `prod/growly-sales/` — **Daily30 用 JSON のみ**（`jsonDocumentStorage` 3 種） |
| mail-ops JSON | **ローカル `data/growly-sales/` のみ**（GCS 未接続） |
| GCS 条件付き更新 | `gcsWriteJsonIfGenerationMatch` 実装済み（Daily30 用） |
| `.env.example` | mail-ops 用 env **未定義**（Gmail / GCS / Places のみ） |

---

## 2. live 化対象（3 機能）

| 順 | 機能 | mock commit | live で追加するもの |
|----|------|-------------|---------------------|
| 1 | 配信停止・配信禁止 | `5ed05de` | 公開停止 URL、下書き末尾リンク、本番永続化 |
| 2 | カスタムテンプレート | `51acf05` | 本番テンプレート保存・active 運用（生成のみ） |
| 3 | 開封計測 | `fc1a686` | 公開 pixel endpoint、下書き MIME 埋め込み |

**ゲート:** 44.1 live 完了まで 44.2 / 44.3 のメール埋め込み live 化は **禁止**（Phase 43 仕様維持）。

---

## 3. 推奨アーキテクチャ

```
[受信者ブラウザ]
    │ GET/POST /u/{token}     GET /t/{token}.gif
    ▼
[Cloud Run: growly-sales-mail-ops]  ← Daily30 サービスと分離推奨
    │ 公開 endpoint のみ（最小権限 SA）
    │ rate limit / bot 対策
    ▼
[GCS: mail-suppressions.json 等]  ← 推奨保存先（§4）
    ▲
    │ 読み書き（generation-match）
    │
[ローカル UI / 将来バッチ]  localhost:3847
    │ users.drafts.create のみ
    ▼
[Gmail] 人間手動送信
```

| 決定 | 推奨 | 理由 |
|------|------|------|
| 公開 endpoint 配置 | **専用 Cloud Run サービス**（`growly-sales-mail-ops` 案） | Daily30 fetch と分離。Invoker・SA・レート制限を最小化 |
| 営業 OS UI | **ローカル継続**（現行） | Gmail OAuth・Human Approval フローはローカル UI が正本 |
| HTTPS / ドメイン | **専用サブドメイン**（例: `mail-ops.example.com`） | `PUBLIC_BASE_URL` に設定。Daily30 URL と混在しない |
| データ同期 | GCS を正本、ローカルはキャッシュ or 読み取り専用 | 公開サービスと UI の suppression 整合 |

---

## 4. suppression 保存先比較と推奨

### A. GCS JSON 継続（**推奨 — Phase 44.1**）

| 観点 | 評価 |
|------|------|
| 同時更新 | `gcsWriteJsonIfGenerationMatch` + リトライで対応可能。競合時は再読込マージ |
| バックアップ | 既存 `gcsBackupBeforeWrite` パターンを流用可 |
| 破損復旧 | `.bak` タイムスタンプ付きコピー + 手動リストア手順 |
| 小規模運用 | 宮城パイロット規模（数十〜数百件）では **許容** |
| 既存整合 | Daily30 と同一バケット `prod/growly-sales/mail-suppressions.json` で運用統一可能 |

**リスク:** 高頻度同時 unsubscribe で競合増。multi-instance Cloud Run 時はリトライ設計必須。

### B. Supabase / RDB

| 観点 | 評価 |
|------|------|
| 利点 | `normalizedEmail` UNIQUE、監査テーブル、トランザクション、索引 |
| 欠点 | **新規 DDL・接続・RLS 設計**、運用コスト、本リポジトリ未接続 |
| 適用時期 | 配信停止件数が数百超、複数ライター、監査クエリが必須になった段階 |

**参考 DDL（未適用）:** `mail_suppressions`, `mail_suppression_audit`, `unsubscribe_token_index(token_hash)`

### C. Firestore 等

| 観点 | 評価 |
|------|------|
| 利点 | ドキュメント単位更新、Google Cloud 内完結 |
| 欠点 | **新依存**、既存 JSON モデルからの移行、クエリ・一意制約の設計コスト |
| 判断 | GCS JSON で足りる間は採用理由が弱い |

### 推奨案

**Phase 44.1 は A（GCS JSON + generation-match + バックアップ）** を採用。
移行トリガー（B 検討）: 同時書き込み失敗が運用上顕著 / active suppression > 500 / 複数リージョン・マルチインスタンス必須。

---

## 5. 公開 endpoint 配置案（未作成）

### 5.1 配信停止（44.1）

| Method | Path | 用途 |
|--------|------|------|
| GET | `/u/{token}` | 停止確認画面（メールアドレスはマスク表示） |
| POST | `/u/{token}` または `/u/{token}/confirm` | 停止確定（冪等） |

**mock（ローカル UI・2026-07-07 完成）:**

| Method | Path | 用途 |
|--------|------|------|
| GET | `/api/mock/unsubscribe/:token` | 確認画面状態のみ（**停止処理しない**） |
| POST | `/api/mock/unsubscribe/:token` | 停止確定（冪等・mock/local store のみ） |
| GET | `/api/mail-suppressions/unsubscribe-screen-preview` | 開発者向け 5 状態プレビュー |

**mock GET 状態:** `confirm` / `already_unsubscribed` / `invalid_or_expired` / `temporary_error`
**mock POST 状態:** `completed` / `already_unsubscribed` / `invalid_or_expired` / `temporary_error`
**画面 response:** `maskedEmail` のみ（完全メール非表示）。`tenantId` / `leadId` / `normalizedEmail` / 生 token は返さない。`isMock: true` / `liveConnected: false` を明示。

**token 保護（mock / live 設計共通）:**

- 生 token は永続化しない（`tokenHash` のみ）
- 画面 response・通常ログに生 token を出さない
- invalid / expired の内部差は外部に出さない（一律 `invalid_or_expired`）
- `tenantId` は token record から解決（query parameter を信用しない）
- live 運用時は URL path 全体を通常ログに残さない方針（pepper / Secret は未設定）

**セキュリティ要件:**

- 生 token をログ・レスポンスヘッダに出さない
- `UNSUBSCRIBE_TOKEN_PEPPER` で hash 照合
- IP ベース rate limit（例: 60 req/min/IP）
- token 総当たり対策: 長い random（現行 32 bytes base64url）+ 失敗時一定応答
- 無効 token は一律「リンクが無効です」（存在有無を漏らさない）
- 障害時: **fail-closed**（停止処理不可＝新規 suppression 登録しないが、既存チェックは legacy + cache で継続検討要）

### 5.2 開封計測（44.3・今回未実装）

| Method | Path | 用途 |
|--------|------|------|
| GET | `/t/{token}.gif` | 1x1 transparent GIF、204/200 |

---

## 6. 必要 env（名前のみ・値は設定しない）

| 変数 | 用途 | 現状 |
|------|------|------|
| `PUBLIC_BASE_URL` | 停止・計測 URL の基底 | **未設定** |
| `UNSUBSCRIBE_TOKEN_PEPPER` | 配信停止 token hash | **未設定**（Secret Manager 推奨） |
| `OPEN_TRACKING_TOKEN_PEPPER` | 開封 token hash | **未設定** |
| `MAIL_OPS_MODE` | `mock` / `live` | 未設定時 mock 相当 |
| `MAIL_OPEN_TRACKING_ENABLED` | 開封 live スイッチ | 未設定（false 想定） |
| `GROWLY_STORAGE_BACKEND` | `gcs` 時に suppression GCS 化 | ローカル既定 `local` |
| `GROWLY_GCS_BUCKET` | バケット名 | Daily30 と共有可能 |
| `GROWLY_GCS_PREFIX` | オブジェクト prefix | `prod/growly-sales` |

`.env.example` への追記は **44.1 実装フェーズ**で実施（今回は未実施）。

---

## 7. Cloud 構成候補（未デプロイ）

| リソース | 推奨 | 備考 |
|----------|------|------|
| Cloud Run `growly-sales-mail-ops` | **新規** | min 0 / max 2、concurrency 低め、公開 invoker |
| Load Balancer + マネージド証明書 | 推奨 | カスタムドメイン + HTTPS |
| Secret Manager | `unsubscribe-token-pepper`, `open-tracking-token-pepper` | SA に `secretAccessor` |
| Cloud Armor（任意） | rate limit / geo | 総当たり・スキャナ対策 |
| 既存 `growly-sales-daily30` | **変更しない** | Scheduler・Places・候補 JSON のみ |

---

## 8. 法務・表示要件（実装チェックリスト）

> **免責:** 以下はコード実装・画面表示の整理。**法的適否の最終判断は人間確認事項。**

### 8.1 メール末尾（live 時に下書きへ挿入）

| 項目 | 要件 |
|------|------|
| 送信者名 | `OUTREACH_FROM_DISPLAY_NAME` / 署名ブロック |
| 送信者連絡先 | 住所・社名等 — **人間がテンプレートまたは署名で確認** |
| 配信停止案内 | 文言 + 実 URL（`PUBLIC_BASE_URL/u/{token}`） |
| 問い合わせ先 | `OUTREACH_REPLY_TO_EMAIL` または署名メール |

**現状:** テンプレート `unsubscribeBlock` は active 化時必須（mock）。Gmail 下書きへの **自動 URL 挿入は未実装**。

### 8.2 配信停止画面

| 項目 | 要件 |
|------|------|
| メール完全表示 | **禁止**（マスク例: `t***@example.com`） |
| 停止完了 | 「配信を停止しました」 |
| 再送しない旨 | 明示 |
| 解除リンク | **表示しない**（解除は UI + Human Approval のみ） |
| プライバシー | 収集項目・問い合わせ先の短文 |

### 8.3 開封計測 UI

| 項目 | 要件 |
|------|------|
| 表示 | 「開封率は画像読み込みに基づく参考値です」 |
| 禁止表現 | 「必ず読んだ」「開封＝既読」等の断定 |

### 8.4 法務表示方針（Human Approval 済み 2026-07-07）

> **免責:** 以下は一般的な運用確認であり、**個別案件の法的保証ではない**。live 送信前に最終チェックリスト（§12）を実施する。

| 項目 | 方針 |
|------|------|
| メール全体の表示要件 | 送信者名・**所在地**・問い合わせ先・配信停止方法を表示する |
| 所在地の配置 | **メール本文内**（署名ブロック等）に表示済み |
| 配信停止フッター | 所在地は**重複表示しない** |
| フッターに含める項目 | 送信者名（例: 合同会社Want Reach）・配信停止 URL・問い合わせ先（例: `info@wantreach.jp`）— いずれも tenant 設定から生成 |
| 送信可否と表示 | **別管理** — 表示要件を満たしても suppression / 送信拒否表示がある場合は送信対象外 |
| 公表メールアドレス | 公表であっても、サイト等に送信拒否表示がある場合は送信対象外 |
| suppression 登録済み宛先 | **全送信入口**で停止（`assertNotSuppressed`） |

**現状:** フッター・画面文案は mock プレビューのみ。Gmail 下書きへの自動挿入・公開 endpoint は未接続。

### 8.5 配信停止画面（Human Approval 済み 2026-07-07）

| 状態 (`UnsubscribeScreenState`) | 用途 |
|------|------|
| `confirm` | 停止確認（メールアドレスはマスク表示） |
| `completed` | 停止完了 |
| `already_unsubscribed` | 既に停止済み（冪等） |
| `invalid_or_expired` | 無効または期限切れ token |
| `temporary_error` | 障害時（fail-closed 方針と整合） |

| 項目 | 要件 |
|------|------|
| メール完全表示 | **禁止**（マスク例: `t***@example.com`） |
| 解除リンク | **表示しない**（解除は UI + Human Approval のみ） |
| 所在地 | **画面に表示しない**（本文内で表示済みのため重複しない） |
| 文案生成 | `buildUnsubscribeScreenStateCopy(tenant, state)` — tenant 経由、ハードコード禁止 |

---

## 9. 機能別 live 化確認

### 9.1 Phase 44.1 配信停止

| 項目 | mock 状態 | live 要件 |
|------|-----------|-----------|
| 公開 endpoint | mock `/api/mock/unsubscribe/:token` + 画面プレビュー API | `/u/{token}` on Cloud Run |
| GET 挙動 | ✅ 確認のみ（停止しない）・`maskedEmail` のみ | 同上 |
| POST 挙動 | ✅ 冪等・`completed` / `already_unsubscribed` | 本番 store でも維持 |
| 全送信入口ブロック | ✅ `assertNotSuppressed` + 読込失敗時 `SuppressionStoreUnavailableError` | GCS 読込失敗時 **fail-closed** 維持 |
| 下書き末尾リンク | ❌ 未挿入 | CREATE_DRAFTS 後・token 発行・hash 保存 |
| token 有効期限 | mock TTL 30 日 | live 方針を人間承認（無期限 + rotate 案） |
| `doNotContact` 互換 | ✅ legacy チェック維持 | suppression を正規ソースに |

### 9.2 Phase 44.2 カスタムテンプレート

| 項目 | mock 状態 | live 要件 |
|------|-----------|-----------|
| 保存先 | ローカル `outreach-templates.json` | GCS 同期 or ローカル正本の方針決定 |
| active 化 | `TEMPLATE_ACTIVATE` ゲート | 維持 |
| rollback | `activeTemplateId = null` で従来 `generateSalesEmail` | 維持 |
| 配信停止ブロック削除 | active 化時必須バリデーション | 維持 |
| 未解決 placeholder | `findUnresolvedTemplatePlaceholders` | live でも active 化ブロック |
| 既存 Lead 本文 | 上書きなし | **一括再生成禁止** |
| AI 異常時 | 現状テンプレート renderer に fallback なし | **推奨: active 読込失敗時は従来ハードコードへ fallback**（§10） |

### 9.3 Phase 44.3 開封計測

| 項目 | mock 状態 | live 要件 |
|------|-----------|-----------|
| 公開 pixel | ❌ | `/t/{token}.gif` |
| IP | 非保存 | 維持 |
| UA | カテゴリのみ | 維持 |
| Gmail proxy | `privacyProxySuspected` | 参考値注記維持 |
| 下書き埋め込み | ❌ | HTML multipart 化の影響評価必須 |
| 計測不能 | `not_tracked` / `tracking_disabled` 表示 | 維持 |
| crawler 誤計測 | 未対策 | User-Agent フィルタ + rate limit 要検討 |

---

## 10. 障害時の安全設計（fail-closed / degrade）

### 10.1 suppression 確認失敗

| 処理 | 障害時動作 | 現状 mock |
|------|------------|-----------|
| 営業文生成 | **停止**（エラー表示） | ローカル JSON 読込失敗時は空 store 扱い → **live では要変更** |
| 下書き候補化 | **停止** | 同上 |
| Gmail 下書き作成 | **停止** | 同上 |
| フォローアップ | **停止** | 同上 |

**原則:** 「確認できなかったので送る」は **禁止**。
**live 実装案:** GCS 読込失敗 → `SuppressionStoreUnavailableError` → 全 `assertNotSuppressed` が throw。

### 10.2 template 読込失敗

| 方針 | 採用案 |
|------|--------|
| A. 従来テンプレートへ fallback | **推奨**（営業停止を避けつつ active 無効化ログ） |
| B. 生成自体を停止 | 安全だが運用停止リスク大 |

`generateSalesEmail` は現状 active あり + 読込成功時のみテンプレート適用。live では **読込失敗を明示 catch して legacy パス**を推奨。

### 10.3 tracking 保存失敗

| 動作 | 方針 |
|------|------|
| メール送信 | **止めない**（Growly は送信しない。人間の Gmail 送信に影響なし） |
| 送信記録 | 記録は成功させる |
| tracking | 作成スキップ |
| UI | 「計測対象外」表示 |

現行 `recordManualGmailSent` は tracking 失敗を catch して送信記録を維持 — **live でも維持**。

---

## 11. rollback 設計

### 11.1 配信停止

1. `MAIL_OPS_MODE=mock` に戻す（公開リンク生成停止）
2. Cloud Run リビジョン rollback または LB から `/u/*` を外す
3. **suppression レコードは削除しない**
4. 過去の停止状態を維持

### 11.2 テンプレート

1. `activeTemplateId` を null に（UI または store 操作）
2. `MAIL_OPS_MODE=live-disabled-template` で強制 legacy（既存 env パターン）
3. version 履歴は保持

### 11.3 開封計測

1. `MAIL_OPEN_TRACKING_ENABLED=false`
2. 下書き pixel 挿入コードパスを無効化
3. 過去 `email-open-events` / tracking 集計は保持
4. 既存 Lead・送信記録は不変

---

## 12. Human Approval チェックリスト

| # | 項目 | 状態 |
|---|------|------|
| 0 | **contactEmail（問い合わせ先）** — Want Reach 既定 tenant | ✅ **Human Approval 済み**（`info@wantreach.jp`・tenant 設定一元管理・Gmail/live 未適用） |
| 1 | 公開ドメイン決定（`PUBLIC_BASE_URL`） | ☐ 未 |
| 2 | Cloud Run mail-ops サービス作成承認 | ☐ 未 |
| 3 | HTTPS / 証明書確認 | ☐ 未 |
| 4 | Secret Manager に pepper 設定 | ☐ 未 |
| 5 | suppression 保存先決定（GCS 推奨） | ☐ 未承認 |
| 6 | 法務・特定電子メール法関連の表示確認 | ✅ **Human Approval 済み**（2026-07-07・§8.4 法務表示方針・一般的運用確認・個別法的保証なし） |
| 7 | 配信停止メール末尾文面 | ✅ **Human Approval 済み**（2026-07-07・tenant 参照・所在地なし・Gmail/live 未適用） |
| 7b | 配信停止画面文案 | ✅ **Human Approval 済み**（2026-07-07・5 状態モデル・tenant 参照・mock API のみ） |
| 8 | カスタムテンプレート本番内容確認 | ☐ 未 |
| 9 | テンプレート active 化承認 | ☐ 未 |
| 10 | 開封計測を利用するか最終判断 | ☐ 未 |
| 11 | Gmail 下書きへの pixel 挿入承認 | ☐ 未 |
| 12 | 配信禁止 **解除**（件ごと） | ☐ 運用ルール済（UI ゲートあり） |

---

## 13. 実装順（live）

```
44.1 配信停止
  → GCS suppression + 公開 /u/{token}
  → 全入口 fail-closed
  → 下書き末尾リンク（CREATE_DRAFTS 後）
44.2 テンプレート GCS 化 + active 運用（埋め込みなし）
44.3 開封 pixel + /t/{token}.gif（44.1 安定後）
```

---

## 14. 通常営業運用への影響

| 観点 | 影響 |
|------|------|
| 候補収集〜送信記録フロー | **変更なし**（ゲート・手動送信維持） |
| 既存 Lead / 営業文 / 送信記録 | **上書き・一括再生成なし** |
| Daily30 Cloud Run | **非接触**（別サービス推奨） |
| ローカル UI | suppression 一覧・テンプレート編集は継続。データ源が GCS になる可能性 |
| WORK_LOG | 通常営業運用 / Phase 44 開発の 2 区分維持 |

---

## 15. Phase 44.1 Go / No-Go 条件

### 最低条件（すべて必須）

| # | 条件 | 判定 |
|---|------|------|
| 1 | 公開 URL（ドメイン）決定 | ❌ 未 |
| 2 | HTTPS 有効 | ❌ 未 |
| 3 | suppression 本番永続化（GCS 等）設計承認 | ❌ 未 |
| 4 | `UNSUBSCRIBE_TOKEN_PEPPER` 設定 | ❌ 未 |
| 5 | rate limit 方針 | ❌ 未 |
| 6 | unsubscribe 冪等性（コード済・本番 store で検証要） | ⚠️ mock のみ |
| 7 | 全送信入口 suppression ブロック + **fail-closed** | ⚠️ 入口は済、fail-closed 未 |
| 8 | 配信停止文面・画面の人間確認 | ⚠️ 文案・法務方針は承認済み。live 送信前最終チェックリストは未 |
| 9 | 障害時 fail-closed 実装 | ❌ 未 |
| 10 | rollback 手順文書化 | ✅ 本ドキュメント §11 |
| 11 | Human Approval 完了 | ⚠️ 文案・法務方針は済。インフラ・fail-closed は未 |

### 現在の判定

## **No-Go** — Phase 44.1 配信停止 live 化は開始しない

**理由:** 公開 URL・HTTPS・Secret・本番永続化・fail-closed 実装が未達。mock 実装・文案・法務表示方針は整備済み。

**次のアクション（人間）:** §12 チェックリスト 1〜5・fail-closed を順に実施 → Go 再評価。live 送信前に最終チェックリストを実施。

---

## 16. 参照

- `docs/GROWLY_SALES_MAIL_OPERATIONS_UPGRADE.md`
- `docs/GROWLY_SALES_SAFETY_RULES.md`
- `docs/GROWLY_SALES_CLOUD_SCHEDULER_DEPLOY.md`
- `WORK_LOG.md` / `NEXT_TASKS.md`
