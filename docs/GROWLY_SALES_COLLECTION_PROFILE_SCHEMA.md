# Growly Sales — Collection Profile スキーマ（Phase 40.2）

**目的:** Daily 30 の収集が「どの方針・エリア・発見元」で実行されたかを、候補・Lead・state に記録する。

---

## 1. batchId（JST）

| 項目 | 内容 |
|------|------|
| 新規 run | `todayBatchIdJst()` / `resolveDaily30BatchIdJst()` → JST の `YYYY-MM-DD` |
| 既存データ | UTC 由来の `collectionBatchId` はそのまま（上書きしない） |
| Cloud state | `runStartedAtUtc`（ISO）+ `runStartedAtJst`（YYYY-MM-DD）を optional 保存 |

**例:** 2026-07-02 09:00 JST 実行 → `batchId: 2026-07-02`

---

## 2. 収集プロファイルフィールド

### 候補（`ExternalLeadCandidate`）・Lead 共通（optional）

| フィールド | 説明 |
|------------|------|
| `collectionProfileId` | 例: `daily30-housing-auto` |
| `collectionProfileName` | 表示名 |
| `collectionMode` | `auto_continue` / `user_selected` / `one_day_override` / `manual` |
| `industryCategory` | `housing` / `reform` / `real_estate` / `ec` / `other` |
| `areaStrategy` | `priority_miyagi_fukushima_yamagata` / `north_kanto` / `nationwide_excluding_tokyo` |
| `areaQueuePosition` | 都道府県キュー上の位置 |
| `discoverySource` | 企業候補の発見元分類 |
| `discoverySourceSite` | 求人サイト名（`wantedly` 等） |
| `discoverySourceLabel` | 人間向けラベル |
| `discoverySourceUrl` | **企業を見つけた掲載元 URL** |
| `sourceComplianceStatus` | 公式サイト・メール確認のコンプライアンス |
| `sourceComplianceNote` | 補足 |
| `collectionRunId` | 収集実行 ID（Cloud Run `runId` と同等想定） |
| `collectionBatchId` | 日次バッチ（Lead にも引き継ぎ） |

### レガシー（維持）

- `sourceType` / `sourceUrl` — Places / Web 検索の従来フィールド
- `emailCandidateSourceUrl(s)` / Lead の `emailSourceUrl` 表示 — **メール取得元（公式サイトのみ）**

---

## 3. discoverySourceUrl と emailSourceUrl の違い

| 種別 | 意味 | 例 |
|------|------|-----|
| `discoverySourceUrl` | 企業候補を**発見した**掲載元 | Indeed 求人ページ、楽天市場店舗、ポータル |
| `emailSourceUrl` / `emailCandidateSourceUrl` | メールを**確認した公式サイト上の URL** | `https://example.co.jp/contact` |

**禁止:** 求人サイト・楽天・ポータル上のメールを `emailSourceUrl` として扱わない。

---

## 4. エリア戦略と都道府県レジストリ

- **第1優先:** 宮城・福島・山形
- **第2優先:** 北関東（茨城・栃木・群馬）
- **第3優先:** 全国 46 道府県（**東京都除外**）

実装:

- `daily30PrefectureRegistry.ts` — 全国 46 件・順序固定・東京除外
- `DAILY_30_AREA_EXPANSION` — 当面の収集ループ（6 県・後方互換）
- `filterDaily30ExecutionAreas()` — 実行直前の二重ガード

---

## 5. collection schedule JSON

**ファイル:** `daily30-collection-schedule.json`（`daily30-cloud-run-state.json` とは別）

| フィールド | 説明 |
|------------|------|
| `activeProfile` | 現在有効な収集プロファイル |
| `nextProfileOverride` | 翌日以降の override（Phase 40.3 UI） |
| `oneDayOverride` | 1 日限定 override |
| `autoContinue` | おまかせ継続カーソル（Phase 40.5 で消費） |
| `updatedAt` / `updatedBy` | 監査 |

**未存在時フォールバック:**

- `auto_continue` + `housing` + `priority_miyagi_fukushima_yamagata` + `google_places`

**Repository:** `daily30CollectionScheduleRepository.ts`（GCS / local 両対応）

---

## 6. 後方互換

- 既存候補・Lead の profile フィールドは `undefined` / `null` 可
- 新規収集候補に `applyDaily30DefaultCollectionProfile()` でデフォルト付与
- Lead 化・下書き取り込み時に `copyCollectionProfileToLead()` で引き継ぎ

---

## 7. Phase 40.2 で未実装（次フェーズ）

- ~~明日の収集設定 UI（40.3）~~ ✅ Phase 40.3 完了
- ~~Cloud Run が schedule を読んで実行順を変える処理（40.5）~~ ✅ Phase 40.5 完了
- 求人サイト・楽天の自動巡回（40.6）

## 8. Phase 40.3 — 明日の収集設定 UI

- **場所:** 候補収集タブ「明日の収集設定」（`Daily30CollectionSchedulePanel`）
- **API:** `GET/POST /api/daily30-collection-schedule`
- **保存:** `oneDayOverride` / `nextProfileOverride` / `reset_to_auto`
- **保存 / 実行:** UI 保存 + Daily 30 実行時に schedule 解決（Phase 40.5）
- **DevDetails:** raw schedule JSON（secret なし）

## 9. Phase 40.4 — Lead一覧・候補一覧の表示 / フィルター

- **Lead一覧:** `LeadCollectionFilterBar` — 収集元 / 求人サイト / エリア（都道府県） / エリア戦略 / 収集プロファイル / メール確認
- **Lead詳細:** 「収集情報」セクション — `discoverySourceUrl` と `emailSourceUrl` を分離表示
- **候補カード:** `CollectionProfileDisplay` compact — 収集元・エリア・方針
- **下書き候補 / 送信記録:** 収集元・発見元・メール取得元を表示・記録（optional・後方互換）
- **既存 Lead:** フィルター「すべて」で必ず表示。profile 未設定は「未設定」表示
- **未実装:** Cloud Run 再デプロイ後に本番反映（コードは Phase 40.5 完了）
- **verify:** `verifyPhase404CollectionProfileDisplay`

## 10. Phase 40.5 — Cloud Run / Daily 30 が schedule を読む

### 選択優先順位（JST batchId）

1. `oneDayOverride` — `effectiveFromBatchId === 当日 batchId` → 実行後クリア
2. `nextProfileOverride` — `batchId >= effectiveFromBatchId` → `activeProfile` に昇格・override クリア
3. `activeProfile`
4. `default_fallback` — schedule 欠損時（`daily30-housing-auto`）

### 実行時の記録

- **候補:** 解決済み profile を `applyDaily30DefaultCollectionProfile` で付与
- **cloud-run-state:** `areasUsed`, `scheduleSource`, `scheduleWarning`, `discoverySource*` 等
- **discoverySource が求人サイト等:** profile に記録するが収集は Google Places / 公式サイト検索のみ（warning: `external_reference_collection_not_yet_implemented`）

### dryRun

- schedule を読み `selectedProfile` / `wouldConsumeOverride` / `warning` を返す
- GCS 保存・schedule 消費・state 書き込みはしない
- **verify:** `verifyPhase405CollectionScheduleExecution`
