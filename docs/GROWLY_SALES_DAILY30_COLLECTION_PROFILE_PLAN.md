# Growly Sales — Daily 30 収集プロファイル基盤（Phase 40.1 調査・設計）

**作成日:** 2026-07-01  
**スコープ:** Phase 40.1（調査・設計）→ **Phase 40.2（基盤実装完了）** → 40.3〜40.6

**Phase 40.2 実装:** 型・JST batchId・都道府県レジストリ・schedule JSON・候補/Lead への profile 付与・verify。  
**Phase 40.3 実装:** 候補収集タブ「明日の収集設定」UI + GET/POST API（保存のみ・Cloud Run 未連携）。
**Phase 40.5 実装:** Cloud Run / fetch が schedule を読み、override 消費・areasUsed 記録・JST batchId 統一。  
詳細スキーマ: `docs/GROWLY_SALES_COLLECTION_PROFILE_SCHEMA.md`

---

## 1. 現状サマリー

| 項目 | 現状 |
|------|------|
| 収集エリア | **5都県のみ**（宮城→福島→茨城→栃木→群馬）。**山形なし** |
| 収集元 API | Google Places + Web Search（`fetchDaily30Candidates`） |
| 業種 | `DAILY_30_TARGET_INDUSTRIES` + `config/growly-sales/targets/housing.json` |
| batchId | `todayBatchId()` = `Date.toISOString().slice(0,10)`（**UTC日付**） |
| おまかせ継続 | **未実装**（毎回同じ5県を先頭から走査） |
| ユーザー指定 | **未実装**（UI・state ともに override なし） |
| 求人サイト | **未実装**（discovery ルートなし） |
| 東京除外 | **未実装**（全国リスト自体がない） |
| areasUsed 永続化 | fetch 戻り値・CLI ログのみ。**GCS state には未保存** |

---

## 2. 調査したファイル

### 収集・エリア・batch

| ファイル | 役割 |
|----------|------|
| `candidates/daily30AreaConfig.ts` | `DAILY_30_AREA_EXPANSION`（5県）、`todayBatchId()`、`buildDaily30QueriesForArea()` |
| `candidates/daily30CandidateStatus.ts` | `Daily30RegionGroup` = 宮城 \| 福島 \| 北関東 のみ |
| `candidates/fetchDaily30Candidates.ts` | メイン収集ループ、Places/Web、メール確認、`areasUsed[]` |
| `candidates/runDaily30CloudAutoFetch.ts` | Cloud Run / Scheduler 入口、state 記録 |
| `candidates/daily30BatchMetrics.ts` | `stoppedReason` 解決、`areasUsedCount` |
| `candidates/buildDaily30Dashboard.ts` | `nextExploreArea`（当日 metrics から文字列生成） |
| `config/targetProfile.ts` | `housing.json` 読み込み（業種・defaultAreas） |
| `config/growly-sales/targets/housing.json` | 業種キーワード、defaultAreas に「東北」含む |

### 保存・state

| ファイル | 役割 |
|----------|------|
| `storage/daily30CloudRunState.ts` | `daily30-cloud-run-state.json` 型・読み書き |
| `storage/externalCandidatesRepository.ts` | `external-candidates.json` |
| `storage/jsonDocumentStorage.ts` | GCS / local 抽象（現状2ドキュメントのみ） |
| `storage/jsonDocumentNames.ts` | 論理名定数 |
| `adapters/externalLeadCandidateTypes.ts` | 候補フィールド定義 |
| `types/lead.ts` | Lead 型（Phase 23 収集メタ一部あり） |
| `candidates/buildLeadStubFromExternalCandidate.ts` | 候補→Lead スタブ |
| `candidates/buildLeadFromDaily30ReadyForDraft.ts` | ready_for_draft → leads.json |
| `candidates/resolveEmailSourceDisplay.ts` | **emailSourceUrl** 表示（公式サイト由来判定） |

### UI

