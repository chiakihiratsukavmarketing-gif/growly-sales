# Growly Sales — WORK_LOG

作業履歴の簡易ログ。詳細な Phase 履歴は `docs/GROWLY_SALES_RUN_LOG.md` / `docs/GROWLY_SALES_PROJECT_STATE.md` を参照。

> **注意:** `OneDrive\ドキュメント\growly\WORK_LOG.md` は **Growly SNS分析アプリ** 用です。本ファイルは **Growly Sales** 専用です。

**ワークスペース:** `C:\Users\chiak\AI_\Growly Sales`

---

## 記録区分（Phase 43 以降）

以降のエントリは **通常営業運用** と **Phase 43開発** を分けて記録する。開発作業で通常運用の過去記録を上書き・削除しない。

### 通常営業運用 — 記録項目

毎回記録: 収集件数 / メール営業候補数 / Lead化承認件数 / 営業文作成件数 / Gmail下書き候補数 / Gmail手動送信件数 / 開封済み件数 / 参考開封率 / 返信件数 / 配信停止件数 / フォローアップ件数 / 運用上の詰まり

## 通常営業運用

### 2026-07-06 — 日次（Phase 44.0 監査セッション）

| 項目 | 値 |
|------|-----|
| 収集件数 | 今回未取得 |
| メール営業候補数 | 今回未取得 |
| Lead化承認件数 | 今回未取得 |
| 営業文作成件数 | 今回未取得 |
| Gmail下書き候補数 | 今回未取得 |
| Gmail手動送信件数 | 今回未取得 |
| 開封済み件数 | 今回未取得 |
| 参考開封率 | 今回未取得 |
| 返信件数 | 今回未取得 |
| 配信停止件数 | 今回未取得 |
| フォローアップ件数 | 今回未取得 |
| 運用上の詰まり | なし（監査セッション） |

## Phase 43開発

### 2026-07-06 — Phase 43.1 基準線・設計確定 ✅

| 項目 | 内容 |
|------|------|
| 進行 | Phase 43 **1 / 4** 完了 |
| 開封計測 | endpoint・event schema・token hash・mock 境界を設計（`docs/GROWLY_SALES_MAIL_OPERATIONS_UPGRADE.md` §5） |
| 配信停止 | suppression モデル・URL/token・冪等・チェック挿入点を設計（§3） |
| カスタムメール | ブロックモデル・AI/人間分離・次回生成から適用を設計（§4） |
| build / verify | `ui:build` スキップ（UI 未変更）/ Phase 43.1 verify 4件 ✅ / 全体は既存失敗あり |
| mock / live | **mock のみ**。公開 URL・GCS 書き込み・DDL・env 変更なし |
| 人間作業待ち | 公開 unsubscribe URL・Cloud Run・env secret・live 配信停止・pixel 埋め込み |
| 未解決事項 | `doNotContact` と suppression の同期方針（43.2 で実装時に確定） |

**成果物:** `docs/GROWLY_SALES_MAIL_OPERATIONS_UPGRADE.md`（仕様正本）

**禁止遵守:** Gmail送信なし / DDLなし / envなし / commit・pushなし

### 2026-07-06 — Phase 43.2 配信停止・配信禁止 mock ✅

| 項目 | 内容 |
|------|------|
| 進行 | Phase 43 **2 / 4** |
| suppression型 | `mail-operations/suppressionTypes.ts` |
| mock store | `mail-suppressions.json`（空初期・gitignore） |
| フック | 営業文生成・下書き候補・下書き作成・フォローアップ・再送候補 |
| UI | 設定「配信禁止リスト」・各画面ブロック表示 |
| mock unsubscribe | `/api/mock/unsubscribe/:token`（ローカルのみ） |
| build / verify | `ui:build` ✅ / Phase 43.2 verify 8件 ✅ / 全体は既存失敗あり |
| live | **未接続**（公開URL・GCS・env なし） |
| 人間作業待ち | 公開 unsubscribe URL・Cloud Run・live 配信停止 |

### Phase 43開発 — 記録項目

毎回記録: 開封計測の進捗 / 配信停止機能の進捗 / カスタムメール機能の進捗 / build・verify結果 / mock・liveの状態 / 人間作業待ち / 未解決事項

### 2026-07-06 — Phase 43.3 カスタムメールテンプレート mock ✅ pushed `51acf05`

| 項目 | 内容 |
|------|------|
| 進行 | Phase 43 **3 / 4** |
| テンプレート型 | `templateTypes.ts` / `OutreachTemplate` |
| mock store | `outreach-templates.json`（gitignore） |
| レンダラー | `templateRenderer.ts` — 次回 `generateSalesEmail` から適用 |
| バリデーション | 未解決プレースホルダ・最大文字数・有効化時配信停止ブロック必須 |
| UI | 設定「営業メールテンプレート」— 下書き・プレビュー・有効化（TEMPLATE_ACTIVATE） |
| build / verify | `ui:build` ✅ / Phase 43.3 verify 6件 ✅ / 全体は既存失敗あり |
| live | 未接続 |
| 人間作業待ち | 本番テンプレート運用方針の承認 |

### 2026-07-06 — Phase 43.4 開封計測 mock ✅ pushed `fc1a686`

| 項目 | 内容 |
|------|------|
| 進行 | Phase 43 **4 / 4** mock 完了・pushed `fc1a686` |
| 型・store | `openTrackingTypes.ts` / `email-send-tracking.json` + `email-open-events.json`（gitignore） |
| トークン | `tokenHash` のみ保存（生 token 非永続） |
| フック | 手動送信記録時のみ mock tracking 作成（suppression 済みは発行しない・既存送信記録は不変） |
| 集約 | `openTrackingAggregator.ts` — rawEventCount / openCount 分離 |
| privacy | UA カテゴリのみ・IP 非保存・プロキシ疑いフラグ |
| mock API | `POST /api/mock/open-events` / `GET /api/send-records/:leadId/open-stats` |
| UI | 送信記録「開封（参考）」バッジ / ダッシュボード参考開封率 |
| build / verify | `ui:build` ✅ / Phase 43.4 verify 7件 ✅ / 全体は既存失敗あり |
| live | **未接続**（`/t/{token}.gif`・下書き pixel なし） |
| 人間作業待ち | live pixel 埋め込み・公開 endpoint・env |

### 2026-07-06 — Phase 44.0 live 化前安全確認 ✅

| 項目 | 内容 |
|------|------|
| 進行 | Phase 44 **0 / 3**（監査のみ） |
| 成果物 | `docs/GROWLY_SALES_MAIL_OPERATIONS_LIVE_READINESS.md` |
| suppression 保存先 | **GCS JSON + generation-match 推奨**（小規模パイロット） |
| endpoint 配置 | **専用 Cloud Run `growly-sales-mail-ops` 分離推奨** |
| Phase 44.1 判定 | **No-Go**（公開 URL・HTTPS・Secret・fail-closed・法務確認未達） |
| build / verify | `ui:build` ✅ / Phase 43 verify 維持 / 2685 passed, 57 failed |
| 実装・変更 | **未実施**（endpoint・Cloud・env・GCS live・Gmail 変更なし） |
| commit / push | **未実施** |

### 2026-07-06 — Phase 44.1 配信停止 live 化準備（tenant 境界・interface 追加）✅ pushed `9d07810`

| 項目 | 内容 |
|------|------|
| 方針 | **自社（Want Reach）優先** + 将来 SaaS 化できる境界を先に整備 |
| 既定 tenant | `want-reach` |
| 公開候補 | `mailops.wantreach.jp`（**まだ live メールへ適用しない**） |
| 追加 | tenant model / public URL resolver / suppression scope（tenant/platform）/ store interface |
| build / verify | `ui:build` ✅ / 2711 passed, 62 failed / Phase 43.1〜43.4 ✅ / Phase 44.1 verify 10件 ✅ |
| Phase 44.1 判定 | **No-Go 維持**（live endpoint・Cloud・env・GCS live 未接続） |

### 2026-07-07 — Phase 44.1 Human Approval: contactEmail ✅

| 項目 | 内容 |
|------|------|
| 承認項目 | **問い合わせ先メールアドレス（contactEmail）** |
| 確定値 | `info@wantreach.jp` |
| 設定場所 | `tenantResolver.ts` の Want Reach 既定 tenant のみ（Secret ではなく tenant 設定として一元管理） |
| 参照経路 | `resolveMailOperationsTenant` → `buildUnsubscribeScreenCopy` → mock 配信停止 API（`contactEmail` フィールド） |
| 未適用 | Gmail 下書き本文 / live endpoint / 既存送信済みメール |
| Phase 44.1 判定 | **No-Go 維持** |
| commit / push | **未実施**（ローカル変更のみ） |

### 2026-07-07 — Phase 44.1 Human Approval: 配信停止メール末尾文面 ✅

| 項目 | 内容 |
|------|------|
| 承認項目 | **配信停止メール末尾文面** |
| 生成 | `buildUnsubscribeEmailFooterCopy(tenant)` — displayName / legalName / contactEmail / `buildUnsubscribeUrl` 経由 |
| 所在地 | **表示しない**（Human Approval 済み） |
| mock 反映 | `GET /api/mail-suppressions/unsubscribe-footer-preview` / 配信禁止リスト UI |
| 未適用 | Gmail 下書き本文 / live endpoint / 既存送信済みメール |
| 法務表示 | **別項目・未完了**（§12 #6 維持） |
| Phase 44.1 判定 | **No-Go 維持** |
| commit / push | **未実施**（ローカル変更のみ） |

