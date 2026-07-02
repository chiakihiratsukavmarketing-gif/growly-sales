# Growly Sales — WORK_LOG

作業履歴の簡易ログ。詳細な Phase 履歴は `docs/GROWLY_SALES_RUN_LOG.md` / `docs/GROWLY_SALES_PROJECT_STATE.md` を参照。

> **注意:** `OneDrive\ドキュメント\growly\WORK_LOG.md` は **Growly SNS分析アプリ** 用です。本ファイルは **Growly Sales** 専用です。

**ワークスペース:** `C:\Users\chiak\AI_\Growly Sales`

---

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