| ファイル | 役割 |
|----------|------|
| `ui/CandidateCollectionView.tsx` | 候補収集タブ構成（今日の状態 → 3セクション） |
| `ui/Daily30CloudResultsPanel.tsx` | 収集結果、`stoppedReason` 表示 |
| `ui/Daily30CloudStatusPanel.tsx` | Cloud 自動化状態 |
| `ui/GrowlySalesDashboard.tsx` | Lead一覧フィルター（状態 + `lead.area` ドロップダウン） |
| `ui/leadFilterUtils.ts` | 全タブ共通フィルター定義 |

### ドキュメント

| ファイル | 役割 |
|----------|------|
| `docs/GROWLY_SALES_DAILY30_RUNBOOK.md` | GCS パス、Scheduler 運用 |
| `docs/GROWLY_SALES_DATA_SCHEMA.md` | external-candidates / Lead（要 Phase 40 追記） |

---

## 3. Daily 30 の収集元・エリア・batchId の決定フロー（現状）

```
Cloud Scheduler 9:00 JST
  → runDaily30CloudAutoFetch()
      batchId = options.batchId ?? todayBatchId()   // UTC日付
      profile = loadTargetProfile('housing')        // 固定 ID
      candidates = loadExternalCandidatesFromJson()
      leads = loadLeadsFromJson()
      { candidates, stats } = fetchDaily30Candidates(profile, leads, candidates)
          for (area of DAILY_30_AREA_EXPANSION)     // 常に5県・固定順
            Places + Web Search クエリ
            メール確認（公式サイトのみ）
          areasUsed.push(area.prefecture)           // 実行中のみ
      recordCloudRunEntry({ batchId, emailFound, stoppedReason, nextArea, ... })
          // areasUsed は state に保存されない
```

**ローカル UI 手動収集:** `POST /api/daily30-fetch` → 同一 `fetchDaily30Candidates`（`FETCH_DAILY_30` ゲート）。

---

## 4. エリア探索順（現状 vs 要件）

### 現状（コード）

```typescript
// daily30AreaConfig.ts
宮城県(1) → 福島県(2) → 茨城県(3) → 栃木県(4) → 群馬県(5)
```

- `regionGroup` は3値のみ（山形・全国未対応）
- `buildDaily30Dashboard.resolveNextExploreArea` も宮城/福島/北関東の3段階ヒューリスティック

### 要件とのギャップ

| 要件 | ギャップ |
|------|----------|
| 第1優先: 宮城・福島・**山形** | 山形未登録 |
| 第2優先: 北関東3県 | ✅ 実装済み |
| 第3優先: 全国46都道府県（東京除外） | 未実装。都道府県レジストリなし |
| 「東北」括りを使わない | `housing.json` の defaultAreas に「東北」文字列あり（検索プロファイル用） |

---

## 5. nextArea / stoppedReason / areasUsed の保存先

### stoppedReason

- **生成:** `fetchDaily30Candidates` → `resolveDaily30StoppedReason` / `ensureDaily30StoppedReasonForRun`
- **保存:** `daily30-cloud-run-state.json` の `runs[batchId].stoppedReason`
- **UI:** `Daily30CloudResultsPanel`、ダッシュボード API

### nextArea

- **生成:** `buildDaily30Dashboard().nextExploreArea`（当日候補の region カウント + emailShortfall）
- **保存:** cloud run state の `nextArea`（**文字列ラベル**。キュー位置ではない）
- **注意:** 翌日の収集開始点には**未使用**（毎日5県先頭から再開）

### areasUsed

- **生成:** `fetchDaily30Candidates` の `stats.areasUsed: string[]`
- **保存:** **なし**（GCS state・候補 JSON ともに未記録）
- **参照:** CLI `daily30-fetch` ログ、`POST /api/daily30-fetch` レスポンスのみ

**Phase 40 推奨:** cloud run state entry に `areasUsed: string[]`、`areaQueuePosition: number`、`collectionProfileId` を追加。

---

## 6. GCS state（daily30-cloud-run-state.json）現状フィールド

`Daily30CloudRunStateEntry`（`storage/daily30CloudRunState.ts`）:

- 識別: `runId`, `batchId`, `mode`, `status`
- 時刻: `startedAt`, `finishedAt`, `durationMs`
- 件数: `emailFound`, `totalCollected`, `formOnly`, `noEmail`, `duplicates`, `excluded`, `reachedTarget`
- 制御: `stoppedReason`, `nextArea`, `force`
- エラー: `errorCode`, `errorMessageSafe`, `recoveryHint`
- インフラ: `storageBackend`, `schedulerConfigured`, …