### 2026-07-07 — Phase 44.1 配信停止メール末尾文面（tenant 参照・mock プレビュー）✅

| 項目 | 内容 |
|------|------|
| 実装 | `buildUnsubscribeEmailFooterCopy` — Human Approval 済み文案を tenant から生成 |
| API | `GET /api/mail-suppressions/unsubscribe-footer-preview?tenantId=` |
| UI | 配信禁止リストの末尾案内プレビューを API 経由表示（ハードコード削除） |
| Human Approval | **配信停止メール末尾文面 — 承認済み**（法務最終確認は別項目） |
| 未適用 | Gmail 下書き本文 / live endpoint / 既存送信済みメール |
| Phase 44.1 判定 | **No-Go 維持** |

### 2026-07-07 — Phase 44.1 Human Approval: 法務表示方針・配信停止画面文案 ✅

| 項目 | 内容 |
|------|------|
| 法務表示方針 | メール全体で送信者名・所在地・問い合わせ先・配信停止方法を表示。所在地は本文内のみ（フッター重複なし） |
| 配信停止画面 | `UnsubscribeScreenState` 5 状態 — `buildUnsubscribeScreenStateCopy(tenant, state)` |
| 送信可否 | 表示要件と送信可否は別管理。suppression 登録済みは全入口で停止 |
| 免責 | 一般的運用確認であり個別案件の法的保証ではない。live 送信前に最終チェックリスト実施 |
| mock 反映 | `/api/mock/unsubscribe/:token` が `screenState` を返す |
| 未適用 | Gmail 下書き / live endpoint / Cloud / DNS / Secret / GCS live |
| Phase 44.1 判定 | **No-Go 維持** |
| commit / push | **未実施** |

### 2026-07-07 — Phase 44.1 mock 配信停止画面 GET/POST・maskedEmail ✅

| 項目 | 内容 |
|------|------|
| maskedEmail | `maskEmailForDisplay` — `in***@example.jp` 形式。API は maskedEmail のみ |
| mock GET | 確認のみ（停止しない）— confirm / already_unsubscribed / invalid_or_expired / temporary_error |
| mock POST | 冪等 — completed / already_unsubscribed / invalid_or_expired / temporary_error |
| token 保護 | tokenHash のみ保存。response に生 token / tenantId / leadId / normalizedEmail なし |
| fail-closed | `SuppressionStoreUnavailableError` — 読込失敗時は全入口で処理停止 |
| UI | 5 状態プレビュー + token 検証（mock 明示・live未接続・Gmail未適用） |
| 未適用 | live endpoint / GCS live / Gmail 下書き自動挿入 / Cloud / DNS / Secret |
| Phase 44.1 判定 | **No-Go 維持** |
| commit / push | **未実施** |

### 2026-07-07 — Phase 44.1 調査: suppression の GCS 本番保存先（設計案作成・読み取りのみ）

| 項目 | 内容 |
|------|------|
| 目的 | suppression の GCS 正本化（競合制御 / バックアップ / 復旧 / IAM 最小権限）を Human Approval 用に設計 |
| 既存 helper | `storageBackend.ts`（backend/bucket/prefix）/ `storage/gcsJsonStorage.ts`（backup + ifGenerationMatch） |
| 競合制御 | `gcsWriteJsonIfGenerationMatch` は既存あり（precondition 書き込み）。mail-ops 側は未接続 |
| バックアップ | `gcsBackupBeforeWrite`（copy）パターンあり。mail-operations 用 prefix/命名は Human Approval 待ち |
| 未実施 | 実 GCS read/write / Cloud / IAM / env / Secret 変更なし |
| Phase 44.1 判定 | **No-Go 維持** |

### 2026-07-07 — Phase 44.1 Human Approval: suppression GCS 保存設計 ✅（設計のみ）

| 項目 | 内容 |
|------|------|
| 保存先 | `<existing-prefix>/mail-operations/` |
| suppression 正本 | `mail-suppressions.json` |
| token | `unsubscribe-tokens.json` |
| audit | `audit/YYYY/MM/DD/<timestamp>-<correlationId>.json`（event-per-object） |
| backup | `backups/mail-suppressions/<timestamp>-<generation>.json`（更新前） |
| 競合制御 | generation-match 必須（最大 retry 5、exponential backoff + jitter、新規は `ifGenerationMatch=0`） |
| fail-closed | 読込/書込失敗時は fail-closed。completed 表示前に保存成功を確認 |
| backup 失敗 | 本更新中止 |
| delete 権限 | Cloud Run に付与しない |
| IAM | Conditions で prefix 限定 |
| rollback | Human Approval 付き手動復旧 |
| audit 失敗 | suppression 成功を優先（運営アラート対象） |
| 将来移行 | `MailSuppressionStore` interface のまま `DatabaseMailSuppressionStore` へ交換 |
| 未実施 | 実 GCS 書き込み / IAM 変更 / env 変更 / Secret 設定 / Cloud 変更なし |
| Phase 44.1 判定 | **No-Go 維持** |

### 2026-07-07 — Phase 44.1 調査: mail-ops 専用 Cloud Run 構成（設計案・読み取りのみ）

| 項目 | 内容 |
|------|------|
| 既存調査 | `Dockerfile`（node:20-slim）/ `05-deploy-cloud-run.sh` / `cloudDeployConfig.ts` / `GROWLY_SALES_CLOUD_SCHEDULER_DEPLOY.md` |
| 推奨サービス | `growly-sales-mail-ops`（Daily30 と分離） |
| SA 案 | `growly-mail-ops-runner`（Places / Scheduler 権限なし） |
| スケール | min 0 / max 2 / concurrency 5 / timeout 30s |
| endpoint | `GET /health`, `GET/POST /u/{token}`, 将来 `GET /t/{token}.gif` |
| セキュリティ | token ログマスク・path 正規化・rate limit 案（60 req/min/IP） |
| IAM | prefix 限定 `mail-operations/**`、delete なし |
| 未実施 | Cloud Run 作成・デプロイ / IAM / DNS / env / Secret / GCS live 書き込みなし |
| Phase 44.1 判定 | **No-Go 維持** |
| commit / push | `84739d1` |

### 2026-07-07 — Phase 44.1 実装: GCS store 土台 + mail-ops slim コンテナ ✅

| 項目 | 内容 |
|------|------|
| GCS store | `gcsJsonMailSuppressionStore.ts` — generation-match / retry 5 / backup / idempotent |
| Schema | `gcsDocumentTypes.ts` — `schemaVersion: 1`、legacy `version` 移行 |
| Audit | `gcsSuppressionAuditWriter.ts` — event-per-object |
| Factory | `createMailSuppressionStore.ts` — mock 既定、live+local 拒否 |
| mail-ops | `server/mailOpsServer.ts` — `/health`, `/u/:token` のみ |
| Docker | `scripts/cloud/growly-mail-ops/Dockerfile` + DRY-RUN deploy scripts |
| verify | Phase 44.1 +15件（in-memory GCS adapter）/ 2888 passed |
| 未実施 | 実 GCS / Cloud デプロイ / IAM / Secret / `MAIL_OPS_MODE=live` |
| Phase 44.1 判定 | **No-Go 維持** |

### 2026-07-07 — Phase 44.1 調査: mail-ops IAM・Secret 構成（設計案・未適用）

| 項目 | 内容 |
|------|------|
| 既存参照 | `04-service-account.sh` / `GROWLY_SALES_CLOUD_SCHEDULER_DEPLOY.md` §3–4 |
| SA 案 | `growly-mail-ops-runner`（Daily30 SA 非共有） |
| GCS | `objectUser` + IAM Condition `mail-operations/**`、delete なし |
| Invoker | サービス全体 `allUsers`（path 単位公開は不可） |
| Secret 案 | `unsubscribe-token-pepper` のみ（Places/Daily30 token 不要） |
| 未実施 | SA 作成 / IAM / Secret 作成 / Cloud Run デプロイ |
| Phase 44.1 判定 | **No-Go 維持** |

### 2026-07-07 — Phase 44.1 統合: live readiness guards ✅

| 項目 | 内容 |
|------|------|
| Runtime config | `mailOpsRuntimeConfig.ts` — mock 既定・値非表示 |
| Readiness | `validateMailOpsLiveReadiness` — HTTPS / GCS / pepper / localhost 拒否 |
| Server | `mailOpsServerContext` + health 503 / live guard / store factory |
| Validate CLI | `npm run growly-sales:mail-ops:validate` |
| チェックリスト | §7.18 適用前手順（実行なし） |
| verify | Phase 44.1 +14件 / 2902 passed（既存失敗あり） |
| 未実施 | MAIL_OPS_MODE=live 実環境 / GCS / IAM / Secret / Cloud |
| Phase 44.1 判定 | **No-Go 維持** |

## 2026-07-03 — Phase 42 通常運用UI改善 **完了** ✅

**進行:** 通常運用UI改善 **7 / 7 フェーズ完了**

### 42.1 実装

- 企業検索バー sticky（SearchAndFilterBar + 候補収集ツールバー）
- 送信記録 `variant="send-record"` で収集元を強調表示
- フォローアップ企業クリック → 返信管理へ `highlightLeadId` 遷移

### 42.2 実画面確認（`http://localhost:3847`）

| 確認項目 | 結果 |
|----------|------|
| 送信記録スクロール後も検索バー表示 | ✅ sticky 動作 |
| 送信記録の収集元ブロック | ✅ 表示確認 |
| フォローアップ → 返信管理 | ✅ タカコウ・ハウス等で該当企業フォーム表示 |
| Console 重大エラー | なし |

### 42.3 候補収集 sticky 重なり修正

- 原因: ヘッダーと検索バーが同一 `.tab-scroll` で両方 `top: 0` sticky → 検索バーがサマリーに被る
- 修正: `tab-scroll-candidate-collection` でネストスクロール（上部固定 + 作業領域内 sticky 検索）
- 実画面: 収集結果 / Lead化・営業文タブで重なりなし ✅

### 42.4 送信記録 URL 分離表示

- **収集方法** / **企業の発見元URL** / **公式サイト** / **メール取得元** を分離
- URL なしは **URL未記録**（推測生成なし）
- レガシー Lead 20件: `discoverySourceUrl` 未保存のため発見元URLは URL未記録（仕様上正常）

### 42.5 実画面最終確認・完了判定

| タブ | 結果 |
|------|------|
| 送信記録 | ✅ 4項目分離・リンク `target=_blank` / `noopener`・検索 sticky・重なりなし |
| 候補収集 | ✅ ネストスクロール・検索 sticky・重なりなし・React #310 なし |
| Lead一覧 | ✅ 検索 sticky・フィルター操作可・公式サイト/メール取得元表示 |
| 下書き候補 | ✅ 候補0件（空状態）・CREATE_DRAFTS ゲートのみ・自動送信なし |
| 返信管理 | ✅ 検索 sticky・右ペイン詳細表示 |
| フォローアップ | ✅ タカコウ・ハウス / 浅野工務店クリックで返信管理へ遷移・詳細表示 |
| レスポンシブ（900px） | ✅ URL はみ出しなし・検索折り返し |

**build / verify:** `ui:build` ✅ / Phase 42.1–42.5 ✅ / 全体 2360 passed, 46 failed（既存・Phase 42 新規失敗なし）

### 42.6 収集元列拡張

- 収集元列を拡張し、通常表示で「Google Places / 公式サイト検索」等を全文確認可能

### 42.7 候補5件表示（密度調整）

- 初期画面で候補5件表示を目標にツールバー圧縮・一覧スクロール領域を調整

### 42.8 レイアウト崩れ修正

- 二重スクロール・sticky競合・補助情報重なりを修正（primary / aux 分離、queue-header をスクロール外へ）

### 42.9 実画面最終確認

| 確認項目 | 結果 |
|----------|------|
| 初期表示で候補5件完全表示 | ✅ |
| 収集元全文表示 | ✅ |
| ボタン切れ・潜り込み・重なり | なし |
| ui:build | ✅ |
| Phase 42.6〜42.9 verify | ✅ |

**build / verify:** `ui:build` ✅ / Phase 42.6–42.9 ✅ / 全体 2404 passed, 47 failed（既存のみ）

**既知の軽微事項（非ブロッカー）**

- 一覧ヘッダーと行の列位置差が最大約5px（スクロールバー補正）
- 補助情報表示時に `work` と `queue-body` のスクロールが同時に出る場合あり
- いずれも操作阻害なし

**次ゴール: 人間確認待ち**（git commit 済・push は人間承認後。勝手に次フェーズを開始しない）

## 2026-07-03 — Phase 41.5J 外部参照 Daily 30 本運用α **完了** ✅

**進行:** 外部参照 Daily 30 本運用α **18 / 18 フェーズ完了**

### Cloud 自然実行（2026-07-03 09:07 JST）

- batchId: **2026-07-03** / revision: `growly-sales-daily30-00005-2nq`
- status: `partial_success` / stoppedReason: `max_candidates_reached`
- supplement state: `runs['2026-07-03']` に 8キー保存済み
- networkAccessPerformed: **false** / manual: **4/4** / 東京除外: **NO**
- 候補総数 **276**（本日 +120）/ 本日 Lead化レビュー **28**

### compliance・UI・build

- UI/API矛盾 **0** / updateEligible **0**
- ui:build **成功** / verify **2301 passed, 46 failed**（既存・Phase 41.5 全通過）
- UI実画面: 本日batch反映・28件・判定矛盾なし・外部参照ドロワー動作

### 41.5J 修正

- `normalizeExternalLeadCandidate.ts` — `normalizeWebsiteUrl` import 修正（verify fatal 解消）
- `verifyPhase415JExternalReferenceAlphaComplete` 追加

**次ゴール: 人間確認待ち**（勝手に次フェーズを開始しない）

## 2026-07-02 セッション締め

**本日の到達点:** 外部参照 Daily 30 本運用α **17 / 18**（本運用αは **未完了**）

| 完了 | 内容 |
|------|------|
| ✅ | Phase 41.5G — Lead化承認判定の矛盾修正・監査 |
| ✅ | Phase 41.5H — compliance dry-run |
| ✅ | Phase 41.5H-2 — GCS compliance 23件永続化（バックアップ・再監査済み） |
| ✅ | Phase 41.5I — 診断完了（Cloud supplement state 未達で本運用α保留） |
| ✅ | ui:build 修復（browser-safe モジュール分離） |

**明日の最初の作業（人間）:** 2026-07-03 09:00 JST 自然実行後 → Phase **41.5J**

```powershell
cd "C:\Users\chiak\AI_\Growly Sales"
npm run growly-sales:phase-c-cloud-status
```

合格目安: `batchId=2026-07-03`、supplement 8キーが raw GCS に存在、manual 候補数が数値、東京除外、networkAccessPerformed=false

**今日やらないこと:** 再デプロイ / Scheduler / Secret 変更 / Gmail送信・下書き本番 / force=true / 自動Lead化

**GCS バックアップ（compliance apply）:** `gs://growly-sales-daily30/prod/growly-sales/external-candidates.json.2026-07-02T14-41-36-919Z.bak`

**未コミット:** 本日のコード・docs・dist/ui 変更はワークツリーに残存（コミットは未実施）

---

## 2026-07-02 — Phase 41.5I Cloud state 確認・本運用α最終判定（未完了）

**進行:** 外部参照 Daily 30 本運用α **17 / 18 フェーズ**（本運用αは未完了）  
**次:** Phase 41.5J — 2026-07-03 09:00 JST 自然実行後の supplement state 再確認

### Cloud state（読み取り）

- 最新 batchId: **2026-07-02**（finishedAt 2026-07-02T00:04:53Z = 09:04 JST）
- status: partial_success / revision 対象: **growly-sales-daily30-00005-2nq**（14:54 JST デプロイ）
- raw GCS supplement 8キー: **すべて inRaw: false**（41.5F 未達継続）
- networkAccessPerformed: false（型上） / 東京除外: NO

### compliance 再監査 ✅

- audit-lead-approval-judgment: 矛盾 **0**
- phase415h dry-run: updateEligible **0** / 156件維持 / 意図的スキップ4件のみ

### ui:build 修復 ✅

- 原因: UI bundle が `outreachPolicy` → `offerProfile` → `paths.ts` および `dedupe` → `normalizeExternalLeadCandidate` → `targetProfile` を引き込み
- 修正: `offerProfileRules.ts` / `targetProfileRules.ts` / `externalCandidateUrlUtils.ts` に分離
- **Phase 41.5H-2 とは無因果**（既存の shared import 問題）
- `npm run growly-sales:ui:build` → **成功**

### UI 実画面（localhost:3847）

- 白画面なし / 1件ずつ・前へ次へ・Lead化承認ボタン表示
- 福井建設: 公式サイト代表メール確認済み + Lead化可能（矛盾なし）

### verify

- `verifyPhase415IFinalAlphaJudgment` 追加
- Phase 41.5G/H/H-2/I 専用チェック通過（全体 failed は既存46件前後）

## 2026-07-02 — Phase 41.5H-2 GCS compliance 永続化 apply ✅

**進行:** 外部参照 Daily 30 本運用α **16 / 17 フェーズ**  
**次:** Phase 41.5I — Cloud state 確認・本運用α最終判定

### apply 結果

- コマンド: `npm run growly-sales:phase415h-compliance-apply -- --apply --confirm=APPLY_COMPLIANCE_REFRESH`
- 更新前 generation: `1782965285076398` → 書き込み後: `1783003297651494`
- バックアップ: `gs://growly-sales-daily30/prod/growly-sales/external-candidates.json.2026-07-02T14-41-36-919Z.bak`（検証 OK）
- 更新: **23件** / `sourceComplianceStatus` + `sourceComplianceNote` + `sourceComplianceCheckedAt`
- 候補総数 **156** 維持 / compliance 以外差分 **0** / GCS書き込み **1回**
- 再監査: `audit-lead-approval-judgment` 矛盾 **0** / dry-run `updateEligible` **0**
- verify: Phase 41.5H-2 ✅（2275 passed, 46 failed は既存）

### 23件 vs 26件・厳しくなる1件

- **26→23:** 3件は `imported_or_excluded`（ウツミ工務店・住まいのリフォーム・AKCIA・㈱徳田工務店）
- **厳しくなる1件:** Banana works LABO（`66309f56-…`）— `imported` のため **23件外**（stored `official_site_verified` → fresh `blocked_by_policy` / プレースホルダメール）

### 実装

- `phase415hCompliancePersistenceApply.ts` / `run-growly-sales-phase415h-compliance-apply.ts`
- `gcsWriteJsonIfGenerationMatch` / バックアップ検証
- `sourceComplianceCheckedAt` optional フィールド
- `verifyPhase415H2CompliancePersistence`

## 2026-07-02 — Phase 41.5H GCS compliance 永続化 dry-run（人間承認待ち）

**進行:** 外部参照 Daily 30 本運用α **15 / 17 フェーズ**  
**GCS書き込み: 0件**