**ないもの:** `areasUsed`, `collectionProfileId`, `collectionMode`, `discoverySource`, `areaStrategy`, `collectionRunId`

---

## 7. external-candidates.json 現状

`ExternalLeadCandidate`（`adapters/externalLeadCandidateTypes.ts`）:

| 既存フィールド | 用途 |
|----------------|------|
| `sourceType` | `google_places` / `web_search` / `manual`（**収集パイプライン種別**） |
| `sourceUrl` | Places / Web 結果 URL |
| `sourceQuery` | 検索クエリ |
| `prefecture`, `regionGroup`, `collectionPriority`, `collectionAreaSource` | エリアメタ |
| `collectionBatchId` | 日次バッチ |
| `officialSiteUrl`, `websiteUrl` | 公式サイト |
| `emailCandidateSourceUrls`, `emailCandidateSourceUrl` | **メール確認元（公式サイトページ）** |
| `targetEmail` | 採用メール |

**ないもの（Phase 40 追加候補）:**  
`collectionProfileId`, `collectionMode`, `discoverySource`, `discoverySourceSite`, `discoverySourceUrl`, `discoverySourceLabel`, `sourceComplianceStatus`, `collectionRunId`, `areaQueuePosition`

**後方互換:** すべて optional 追加。未設定時は `sourceType` から推論（既存候補は `google_places` / `web_search`）。

---

## 8. leads.json への最小変更案

既存（Phase 23）:

- `prefecture`, `regionGroup`, `collectionPriority`, `collectionAreaSource`, `collectionBatchId`, `source`（`daily30`）
- `emailSourceUrl`, `emailSourceLabel`（Phase 38）

**Phase 40.2 で optional 追加推奨:**

```typescript
collectionProfileId?: string | null;
collectionProfileName?: string | null;
collectionMode?: 'auto_continue' | 'user_selected' | 'one_day_override' | 'manual' | null;
discoverySource?: string | null;       // enum 文字列
discoverySourceSite?: string | null;   // wantedly 等
discoverySourceLabel?: string | null;
discoverySourceUrl?: string | null;  // 掲載元（求人サイト等）
sourceComplianceStatus?: string | null;
sourceComplianceNote?: string | null;
collectionRunId?: string | null;
areaQueuePosition?: number | null;
industryCategory?: string | null;
```

**伝播ポイント:**

1. `buildLeadStubFromExternalCandidate.ts`
2. `buildLeadFromDaily30ReadyForDraft.ts`
3. `externalCandidatesRepository` CSV エクスポート列（任意）

**既存 Lead は変更しない**（読み取り時 undefined 扱い）。

---

## 9. discoverySourceUrl と emailSourceUrl の分離

### 現状

- メール系: `emailCandidateSourceUrls` / `emailSourceUrl` / `resolveEmailSourceDisplay.ts`
- 発見系: `sourceUrl`（Places/Web）のみ。**求人サイト用フィールドなし**

### 分離ルール（Phase 40.6 安全基盤）

| フィールド | 意味 | 営業メールに使うか |
|------------|------|-------------------|
| `discoverySourceUrl` | 企業を**発見した**掲載ページ（求人・ポータル等） | **NG**（参照・監査のみ） |
| `officialSiteUrl` | 公式サイトトップ | リンク参考のみ |
| `emailCandidateSourceUrl` | **公式サイト上**でメールを確認したページ | **OK**（取得元表示・承認必須） |
| `targetEmail` | 上記公式ページ由来の代表メール | **OK** |

**パイプライン:**

```
discovery（求人サイト等）→ 会社名 + officialSiteUrl 候補
  → 公式サイトのみ enrichCandidateEmailFromWebsite
  → email なしなら email_not_found（求人ページのメールは使わない）
  → Lead化承認時: emailSourceUrl が公式ドメインであることを UI で表示（既存 EmailSourceDisplay）
```

**sourceComplianceStatus:**

- `official_site_verified` — メールが公式サイトで確認済み
- `official_site_not_found` — 公式サイト未特定
- `email_not_found` — 公式サイトにメールなし
- `blocked_by_policy` — 求人メールのみ・個人メール等
- `needs_human_review` — 人間判断