### dry-run

- コマンド: `npm run growly-sales:phase415h-compliance-dry-run`
- GCS生JSON 156件 / 更新対象 **23件** / status相違 26件（多くは `email_not_found` → `official_site_verified`）
- generation: `1782965285076398`（apply時競合検知用）
- レポート: `data/growly-sales/phase415h-compliance-dry-run-report.json`
- 41.5G前提（UI/API矛盾）: **0件** ✅

## 2026-07-02 — Phase 41.5G Lead化承認判定の根本監査・不整合修正

**進行:** 外部参照 Daily 30 本運用α **15 / 16 フェーズ**  
**現在地:** Phase 41.5G 完了 → 次: **41.5H** 既存候補の安全な再評価（GCS永続化）・**41.5I** Cloud state 最終確認

### 根本原因

1. **`getLeadApprovalComplianceBlockReason`** が保存済み `sourceComplianceStatus` を優先し、鮮度のない `email_not_found` 等でブロックしていた
2. **`enrichExternalLeadCandidate`** が既存 `sourceComplianceStatus` を温存し、読み込み時に再評価していなかった
3. **フォーカスUI** が `emailSourceConfirmed`（URL記録の有無）を「公式サイト代表メール確認済み」と誤表示
4. **`approveExternalCandidateForLead` API** が compliance ブロックを再判定していなかった

### 修正

- `evaluateSourceCompliance` を常に最新判定源に統一
- `enrichExternalLeadCandidate` → `applySourceComplianceFields` で読み込み時再計算
- `resolveDaily30LeadApprovalJudgment.ts` — UI/API 共通判定
- フォーカスカード判定行を `representativeEmailLabel` に統一
- 承認 API に `getDaily30LeadApprovalBlockReason` ゲート追加
- `isUrlOnOfficialSiteDomain` — サブドメイン一致対応
- `verifyPhase415GLeadApprovalJudgmentAudit` / `growly-sales:audit-lead-approval-judgment`

## 2026-07-02 — Phase 41.5F supplement state 最終確認（未合格）

**進行:** 外部参照 Daily 30 本運用α **14 / 15 フェーズ（Cloud state 未達で保留）**  
**現在地:** Phase 41.5F 診断完了 → 次: **2026-07-03 09:00 JST 自然実行後** に再確認

### 診断結果（`npm run growly-sales:phase-c-cloud-status`）

- 最新 batchId: `2026-07-02`（**当日 JST だが supplement 版 revision 実行前のエントリ**）
- status: `partial_success` / 東京なし ✅ / `networkAccessPerformed=false`（未記録→デフォルト）✅
- **supplement 系フィールドは GCS state JSON 全体に 1件も未保存**（`externalReference` キーなし）

### 時系列（読み取り専用調査）

| イベント | 時刻（UTC → JST） |
|----------|-------------------|
| 2026-07-02 自然実行完了 | `00:04:53 UTC` → **09:04 JST** |
| revision `00005-2nq` 作成（Phase 41.4.1） | `05:54:21 UTC` → **14:54 JST** |
| GCS state `updatedAt` | `00:04:53 UTC`（以降更新なし） |

- 自然実行は **revision 00004 以前**（supplement state 書き込みなし）で実行された
- traffic 100% は `00005-2nq` だが、**次回 9:00 JST 自然実行（2026-07-03）は未実施**
- コード: `attachSupplementToEntry` → `supplementResultToStateFields` → `recordCloudRunEntry` は実装済み。serializer でフィールド脱落なし
- 同日再実行は `DUPLICATE_GUARD_ALREADY_RAN`（force=false）でスキップ

### 判定

- **未合格** — 15/15 本運用α完了には進めない
- **人間作業:** 2026-07-03 09:00 JST 自然実行後に `phase-c-cloud-status` 再実行。`force=true` / 再デプロイは不要（00005 は既に traffic 100%）

## 2026-07-02 — Phase 41.5E 1件ずつフォーカスモード

**進行:** 外部参照 Daily 30 本運用α **13 / 14 フェーズ（UI完了・Cloud state未達）**  
**現在地:** Phase 41.5E UI完了 → 次: **Phase 41.5F** 次回9:00自然実行後の supplement state 確認

### 変更点（UI）

- 収集結果 / Lead化・営業文タブに **[1件ずつ] [一覧]** 切替（初期値 focus、localStorage にモードのみ保存）
- `Daily30CandidateFocusView` — 1候補カード、判定表示、前へ/次へ、残件数・処理済み件数
- 「あとで確認」— セッション内でキュー末尾へ移動（全件defer時はリセット導線）
- Lead化承認・除外成功後に次候補へ（`recordProcessed` + キュー更新）
- 一覧モードは Phase 41.5D のキューUIを維持
- `verifyPhase415EFocusMode` 追加

### Cloud state（2026-07-02 診断時点）

- 最新 batchId `2026-07-02` / partial_success / 東京なし ✅
- `externalReferenceSupplement*` 系フィールド **未記録**（attempted=false, mode=—）
- 原因推定: 当日自然実行が supplement state 書き込み前の revision で実行された可能性
- **本運用α完了は次回9:00 JST自然実行後の state 確認まで保留**

### 実画面確認（2026-07-02）

- 候補収集タブ白画面なし / React error #310 なし
- [1件ずつ] [一覧] 切替（収集結果・Lead化タブ）動作
- フォーカス1件表示・前へ/次へ・残件数（23 / 26）表示
- 一覧モードは Phase 41.5D キュー（23件・ページング）維持
- Lead化承認・除外の本番操作は未実施（人間確認待ち）

### build / verify

- `npm run growly-sales:ui:build` ✅
- Phase 41.5A / 41.5C / 41.5D / **41.5E** ✅

## 2026-07-02 — Phase 41.5D 候補収集UIの作業キュー化

**進行:** 外部参照 Daily 30 本運用α **13 / 14 フェーズ**  
**現在地:** Phase 41.5D 完了 → 次: Phase 41.5E（1件ずつフォーカスモード・本運用α最終判定）

### 変更点（UI）

- 上部サマリーを **1行（今日/明日）** に圧縮し、作業キューを画面上部へ
- 画面幅を **最大1400px** に拡大
- 収集結果の **重複一覧（メール取得済 + フィルター結果）を単一作業キューに統合**
- 実行メタ・収集設定・supplement を **「今日の収集情報」折りたたみ** へ移動
- 候補一覧を **キュー行レイアウト**（会社名｜エリア｜メール｜状態｜収集元｜操作）に変更
- 人間ゲート・TabErrorBoundary・Hook順序（41.5C）を維持

### build / verify

- `verifyPhase415DWorkQueueUi` 追加

## 2026-07-02 — Phase 41.5C React error #310 Hook順序修正

**進行:** 外部参照 Daily 30 本運用α **11 / 12 フェーズ**  
**現在地:** Phase 41.5A 完了 → 次: Phase 41.5B 最終完了判定

### 変更点（UI）

- 候補収集タブを **作業タブ切替方式**へ（収集結果 / Lead化・営業文 / 下書き取り込み）
- 上部を **sticky** にして「今日の状態」「明日の設定（1行要約）」「作業ナビ」を固定
- 明日の収集設定は **要約 + 詳細（DevDetails）**へ
- 外部参照候補追加フォームは **右ドロワー**へ移動（通常画面を圧迫しない）
- 収集結果・Lead化・営業文は **検索/フィルター/10件ページング**を追加し、承認可能を優先表示
- 下書き取り込みは **0件時の表示を簡潔化**（大きなカード群を出さない）
- 技術名（discoverySourceUrl 等）は通常ラベルから除去し DevDetails へ
- TabErrorBoundary 維持（白画面回避）

### build / verify

- `npm run growly-sales:ui:build` ✅
- `verifyPhase415ACandidateCollectionUiOptimization` ✅（全体 verify は既存失敗あり）

## 2026-07-02 — Phase 41.4.1 Cloud Run 本番反映（外部参照補完の state/UI を反映）

**進行:** 外部参照 Daily 30 本運用α **10 / 11 フェーズ**  
**現在地:** Phase 41.4.1 完了 → 次: Phase 41.5 本運用α 完了判定

### build / verify

- `npm run growly-sales:ui:build` ✅
- `npm run growly-sales:verify` ✅（Phase 41.4 supplement checks passed）

### git

- commit: `9136f08`（push 済み）
- **注意:** `data/growly-sales/*`（運用データ）は commit 対象外

### Cloud Build

- build ID: `fa257460-fd85-494f-aa80-c15256fbfaf0`
- image: `asia-northeast1-docker.pkg.dev/growly-scheduler/growly-sales/growly-sales-daily30:latest`
- digest: `sha256:16cf9fbcf0c2bdef942a1d8db98f004f9eda38289a3b032bba1caf57ea9ae23b`
- secret 値のログ出力なし（確認）

### Cloud Run（growly-sales-daily30）

- revision: `growly-sales-daily30-00005-2nq`（traffic 100%）
- service account / env / secret 参照 / timeout / concurrency は維持（変更なし）
- Scheduler / Secret 変更なし

### 本番 dry-run（force=false）

- ok: true / mode: `dry_run`
- `externalReferenceSupplementMode: not_applicable`
- `externalReferenceNetworkAccessPerformed: false`
- 手動URL候補: available 4 / eligible 4
- **外部サイト実アクセスなし**（dry-run）
- **state 書き込みなし / schedule 消費なし / GCS 保存なし / Gmail API なし**

### 次回 9:00 JST 確認（Phase 41.5）

- `externalReferenceSupplementMode` / `externalReferenceWarnings` / `externalReferenceDisplayMessage`
- `externalReferenceManualCandidatesAvailable` / `Eligible`
- `networkAccessPerformed=false`
- 東京が plannedAreas に含まれない
- Gmail 送信・下書き作成なし

## 2026-07-02 — Phase 41.4 Daily 30 補完ルート接続（execution plan 参照・実アクセスなし）

**進行:** 外部参照 Daily 30 本運用α **10 / 11 フェーズ**  
**現在地:** Phase 41.4 完了 → 次: Phase 41.5 本運用α 完了判定

### 実装

- `daily30ExternalReferenceSupplement.ts` — supplement 判定・手動URL候補参照・warning / displayMessage
- `fetchDaily30Candidates.ts` — 通常収集後 / 早期 return 時に supplement 実行
- `runDaily30CloudAutoFetch.ts` — state entry + response に supplement フィールド
- `buildDaily30CloudDashboard.ts` — dashboard payload に supplement フィールド
- `Daily30ExternalReferenceSupplementBanner.tsx` — 候補収集タブ / 今日の収集結果
- `verifyPhase414Daily30ExternalReferenceSupplement`

### 方針

- `resolveDiscoveryAdapterExecutionPlan()` で canRun / mode を確認
- 未承認 / dry-run / blocked → 外部アクセスなし、warning 記録
- approved_for_low_frequency → adapter 呼び出しのみ（Phase 41.4: networkAccessPerformed 常に false）
- 手動 URL（`manual-external-reference`）を補完候補として参照（`blocked_by_policy` 除外）
- dryRun: plan 確認のみ。state / GCS / schedule 変更なし
- メール取得ガード維持（外部掲載サイトメール禁止・公式サイトのみ）

### Cloud Run

- **再デプロイ:** 必要（人間確認後・未実施）
- **Scheduler / Secret / force:** 不要

### verify

- Phase 41.4 ✅（全体 verify は既存失敗あり）

### 次

- Phase 41.5: 本運用α 完了判定（再デプロイ後の本番 1 回確認）

---

## 2026-07-02 — Phase 41.3 許可済み外部参照 adapter 基盤（低頻度実装前段）

**進行:** 外部参照 Daily 30 本運用α **9 / 11 フェーズ**  
**現在地:** Phase 41.3 完了 → 次: Phase 41.4 Daily 30 補完ルート接続

### 実装

- `externalReferenceApprovalConfig.ts` — サイト別承認 config（14 エントリ）
- `resolveDiscoveryAdapterExecutionPlan()` — canRun / mode / rate limit 判定
- `runDiscoveryReferenceWithPlan()` — dry-run / blocked / stub のみ（ネットワークなし）
- `GET /api/daily30-external-reference/approval-status`
- `Daily30ExternalReferenceApprovalPanel` — 候補収集タブ DevDetails 内
- `verifyPhase413ExternalReferenceAdapterFoundation`

### デフォルト方針

- 手動 URL: `approved_for_manual_url`
- 業界団体 / 地域ポータル: `approved_for_dry_run` のみ
- Wantedly / 求人ボックス等: `not_requested`
- Indeed / doda / マイナビ / リクナビ: `blocked`
- 人間承認なしに `approved_for_low_frequency` へ上げない

### verify

- Phase 41.3 ✅ / 全体 2112 passed, 40 failed（既存）

### 次

- Phase 41.4: Daily 30 補完ルートへの接続

---

## 2026-07-02 — Phase 41.2.1 手動URL投入 UI 実動作確認

**進行:** 外部参照 Daily 30 本運用α **8 / 11 フェーズ**  
**現在地:** Phase 41.2.1 完了 → 次: Phase 41.3

### 確認結果（実運用 UI）

- UI サーバー再起動後、候補収集タブ上部の `Not found` 解消
- `GET /api/daily30-collection-schedule` — 200
- `POST /api/daily30-external-reference/manual` — 200
- 手動 URL 投入フォームから候補登録成功（成功バナー・候補一覧更新を確認）
- `discoverySourceUrl` と `emailSourceUrl` の分離維持
- `shouldEnrichOfficialSiteEmail=false` で保存成功
- 外部掲載 URL への自動アクセスなし / Gmail send・`users.drafts.create` 未使用
- 既存 Lead / 送信履歴 / GCS 候補の削除なし

### 修正（41.2 実装後の UI 不具合）

- **原因:** 古い UI サーバー（Phase 41.2 前）が 3847 で稼働 → collection-schedule / manual API が 404。加えて `readApiError` が endpoint path を捨て `Not found` のみ表示。
- `apiError.ts` — 404 時に API path をエラー文に含める
- `displayLabels.ts` — `toUserFacingApiError` 追加
- `Daily30CollectionSchedulePanel` — ローカル warning（全体エラー汚染を防止）
- `Daily30ManualExternalReferencePanel` — インライン成功/エラー表示
- `selectDaily30LeadCandidates.ts` — 不足 export 追加

### verify

- Phase 41.2.1 チェック ✅ / 全体 2082 passed, 39 failed（既存）

### 次

- Phase 41.3: 許可済み外部参照 adapter の低頻度実装（サイト別人間承認後。interface / whitelist / rate limit / dry-run / stub 拡張から）

---

## 2026-07-02 — Phase 41.2 手動URL投入型の外部参照候補化

**進行:** 外部参照 Daily 30 本運用α **8 / 11 フェーズ**

### 実装

- `createManualExternalReferenceCandidate.ts` — 手動候補作成（掲載元URLへ fetch なし）
- `POST /api/daily30-external-reference/manual`
- `Daily30ManualExternalReferencePanel.tsx` — 候補収集タブ UI
- Lead化承認: 手動外部参照候補を一覧表示 + ブロック理由
- `verifyPhase412ManualExternalReference`

### verify

- Phase 41.2 ✅ / 全体 2073 passed, 39 failed（既存）

### 次

- Phase 41.3: 許可済みサイトの低頻度 adapter（人間承認後）

---

## 2026-07-02 — Phase 41.1 外部参照収集 承認準備

**進行:** 外部参照 Daily 30 本運用α **7 / 11 フェーズ**  
**現在地:** Phase 41.1 完了 → 次: Phase 41.2 手動 URL 投入

### 成果（調査・設計のみ）

- 新規: `docs/GROWLY_SALES_EXTERNAL_REFERENCE_APPROVAL.md`
- 14 サイト候補のリスク・優先順位
- 自動化可/不可の境界
- Phase 41.2 仕様案 / 41.3〜41.5 ロードマップ
- **実アクセス・スクレイピング:** 未実施

### 人間承認待ち

- 方針承認 → Phase 41.2 着手

---

## 2026-07-02 — Phase 40.6 外部掲載サイト参考ルート（安全基盤）

**現在地:** Growly Sales 全体 **Phase 40.6 完了** → 次: 実巡回（人間承認後）

### 実装

- `adapters/discovery/` — reference-only スタブ（5 discoverySource）
- `sourceCompliance.ts` — コンプライアンス判定 / sanitize / Lead化ブロック理由
- `getDaily30LeadApprovalBlockReason` — blocked_by_policy / 公式サイト未確認
- `enrichCandidateEmailFromWebsite` — 公式サイトドメイン内メールのみ
- `verifyPhase406ExternalReferenceSafety`

### verify

- Phase 40.6 ✅
- 全体: 2036 passed / 39 failed（既存失敗）

### 次

- Phase 40.7（案）: 求人サイト reference adapter 実装（人間承認後）
- 運用: Gmail 手動送信7件 → 送信記録

---

## 2026-07-01 — 本日締め（Phase 40.5.1 Cloud Run 本番反映）

**現在地:** Growly Sales 全体 **Phase 40.5.1 / 40.6**

### 本日完了

| Phase | 内容 |
|-------|------|
| 40.4 | Lead一覧・候補一覧 収集プロファイル表示 / フィルター |
| 40.5 | `daily30-collection-schedule.json` → Daily 30 実行反映（scheduleSource / areasUsed / JST batchId / areaStrategy） |
| 40.5.1 | Cloud Run 本番再デプロイ |

### Phase 40.5.1 デプロイ結果

- **commit:** `837475a` — `Apply Daily 30 collection schedule to cloud runs`
- **Cloud Build:** SUCCESS — `sha256:db91777ca5e1da90d8c87d07440ae33482b1006cb2727f9cf034ba3f6f6dc73c`
- **Cloud Run revision:** `growly-sales-daily30-00004-8sq`
- **URL:** `https://growly-sales-daily30-b6rlfzmvja-an.a.run.app`
- **dry-run:** ok / `dry_run` / `batchId=2026-07-02` / `scheduleSource=active_profile` / `plannedAreaStrategy=priority_miyagi_fukushima_yamagata` / schedule 未消費
- **Scheduler:** `growly-daily30-auto-fetch-9am` ENABLED・`0 9 * * *` Asia/Tokyo（変更なし）
- **本番 fetch:** 未実行（明日 9:00 Scheduler で初回確認）

### 明日（2026-07-02）9:00 以降

```powershell
npm run growly-sales:phase-c-cloud-status
```

UI: http://localhost:3847 — `batchId`（JST）/ `scheduleSource` / `areasUsed` / `collectionProfileId` / 東京除外 / override 消費 / Gmail 未使用

### 次セッション

- 明日 9:00 本番 Scheduler 結果確認
- **Phase 40.6:** 外部掲載サイト参考ルート（job_site_reference 等）
- 運用: Gmail 手動送信7件 → 送信記録（`NEXT_TASKS.md` 参照）