---

## 10. 求人サイト指定のデータ構造案

### プロファイル側（収集スケジュール JSON）

```typescript
interface Daily30CollectionProfile {
  collectionProfileId: string;           // e.g. "default-housing-auto"
  collectionProfileName: string;         // 表示名
  collectionMode: 'auto_continue' | 'user_selected' | 'one_day_override' | 'manual';
  industryCategory: 'housing' | 'reform' | 'real_estate' | 'ec' | 'other';
  areaStrategy: 'priority_miyagi_fukushima_yamagata' | 'north_kanto' | 'nationwide_excluding_tokyo';
  targetProfileId: string;               // housing.json 参照
  discoverySources: Daily30DiscoverySourceSpec[];  // 複数可
}

interface Daily30DiscoverySourceSpec {
  discoverySource: 'google_places' | 'official_site_search' | 'job_site_reference' | ...;
  discoverySourceSite?: 'wantedly' | 'indeed' | ...;  // job_site_reference 時のみ
  enabled: boolean;
  referenceOnly: true;                   // 常に true（Phase 40.6）
}
```

### 候補1件あたり（スナップショット）

収集実行時に候補へコピー（後からプロファイル定義が変わっても監査可能）。

- `discoverySource` / `discoverySourceSite` / `discoverySourceUrl` / `discoverySourceLabel`
- `collectionProfileId` / `collectionRunId` / `collectionMode`

**重要:** `sourceType` は後方互換のため残す。新規は `discoverySource` を正とし、`sourceType` はパイプライン実装の粗い分類に限定。

---

## 11. collectionProfile / nextProfileOverride の保存先（推奨）

### 推奨: 新規 JSON ドキュメント

**論理名:** `daily30-collection-schedule.json`  
**パス:** GCS / local とも `jsonDocumentStorage` 経由（`external-candidates` と同じ仕組み）

```typescript
interface Daily30CollectionScheduleStore {
  updatedAt: string;
  note: string;
  /** おまかせ継続のカーソル（前日の続き） */
  autoContinue: {
    areaStrategy: string;
    areaQueuePosition: number;      // 次に探索する都道府県インデックス
    lastCompletedBatchId: string | null;
    lastCollectionProfileId: string;
  };
  /** 翌日以降有効なユーザー指定 */
  nextRunOverride: {
    effectiveBatchId: string;       // 適用開始 batchId（翌日9:00 JST → batchId 整合に要注意）
    expiresBatchId: string | null;    // one_day_override 時のみ
    profile: Daily30CollectionProfile;
    setAt: string;
    setBy: 'human_ui';
  } | null;
  /** 現在有効な解決済みプロファイル（監査・UI表示用） */
  resolvedForNextRun: {
    batchId: string;
    profile: Daily30CollectionProfile;
    resolvedAt: string;
    resolution: 'auto_continue' | 'user_override' | 'default';
  } | null;
}
```

### なぜ cloud-run-state と分離するか

| 観点 | cloud-run-state | 新規 schedule |
|------|-----------------|---------------|
| 書き込み頻度 | 1日1回（収集後） | UI から随時（明日の設定） |
| 履歴 | run 履歴が主 | 現在の意図が主 |
| 壊れやすさ | 上書きで履歴圧縮 | 独立して安全 |

**Cloud Run 読み取り順（Phase 40.5）:**

1. `loadDaily30CollectionSchedule()`
2. `effectiveBatchId === todayBatchId()` の override があれば採用
3. なければ `autoContinue` からキュー再開
4. なければデフォルトプロファイル（現行5県→将来46県）

### batchId と「翌日9:00 JST」の整合

- 現状 `todayBatchId()` は **UTC**
- Scheduler は `Asia/Tokyo` 9:00
- **Phase 40.2 で要修正:** `todayBatchIdJst()` または schedule の `effectiveBatchId` を JST 基準に統一

---

## 12. 東京除外の適用箇所（多層防御）