---

## 2026-07-01 — Phase 40.5 Cloud Run が schedule を読んで Daily 30 実行に反映

**種別:** fetch / Cloud Run 実行ロジック。求人巡回・再デプロイは別途。

### 実装

- `resolveDaily30CollectionSchedule.ts` — 解決・消費・エリアキュー
- `fetchDaily30Candidates` / `runDaily30CloudAutoFetch` — schedule 連携
- `daily30CloudRunState` — areasUsed / scheduleSource 等
- UI — `Daily30RunCollectionProfileSummary`
- `verifyPhase405CollectionScheduleExecution`

### 次（→ 40.5.1 で完了）

- ~~Cloud Run 再デプロイ~~ ✅
- Phase 40.6: 外部掲載サイト参考ルート

---

## 2026-07-01 — Phase 40.4 Lead一覧・候補一覧 収集プロファイル表示 / フィルター

**種別:** UI 表示・フィルター追加。Cloud Run 反映・求人巡回なし。

### 実装

- `resolveCollectionProfileDisplay.ts` — ラベル解決・フィルター・後方互換
- `CollectionProfileDisplay.tsx` / `LeadCollectionFilterBar.tsx`
- Lead一覧・Lead詳細・候補カード・下書き候補・送信記録に収集情報表示
- `discoverySourceUrl` と `emailSourceUrl` 分離表示
- `recordManualGmailSent` — 送信記録 memo に collection 系 optional 追記
- `verifyPhase404CollectionProfileDisplay`

### 次

- Phase 40.5: Cloud Run が schedule を読んで実行順を変える

---

## 2026-07-01 — Phase 40.3 明日の収集設定 UI

**種別:** 候補収集タブ UI + schedule 保存 API。Cloud Run 反映・求人巡回なし。

### 実装

- `Daily30CollectionSchedulePanel` / `Daily30CollectionScheduleEditDialog`
- `GET/POST /api/daily30-collection-schedule`
- `updateDaily30CollectionSchedule.ts`（oneDay / next / reset）
- `verifyPhase403CollectionScheduleUi`

### 次

- Phase 40.5: Cloud Run が schedule を読んで実行

---

**種別:** データ構造・保存・後方互換・verify。UI / 求人巡回 / Cloud 再デプロイなし。

### 実装

- JST `batchId`（`todayBatchIdJst` / `resolveDaily30BatchIdJst`）
- `daily30PrefectureRegistry.ts`（全国46・東京除外）
- `daily30CollectionProfile.ts` + `daily30-collection-schedule.json` repository
- 候補・Lead optional フィールド + fetch 時デフォルト付与 + Lead 引き継ぎ
- Cloud run state に `runStartedAtJst` / collectionProfile 系 optional
- `verifyPhase402CollectionProfileFoundation` + docs

### 次

- Phase 40.3: 明日の収集設定 UI

---

## 2026-07-01 — メール取得先URLの明記対応（Phase 38）

**種別:** UI + データ表示・送信記録拡張。Gmail送信・下書き再作成なし。

### 実装内容

- `resolveEmailSourceDisplay.ts` — Lead / Daily30候補から取得先URL・ラベル・公式由来判定を解決
- `EmailSourceDisplay.tsx` — 候補収集 / Lead詳細 / 下書き候補 / 送信記録で共通表示
- Gmail下書き作成・承認・送信記録ダイアログに取得先確認ブロックを追加
- 手動送信記録（`recordManualGmailSent`）の memo に `emailSourceUrl` / `emailSourceLabel` / `officialSiteUrl` / `batchId` / `source` を追記

### 本日下書き7件 — メール取得先URL

会社名：住まいの足軽隊 〜住宅リフォーム店〜
メール：info@mutumisetubi.com
取得先URL：https://e-s-first.com/company
公式サイト：https://e-s-first.com/
draftId：r8164606133101662721
送信状態：not_sent
備考：会社概要ページから取得（emailCandidateSourceUrls）

会社名：オークヴィルホームズ
メール：info@oakvillehomes.jp
取得先URL：https://oakvillehomes.jp/about
公式サイト：https://oakvillehomes.jp/
draftId：r-810018114229840836
送信状態：not_sent
備考：会社概要ページから取得

会社名：桂住宅建設株式会社
メール：info@katsurajyuken.com
取得先URL：https://katsurajyuken.com/privacy
公式サイト：http://katsurajyuken.com/
draftId：r-2948859915204951771
送信状態：not_sent
備考：プライバシーポリシーページから取得

会社名：株式会社AS IT IS
メール：info@asitis.ibaraki.jp
取得先URL：https://asitis.ibaraki.jp/
公式サイト：https://asitis.ibaraki.jp/
draftId：r3391971582117788795
送信状態：not_sent
備考：公式トップページから取得

会社名：有限会社 水戸工務店
メール：info@mitok.jp
取得先URL：https://mitok.jp/about
公式サイト：http://mitok.jp/
draftId：r2932789133786339440
送信状態：not_sent
備考：会社概要ページから取得

会社名：MIRAIE株式会社
メール：info@miraie-home.com
取得先URL：https://miraie-home-group.com/
公式サイト：https://miraie-home-group.com/
draftId：r4980594914741382854
送信状態：not_sent
備考：公式トップページから取得

会社名：(株)テクノホーム
メール：info@technohome.co.jp
取得先URL：https://technohome.co.jp/consultation
公式サイト：https://technohome.co.jp/
draftId：r4056441127015213698
送信状態：not_sent
備考：相談・問い合わせページから取得（contactFormUrl と同一）

### 取得先が確認できなかった会社

- なし（7件すべて leads.json の `emailCandidateSourceUrls` から確認済み）

### 安全ガード

- messages.send 未使用 / 既存下書き再作成なし / 送信済み履歴上書きなし

---

## 2026-07-01 — Daily 30 実運用処理（Lead整理・下書き作成まで）

**種別:** 実運用（GCS候補 + ローカル leads.json）。自動送信なし。

### 開始時状態

| 項目 | 値 |
|------|-----|
| 収集時メール取得（GCS state） | 9 / 30 |
| ready_for_draft（事前） | 3件 |
| Lead化承認待ち | 6件 |
| leads.json | 46件 / 送信済み 13件 |

### Lead化承認（4件）

| 会社名 | 結果 |
|--------|------|
| オークヴィルホームズ | ✅ 承認 |
| 株式会社AS IT IS | ✅ 承認 |
| 有限会社 水戸工務店 | ✅ 承認 |
| MIRAIE株式会社 | ✅ 承認 |

### 重複・保留（2件）

| 会社名 | 理由 |
|--------|------|
| ㈱徳田工務店 | 既存Lead重複（株式会社徳田工務店） |
| Banana works LABO・ドクターリフォーム | 代表メール `info@xxx.com` がプレースホルダのため保留 |

### 営業文生成（GENERATE_DAILY_30_COPY 相当・ゲート付き実行）

| 項目 | 値 |
|------|-----|
| processed | 4 |
| generated | 4 |
| passed (ready_for_draft) | 4 |
| needsReview | 0 |
| excluded | 0 |

### leads.json 取り込み（IMPORT_DAILY_30_DRAFT_CANDIDATES ゲート）

**取り込み前:** 46件 → **取り込み後:** 53件（+7）

| 会社名 | leadId |
|--------|--------|
| 住まいの足軽隊 〜住宅リフォーム店〜 | 7fc577b2-fa2a-45b6-8ca7-3f188aa9c4bc |
| オークヴィルホームズ | 78a50527-c7b1-4591-869e-d684c35b2540 |
| 桂住宅建設株式会社 | 80fa46fe-679e-44bb-9c3b-36797edad51f |
| 株式会社AS IT IS | 49fddbf5-e3a0-4eaa-b4d9-cdc9399403ec |
| 有限会社 水戸工務店 | 828fd6f4-d8d6-4d43-8b71-9a40f4c3fbb6 |
| MIRAIE株式会社 | a7824e74-080e-4380-9381-099f6ea98720 |
| (株)テクノホーム | 15b022fc-721a-4b62-9b9e-82ab3a5b8e0c |

### Gmail下書き作成（CREATE_DRAFTS ゲート）

From / Reply-To / 署名: **c_hiratsuka@wantreach.jp**

| 会社名 | draftId | 宛先 |
|--------|---------|------|
| 住まいの足軽隊 〜住宅リフォーム店〜 | r8164606133101662721 | info@mutumisetubi.com |
| オークヴィルホームズ | r-810018114229840836 | info@oakvillehomes.jp |
| 桂住宅建設株式会社 | r-2948859915204951771 | info@katsurajyuken.com |
| 株式会社AS IT IS | r3391971582117788795 | info@asitis.ibaraki.jp |
| 有限会社 水戸工務店 | r2932789133786339440 | info@mitok.jp |
| MIRAIE株式会社 | r4980594914741382854 | info@miraie-home.com |
| (株)テクノホーム | r4056441127015213698 | info@technohome.co.jp |

### Gmail手動送信

- **未実施**（Growly Sales からは送信していない）
- 送信記録: **追加なし**（Gmail画面で人間送信後に記録予定）

### 未処理リード（本日バッチ）

- ㈱徳田工務店 — 既存Lead重複
- Banana works LABO — メールプレースホルダ保留

### 安全ガード

- messages.send 未使用 / users.drafts.create は CREATE_DRAFTS 時のみ
- 送信済み履歴・返信履歴 上書きなし

### 次回対応

- Gmail で7件の下書きを確認 → 問題なければ手動送信 → 送信記録タブで `manual_gmail` 記録
- 明日 9:00 Phase 37 本番反映確認（partial_success / stoppedReason / formOnly）