| 層 | 箇所 | 内容 |
|----|------|------|
| 1 | `daily30PrefectureRegistry.ts`（新規） | 46都道府県リストから東京都を除外。verify で固定 |
| 2 | `resolveCollectionAreasForProfile()`（新規） | キュー構築時に東京をスキップ |
| 3 | `fetchDaily30Candidates` | ループ前に area リストをフィルタ |
| 4 | `normalizeExternalLeadCandidate` / Places 結果 | `prefecture === '東京都'` → 破棄 or `blocked_by_policy` |
| 5 | UI 設定 | 東京都を選択肢に出さない |
| 6 | verify | 全探索クエリに「東京都」が含まれないこと |

---

## 13. 全国都道府県漏れ防止 verify 案

**新規:** `candidates/daily30PrefectureRegistry.ts`

```typescript
export const DAILY_30_NATIONWIDE_PREFECTURES_ORDERED: readonly string[] = [
  '宮城県', '福島県', '山形県', /* ... 46件。東京都なし */
];
export const DAILY_30_EXCLUDED_PREFECTURES = ['東京都'] as const;
```

**verify Phase 40.2+:**

- 件数 = 46（47都道府県 − 東京）
- 重複なし
- `東京都` を含まない
- ユーザー指定順序（要件の1〜46）と一致
- `DAILY_30_AREA_EXPANSION` は nationwide リストの**先頭部分集合**であること
- areaStrategy 切替時、キューが registry を漏れなく走査すること（dry-run テスト）

---

## 14. Lead一覧フィルター（Phase 40.4）✅ 完了

**実装**（`LeadCollectionFilterBar.tsx` + `GrowlySalesDashboard.tsx`）:

| フィルター | フィールド |
|------------|------------|
| 収集元 | `discoverySource` / `discoverySourceLabel` / `sourceType`（後方互換） |
| 求人サイト | `discoverySourceSite`（`job_site_reference` のみ） |
| エリア | `prefecture` / `area` / `regionGroup` / `collectionAreaSource` |
| エリア戦略 | `areaStrategy` |
| 収集プロファイル | `collectionMode` / `collectionProfileId` / `collectionProfileName` |
| メール確認 | `sourceComplianceStatus` / `emailSourceUrl` 推定 |

既存 `leadAreaFilter`（市区町村）は維持。都道府県は `prefectureFilter` として別行。

**表示:** `resolveCollectionProfileDisplay.ts` + `CollectionProfileDisplay.tsx` — Lead詳細 / 候補カード / 下書き候補 / 送信記録。

**discoverySourceUrl と emailSourceUrl:** UI で分離表示。求人サイト URL をメール取得元として表示しない。

**Cloud Run 反映:** Phase 40.5（本フェーズでは未実装）

---

## 15. 候補収集タブ「明日の収集設定」UI 追加箇所（Phase 40.3）

**推奨位置:** `CandidateCollectionView.tsx`

```
PageHeader
SectionCard「今日の状態」          ← 既存
SectionCard「明日の収集設定」      ← 新規（Phase 40.3）
SectionCard「1. 収集結果」         ← 既存
...
```

**内容:**

- 現在の解決済みプロファイル表示（auto / override）
- ラジオ: おまかせ継続 / 1日だけ指定 / 明日から継続 / おまかせに戻す
- 収集元・求人サイト・エリア・業種（参照のみの求人サイトはチェックボックス）
- 保存 → `POST /api/daily30-collection-schedule`（新規 API、Phase 40.3）
- DevDetails に生 JSON・手動編集（Phase 39 方針と同様）

---

## 16. 既存 Daily 30 を壊さない移行

1. **フィールドはすべて optional** — 既存 JSON はそのまま読める
2. **schedule ファイル未存在時** — 現行 `DAILY_30_AREA_EXPANSION` + `housing` プロファイルと同等のデフォルトをコード内生成
3. **Cloud Run 未更新時** — schedule を読まない旧バイナリでも収集可能（schedule 追加は forward-compatible）
4. **fetchDaily30Candidates シグネチャ** — 第4引数に `CollectionRunContext` を追加（既存呼び出しは undefined = レガシー）
5. **Gmail / leads 既存データ** — マイグレーション不要

---

## 17. GCS / local 両対応

既存パターンを踏襲:

1. `jsonDocumentNames.ts` に `DAILY30_COLLECTION_SCHEDULE_JSON` 追加
2. `jsonDocumentStorage.ts` の `resolveLocalPath` 拡張
3. `storage/daily30CollectionScheduleRepository.ts`（新規）— load / save / resolveProfileForBatch
4. `config/storageBackend.ts` の status 表示に schedule パス追加

---

## 18. Phase 40.2〜40.6 実装計画

### Phase 40.2 — 収集プロファイル基盤実装

| タスク | ファイル |
|--------|----------|
| 都道府県レジストリ（46、東京除外） | `candidates/daily30PrefectureRegistry.ts` |
| プロファイル型・解決ロジック | `candidates/daily30CollectionProfile.ts` |
| schedule リポジトリ | `storage/daily30CollectionScheduleRepository.ts` |
| 候補・Lead 型拡張（optional） | `externalLeadCandidateTypes.ts`, `lead.ts` |
| enrich / stub 伝播 | `enrichCandidateFields.ts`, `buildLeadStubFromExternalCandidate.ts` |
| JST batchId 検討 | `daily30AreaConfig.ts` |
| verify Phase 40.2 | `verify-growly-sales.ts` |
| docs 更新 | `GROWLY_SALES_DATA_SCHEMA.md` |

**やらない:** 求人サイトクロール、UI、Cloud Run 接続

### Phase 40.3 — 明日の収集設定 UI

| タスク | ファイル |
|--------|----------|
| 設定カード | `ui/Daily30CollectionSchedulePanel.tsx`（新規） |
| 組み込み | `CandidateCollectionView.tsx` |
| API | `server/uiServer.ts` — GET/POST schedule |
| 4モード UI | auto / one_day / from_next_day / reset |

### Phase 40.4 — Lead一覧フィルター ✅ 完了

| タスク | ファイル |
|--------|----------|
| 表示・フィルター解決 | `resolveCollectionProfileDisplay.ts` |
| フィルターバー | `LeadCollectionFilterBar.tsx` |
| UI 組み込み | `GrowlySalesDashboard.tsx`, `LeadDetailPanel.tsx` |
| 候補 / 下書き / 送信記録 | `CollectionProfileDisplay.tsx`, 各 View |
| 送信記録 memo | `recordManualGmailSent.ts` |
| verify | `verifyPhase404CollectionProfileDisplay` |

### Phase 40.5 — Cloud Run が schedule を読む ✅ 完了

| タスク | ファイル |
|--------|----------|
| profile 解決・消費 | `resolveDaily30CollectionSchedule.ts` |
| fetch 接続 | `fetchDaily30Candidates.ts` |
| Cloud Run 接続 | `runDaily30CloudAutoFetch.ts` |
| state 拡張 | `daily30CloudRunState.ts`（areasUsed, scheduleSource 等） |
| UI 表示 | `Daily30RunCollectionProfileSummary.tsx` |
| verify | `verifyPhase405CollectionScheduleExecution` |

**人間作業:** Cloud Run 再デプロイ（本番反映）

### Phase 40.6 — 外部掲載サイト参考ルート（安全基盤）

| タスク | ファイル |
|--------|----------|
| discovery アダプタ interface のみ | `adapters/discovery/`（スタブ） |
| コンプライアンスチェック | `candidates/sourceCompliance.ts` |
| Lead化ブロック | `getDaily30LeadApprovalBlockReason.ts` |
| メール分離強制 | `enrichCandidateEmailFromWebsite.ts` ガード |

**やらない:** 実際の求人サイト巡回（人間・方針承認後に別 Phase）

---

## 19. 安全ガード（Phase 40 全体）

- 既存 Phase 39 までのゲート（FETCH / GENERATE / IMPORT / CREATE_DRAFTS）は維持
- 求人サイトメール・フォーム送信はコード上 **blocked_by_policy**
- discovery のみ許可、email enrich は **officialSiteUrl ドメイン内のみ**
- ログイン必須・CAPTCHA・大量スクレイピングは既存 `GROWLY_SALES_SAFETY_RULES.md` 準拠
- secret は schedule JSON に含めない

---

## 20. Phase 40.1 成果物

- 本ドキュメント
- コード変更: **なし**（調査・設計のみ）
- verify: 実行済み（ベースライン確認、後述）