---

## 2026-07-01 — Phase 37.1: Cloud Run 再デプロイ

**種別:** インフラ（Phase 37 コードを本番反映）

| 項目 | 値 |
|------|-----|
| commit | `55096d2` Fix Daily 30 partial success metrics |
| Cloud Build | SUCCESS（build `a2a0eeed-bb00-4f8c-a4bc-67ee70469be9`） |
| Cloud Run revision | `growly-sales-daily30-00003-l7s` |
| dry-run | ok / mode=dry_run |
| Scheduler | ENABLED（cron 変更なし） |

---

## 2026-07-01 — Phase 35〜36.6: UI polish（ダッシュボード・候補収集・Lead一覧）

**種別:** UIのみ（機能・API・Cloud/Gmailロジック変更なし）

### 完了 Phase

| Phase | 内容 |
|-------|------|
| **35** | ダッシュボード1画面レイアウト（1366×768向けコンパクトグリッド） |
| **36** | 候補収集タブ polish（バッジ統一・カード圧縮・文言短縮・DevDetails分離） |
| **36.5** | ダッシュボード視認性・密度再調整（フォント拡大・余白圧縮・キュー強調） |
| **36.6** | Lead一覧 右詳細パネル修正（2カラム幅・ellipsis・sticky廃止・コンパクト化） |

### 主な変更ファイル

- `SalesDashboardView.tsx` / `DashboardCompactChecklist.tsx` / `GrowlySalesDashboard.tsx`
- `Daily30CandidateCards.tsx` / `daily30StatusLabels.ts` / `CandidateCollectionView.tsx`
- `Daily30CloudResultsPanel.tsx` / `Daily30LeadCandidatesPanel.tsx` / `Daily30DraftImportPanel.tsx`
- `LeadListView.tsx` / `LeadDetailPanel.tsx` / `LeadReviewActions.tsx`
- `styles.css` / `verify-growly-sales.ts`（Phase 35〜36.6 verify 追加）

### 実データ確認（GCS経由・localhost:3847）

| 項目 | 値 |
|------|-----|
| メール取得済み | 10 / 30 |
| 総収集候補 | 30件 |
| Lead化承認待ち | 10件（候補収集）/ 43件（Lead一覧棚卸し） |
| ダッシュボード 1366×768 | 7列サイクル・横スクロールなし |
| Lead一覧 2カラム | 左 774px + 右 380px・重なりなし |

### 検証

| 項目 | 結果 |
|------|------|
| ui:build | ✅ |
| verify | ✅ Phase 35〜36.6 pass / **1552 passed, 23 failed**（既存失敗のみ） |
| 自動送信・Gmail send | 変更なし |

### 次回（運用）

- **明日 9:00** Cloud Daily 30 本番運用チェック（下記 NEXT_TASKS 手順）

---

**種別:** 設計・実装・dry-run確認（実fetch未実行）

### 現状確認

| 項目 | 値 |
|------|-----|
| 既存Lead | 6社（パイロット） |
| emailCandidates あり | 3/6 (50%) |
| external-candidates.json | 未作成（実fetch未実行） |
| Gmail下書き | 森のめぐみ工房 `draft_created` / タカコウ・ハウスは次回候補 |

### 実施内容

- `src/growly-sales/candidates/` — 30件収集プラン・監査・残枠制限・フィールド補完
- `ExternalLeadCandidate` 拡張: `officialSiteUrl`, `duplicateKey`, `category`, `contactFormUrl`, `emailCandidates`, `notes`, `collectedAt`
- 新コマンド:
  - `npm run growly-sales:candidates-preview` — dry-run（外部APIなし）
  - `npm run growly-sales:fetch-candidates` — `FETCH_CANDIDATES` 必須
  - `npm run growly-sales:candidates-audit` — 公式URL・連絡導線・重複監査
- 重複排除: domain / companyName+area、既存Lead・外部プール・同一バッチ
- 件数制限: 目標30件 − 現在Lead数 = 新規取得上限
- 公式サイトURLなし → `needs_review`
- verify Phase 21 チェック追加

### 安全ルール（維持）

- `FETCH_CANDIDATES` なしでは外部API・Web検索・Places取得しない
- preview / audit は外部通信なし
- Gmail送信API禁止 / 自動送信禁止
- `.env` 自動編集なし / secret ログなし

### 検証

| 項目 | 結果 |
|------|------|
| candidates-preview | ✅ dry-run（6社 / 残り24枠 / 外部API未使用） |
| candidates-audit | ✅ 連絡導線・重複キー確認 |
| verify | ✅ 507 passed / 0 failed |
| mvp-check | ✅ ready=true |
| ui:build | ✅ |
| npm audit | ✅ critical=0, high=0 |
| 実fetch | **未実行**（`FETCH_CANDIDATES` 入力待ち） |

### 次: Phase 22

- 候補の分析・ランク付け
- 実fetchはユーザーが `FETCH_CANDIDATES` 入力後に `fetch-candidates` を実行

---

## 2026-06-27 — Phase 19.5: Gmail下書き成功確認・docs同期

**種別:** 成功状態確認 + Phase 20 準備（コード変更なし）

### Phase 19 成果（確定）

- **森のめぐみ工房** — Gmail下書き1件作成成功
  - `gmailDraftStatus=draft_created` / `gmailDraftId` 記録済み
  - `sendStatus=not_sent` 維持
  - `users.drafts.create` のみ使用（送信APIなし）
- **タカコウ・ハウス** — 次回 Gmail下書き候補（`approved` / `emailCandidates` あり / `gmailDraftStatus=none`）

### インフラ改善（Phase 19 期間）

- `ensureProjectEnvLoaded()` — `.env` 読み込み（`getProjectRoot` 基準）
- `GMAIL_DRAFT_CREATE_LIMIT=1` — 1回1件制限
- `gmailFetchDiagnostics` — fetch 失敗の段階別診断ログ
- `gmail-oauth-helper` — refresh token 取得補助

### 確認結果

| 項目 | 結果 |
|------|------|
| gmail-preview | ✅ 候補1件（タカコウ・ハウスのみ。森のめぐみ工房は draft_created で除外） |
| verify | ✅ 477 passed / 0 failed |
| mvp-check | ✅ ready=true |
| ui:build | ✅ |
| npm audit | ✅ critical=0, high=0 |

### 次: Phase 20

- タカコウ・ハウス2件目下書き作成（`GMAIL_DRAFT_CREATE_LIMIT=1` + `CREATE_DRAFTS` 必須）
- Gmail運用安定確認（人間送信・手動結果記録）

---

## 2026-06-26 — Phase 19: Gmail OAuth helper 追加

**種別:** refresh token 取得補助スクリプト（送信・下書き作成なし）

### 実施内容

- `run-growly-sales-gmail-oauth-helper.ts` 追加
- `npm run growly-sales:gmail-oauth-helper` 追加
- scope: `gmail.compose` / redirect_uri: `http://localhost`
- verify に helper 安全チェック追加

### ルール

- helper は **refresh token 取得補助のみ**
- Gmail送信・下書き作成・自動送信なし
- `.env` 自動編集なし / token ファイル保存なし
- secret 類はコミットしない

---

## 2026-06-26 — Phase 20-lite: emailCandidates改善実装

**種別:** day1 コレクター強化（外部API・Gmail実作成なし）

### 実施内容

- 同一ドメイン内 contact/about 等を最大2ページ追加解析
- mailto / 全角＠ / [at] 表記の正規化
- 法人窓口prefix拡張・フリーメール/no-reply除外
- Lead型: `emailCandidateSourceUrls`, `contactPathType` 等
- 連絡導線分析強化 + UI更新
- day1 既存Leadの連絡導線フィールド refresh（削除なし）

### day1再実行結果（6社パイロット）

| 指標 | 改善前 | 改善後 |
|------|--------|--------|
| emailCandidatesあり | 0社 (0%) | **3社 (50%)** |
| contactPathType=both | 0 | **3** |
| contact_formのみ | 6 | **3** |
| gmailDraftPossibleLeads | 0 | **3** |

検出例: `info@morimegu.co.jp`（会社概要ページ）、菅原工務店、タカコウ・ハウス

### 確認

| 項目 | 結果 |
|------|------|
| verify | ✅ 425 passed / 0 failed |
| day1 / generate | ✅ |
| mvp-check | ✅ ready=true |
| ui:build | ✅ |

---

**種別:** ドキュメント + verify 強化（実装・外部API・Gmail実作成なし）

### 実施内容

- プロジェクトルートに Growly Sales 専用 `CLAUDE.md` / `WORK_LOG.md` / `NEXT_TASKS.md` を作成
- SNS分析アプリ（`OneDrive\ドキュメント\growly\`）との混同防止を明記
- `docs/GROWLY_SALES_EMAIL_CANDIDATES_IMPROVEMENT_PLAN.md` を新規作成
- 連絡導線分析の考え方を既存 docs / README に反映
- `verify-growly-sales.ts` に Phase 18-lite チェックを追加

### 確認結果

| 項目 | 結果 |
|------|------|
| verify | ✅ 394 passed / 0 failed |
| mvp-check | ✅ ready=true |
| external-preview | ✅ 正常 |
| ui:build | ✅ 成功 |
| npm audit | ✅ critical=0, high=0 |

### 目的

- Phase 17 完了状態の引き継ぎ
- emailCandidates 0% 問題の改善方針を設計（実装は次 Phase 以降）
- Phase 18（外部fetch）・Phase 19（Gmail下書き実作成）への準備

---

## 2026-06-25 — Phase 17: 外部候補収集の土台完了

**種別:** adapter + CLI + UI + 連絡導線分析

### 実施内容

- Google Places / Web Search adapter（`API_PRODUCTION_ENABLED` ゲート）
- 外部候補型・重複排除・検索クエリ生成
- `growly-sales:external-preview`（dry-run・外部通信なし）
- `growly-sales:external-fetch`（`FETCH_CANDIDATES` 必須）
- `growly-sales:external-import-approved`（`IMPORT_APPROVED` 必須 → `input-sites.csv`）
- UI「営業候補」タブ + 営業分析「連絡導線分析」
- `data/growly-sales/external-candidates.json` / `.csv` 保存設計

### 確認結果

| 項目 | 結果 |
|------|------|
| verify | ✅ 366 passed / 0 failed |
| mvp-check | ✅ ready=true |
| external-preview | ✅ 正常（APIキーなし dry-run） |
| ui:build | ✅ 成功 |
| npm audit | ✅ critical=0, high=0 |

### パイロット所見

- 6社すべて `emailCandidates: []`（問い合わせフォームのみ）
- Gmail下書き実作成候補: **0件**（土台は Phase 16 で完成済み）

---

## 2026-06-25 — Phase 16: Gmail下書き作成完了

- `integrations/gmail/` — `users.drafts.create` のみ
- `growly-sales:gmail-preview` / `growly-sales:gmail-create-drafts`（`CREATE_DRAFTS` 必須）
- Lead型: `gmailDraftStatus` / `gmailDraftId` 等
- **送信APIは使用しない**

---

## 2026-06-25 — Phase 15.7: customHook個別化改善完了

- 6社パイロット Lead の `customHook` 差別化
- 禁止表現チェック・emailBody への反映確認

---

## 2026-06-25 — Phase 15.6: 承認〜コピー実操作確認完了

- 人間承認UI → 下書き候補コピー運用の実操作確認
- `sendStatus` がコピー操作で変わらないことを確認

---

## 2026-06-25 — Phase 15.5: 6社パイロット運用テスト完了

- `input-sites.csv` 6社（宮城県工務店・UTF-8）
- day1 → generate → UI承認 → コピー運用フロー検証

---

## 2026-06-25 — Phase 15: ローカル手動MVP完成

- `mvp-check` ready=true
- 人間承認・手動送信記録・営業分析・運用サマリーまで一通り動作

---

## Phase 一覧（完了済みサマリー）

| Phase | 名称 | 状態 |
|-------|------|------|
| 1〜3.5 | 設計・Lead型・サイト解析・誤検出修正 | ✅ |
| 5〜9 | 営業生成ループ（ルールベース） | ✅ |
| 10 | 人間承認UI | ✅ |
| 11A〜11A-2 | 下書きエクスポート・コピーUI | ✅ |
| 12-lite | 手動送信・返信ステータス | ✅ |
| 13-lite | 営業結果分析 | ✅ |
| 14-lite | 運用サマリー | ✅ |
| 15 | ローカル手動MVP | ✅ |
| 15.5〜15.7 | パイロット・承認コピー・customHook | ✅ |
| 16 | Gmail下書き作成（送信なし） | ✅ |
| 17 | 外部候補収集土台 | ✅ |
| **20-lite** | **emailCandidates改善実装** | ✅ |
| **19** | **Gmail下書き実作成テスト**（森のめぐみ工房1件成功） | ✅ |

次回作業: [NEXT_TASKS.md](./NEXT_TASKS.md) — **Gmail手動送信・送信記録**

---

## 2026-07-01 — Phase 38.1〜38.4: 候補除外・メール取得元表示・永続化（PC再起動前記録）

**種別:** Daily 30 候補除外（論理削除）・UI即時反映・GCS永続化検証・数値定義。Gmail送信・下書き再作成なし。

### Phase 38.1
- メール取得元ラベル正規化（「メール取得元」「公式サイト / お問い合わせ」）
- 「候補から除外」ボタン・`POST /api/daily30-candidates/exclude`

### Phase 38.2
- Lead化承認待ちフィルタ統一・`humanExcludedCount`
- メール取得元 `under-email` レイアウト
- `daily30CandidateVisibility.ts`（UI/サーバー共通）

### Phase 38.3（実画面で判明）
- **即時削除は動作**（`sessionExcludedIds` 楽観的UI）
- **再読み込みで候補が戻る** → 永続化未確認が原因候補

### Phase 38.4（コード完了・verify通過）
- 除外API: 保存 → `reloadExternalCandidatesFromStorage()` → excluded 確認後のみ `ok:true` / `persisted:true`
- 永続化失敗: HTTP 409 + `EXCLUDE_PERSIST_FAILED`
- `[daily30-exclude]` 監査ログ（secretなし）
- `docs/GROWLY_SALES_DAILY30_METRICS.md` — 数値定義
- `auditDaily30MetricConsistency.ts` — ダッシュボード数値連動監査
- verify: **1713 passed / 29 failed**（既存失敗のみ）· Phase 38.1〜38.4 ✅

### 再起動後にやること（最優先）
1. `npm run growly-sales:ui` → 起動ログで `Storage: gcs (...)` を確認
2. 候補収集タブ → **送信対象にしない候補1件**（既存Lead重複・プレースホルダ等）を除外
3. APIレスポンス: `persisted: true` / `storageBackend: "gcs"`
4. ページ再読み込み → Lead化承認待ちに**戻らない**こと
5. DevDetails: `humanExcludedCount` 増加・除外済み一覧

### 変更ファイル（主要・未コミットの可能性あり）
- `workflow/excludeDaily30Candidate.ts`, `logDaily30ExcludeAudit.ts`
- `storage/externalCandidatesRepository.ts`
- `candidates/daily30CandidateVisibility.ts`, `findDaily30CandidateForExclude.ts`
- `candidates/auditDaily30MetricConsistency.ts`, `daily30MetricDefinitions.ts`
- `candidates/buildDaily30Dashboard.ts`, `getDaily30DraftImportBlockReason.ts`
- `server/uiServer.ts`
- `ui/Daily30LeadCandidatesPanel.tsx`, `Daily30CloudResultsPanel.tsx`, `CandidateCollectionView.tsx`
- `ui/daily30ExcludeUi.ts`, `daily30CopyApi.ts`, `Daily30CandidateCards.tsx`, `styles.css`
- `docs/GROWLY_SALES_DAILY30_METRICS.md`
- `scripts/verify-growly-sales.ts`

### 安全（変更なし）
- leads.json / Gmail下書き7件 / 送信記録は未変更
- 自動送信・`messages.send`・今回 `users.drafts.create` 不使用

---

## 2026-07-01 — Phase 38.4 実画面確認完了 + ダッシュボード集計修正

**種別:** 除外永続化の実画面検証・`humanExcludedCount` 集計バグ修正。Gmail送信なし。

### 実画面確認（GCS `gs://growly-sales-daily30/prod/...`）

| 手順 | 結果 |
|------|------|
| ㈱徳田工務店を「候補から除外」 | ✅ `persisted: true`, `storageBackend: "gcs"` |
| サーバー監査ログ `[daily30-exclude]` | ✅ |
| ページ再読み込み後 Lead化承認待ち | ✅ 3件→2件（徳田は**戻らない**） |
| 収集結果「除外済み候補（1件）」 | ✅ DevDetails に徳田 + 除外日時 |
| `emailFoundAtCollection` | ✅ 9/30（除外後も減らない） |

### 判明した集計バグと修正

- **原因:** `/api/daily30-dashboard` が `visibleCandidates` のみを `buildDaily30Dashboard` に渡し、`humanExcludedCount` を visible 件数で上書きしていたため、除外済みが集計から消えていた。
- **修正:** `buildDaily30CloudDashboardPayload` に `allCandidates` を追加。ダッシュボード集計は全候補（論理除外含む）で実施。`humanExcludedCount` は当日 batch の `dashboard.humanExcludedCount` を返す。
- **verify:** 1714 passed / 29 failed（既存）· Phase 38.1〜38.4 ✅

### 数値メモ（仕様どおり）

- `leadApprovalPendingCount`（今日の状態）= **当日 batch のみ** → 0（承認待ち2件は `collectionBatchId: 2026-06-30`）
- Lead化承認・営業文パネル = **全 batch の visible 候補** → 2件表示（仕様差・別途整理候補）

### UI再起動

集計修正を API に反映するには `npm run growly-sales:ui` の再起動が必要（実行中プロセスは修正前コードの可能性あり）。GCS 上の除外データ自体は永続化済み。

---

## 2026-07-01 — Phase 40.1: 収集プロファイル基盤 事前調査

**種別:** 調査・設計のみ（コード変更なし）。

### 成果物

- `docs/GROWLY_SALES_DAILY30_COLLECTION_PROFILE_PLAN.md` — 現状調査・データ構造案・Phase 40.2〜40.6 実装計画

### 主要所見

- 収集エリアは `daily30AreaConfig.ts` の5県固定（山形・全国未対応）
- `areasUsed` は GCS state に未保存。`nextArea` は表示用で翌日の開始点に未使用
- 収集プロファイル override 用 JSON は未存在 → `daily30-collection-schedule.json` 新設を推奨
- 候補/Lead に discovery 系フィールドなし。`emailSourceUrl` 分離は Phase 38 済み
- Lead一覧フィルターは `lead.area` のみ（都道府県・収集元なし）

### verify

- `npm run growly-sales:verify` 実行（ベースライン・コード変更なし）

