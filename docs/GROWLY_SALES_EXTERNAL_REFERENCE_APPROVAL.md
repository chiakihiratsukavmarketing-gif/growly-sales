# Growly Sales — 外部参照収集 承認準備（Phase 41.1）

**作成日:** 2026-07-02  
**スコープ:** 調査・設計・承認用リストのみ。**外部サイトへの実アクセス・スクレイピング・自動巡回は未実施。**

**進行:** 外部参照 Daily 30 本運用α **18 / 18 フェーズ完了** ✅（2026-07-03）  
**現在地:** 本運用α完了 — **次ゴールは人間確認待ち**

---

## 1. ゴール再確認

**ゴール:** Growly Sales 外部参照 Daily 30 **本運用α** 完了

| 完了条件 | 状態 |
|----------|------|
| 明日の収集設定から外部参照元を指定できる | UI あり（40.3）/ 実行は Places フォールバック（40.5） |
| Daily 30 が安全に候補を補完できる | 41.2〜41.4 で実装予定 |
| メール取得元は公式サイトのみ | ✅ 40.6 |
| 外部掲載サイトメールは Lead 化ブロック | ✅ 40.6 |
| 30件 → Lead 化 → 営業文 → 下書き → 人間送信 → 記録 | 既存フロー完成 / 外部参照候補の追加待ち |
| Gmail 自動送信なし | ✅ 安全ルール |
| discovery / email 分離が追跡可能 | ✅ 40.4〜40.6 |
| 本番運用 1 回以上問題なし | ✅ 41.5J（2026-07-03 自然実行） |

---

## 2. 既存コードとの対応

| 概念 | コード |
|------|--------|
| `discoverySource` | `daily30CollectionProfile.ts` |
| `discoverySourceSite` | `wantedly` / `indeed` / … / `other` |
| `discoverySourceUrl` | 発見元 URL（メール取得元ではない） |
| 既知ホスト | `adapters/discovery/externalReferenceHosts.ts` |
| コンプライアンス | `candidates/sourceCompliance.ts` |
| Lead 化ブロック | `getDaily30LeadApprovalBlockReason.ts` |
| メール enrich | `enrichCandidateEmailFromWebsite.ts`（公式ドメインのみ） |
| discovery スタブ | `adapters/discovery/`（`referenceOnly: true`、実 crawl なし） |

---

## 3. 取得してよい情報 / してはいけない情報（全サイト共通）

### 取得してよい（discovery 段階）

- 会社名 / 店舗名
- 所在地（都道府県・市区町村レベル）
- 業種（住宅 / 工務店 / リフォーム 等）
- **公式サイト候補 URL**（人間確認前提）
- **掲載元 URL**（`discoverySourceUrl`）
- 事業概要の短い要約（公開ページから人間が読んだ内容の手入力可）
- 公式サイトへ辿るための検索補助情報（社名表記・エリア）

### 取得してはいけない / 使用禁止

- 求人サイト・楽天・ポータル上の **メールアドレス**
- 採用担当者名・個人名
- 個人メール・個人電話
- 応募フォーム / 問い合わせフォームへの **自動送信**
- ログイン必須ページの情報
- CAPTCHA 回避が必要な情報
- 規約上問題のある大量自動収集

**メール:** 必ず `enrichCandidateEmailFromWebsite` で **公式サイトドメイン内のみ**。  
**Lead 化:** `sourceCompliance` が `official_site_verified` でない場合は原則ブロック。

---

## 4. 対象サイト候補一覧

評価記号: ◎ 向いている / ○ 条件付き / △ 慎重 / × 自動巡回非推奨

| # | 表示名 | discoverySource | discoverySourceSite | 想定用途 | Daily30補完 | 手動URL | 自動巡回 |
|---|--------|-----------------|---------------------|----------|-------------|---------|----------|
| 1 | **手動URL** | `manual_url` | — | 人間が見つけた任意掲載ページ | ○ | **◎** | × |
| 2 | **業界団体サイト** | `industry_directory_reference` | `other` + ラベル | 工務店・住宅関連団体の会員一覧 | ○ | **◎** | △ 低頻度のみ |
| 3 | **住宅会社紹介サイト** | `portal_site_reference` | `other` | まとめサイト・紹介メディア | ○ | **◎** | △ |
| 4 | **施工事例サイト** | `portal_site_reference` | `other` | 事例掲載から工務店を発見 | ○ | **◎** | △ |
| 5 | **地域ポータル** | `portal_site_reference` | `other` | 自治体・地域メディアの企業紹介 | ○ | **◎** | △ 低頻度 |
| 6 | **楽天市場** | `rakuten_marketplace_reference` | — | EC 店舗の公式サイトたどり | △ | ○ | × 大量非推奨 |
| 7 | **Wantedly** | `job_site_reference` | `wantedly` | 会社ページから公式サイト | ○ | **◎** | △ |
| 8 | **Indeed** | `job_site_reference` | `indeed` | 同上 | ○ | ○ | × |
| 9 | **求人ボックス** | `job_site_reference` | `kyujinbox` | 同上 | ○ | ○ | △ |
| 10 | **engage** | `job_site_reference` | `engage` | 同上 | ○ | ○ | △ |
| 11 | **Green** | `job_site_reference` | `green` | 同上 | ○ | ○ | △ |
| 12 | **doda** | `job_site_reference` | `doda` | 同上 | ○ | ○ | × |
| 13 | **マイナビ転職** | `job_site_reference` | `mynavi_tenshoku` | 同上 | ○ | ○ | × |
| 14 | **リクナビNEXT** | `job_site_reference` | `rikunabi_next` | 同上 | ○ | ○ | × |

> **注:** 施工事例・住宅紹介は現行型では `portal_site_reference` + `discoverySourceLabel` で区別。Phase 41.2 以降 UI でラベル選択可。

---

## 5. サイト別リスク整理

### 5.1 手動 URL（`manual_url`）

| 項目 | 評価 |
|------|------|
| ログイン必須 | URL 依存（人間が公開ページのみ指定） |
| CAPTCHA | システムはアクセスしない |
| robots / 規約 | **人間が URL を選ぶ責任** |
| 自動アクセス | **不要**（保存のみ） |
| 低頻度自動 | 不要 |
| API | なし |
| 表記揺れ | 人間入力 + 重複チェック |
| 公式 URL 誤判定 | 人間が `officialSiteUrl` を確認 |
| メール混同 | 40.6 ガードでブロック |

**結論:** 最安全。Phase 41.2 の第一実装対象。

---

### 5.2 業界団体サイト（`industry_directory_reference`）

| 項目 | 評価 |
|------|------|
| ログイン必須 | 多くは公開会員一覧 |
| CAPTCHA | 低〜中 |
| robots / 規約 | **要確認**（団体ごと） |
| 自動アクセス | 低頻度・少数 URL なら Phase 41.3 候補 |
| 住宅相性 | **高**（工務店・リフォーム団体） |
| 公式 URL | 会員ページに公式リンクありがち |

**結論:** 手動 URL 投入 ◎。自動は **許可リスト方式** + 低頻度。

---

### 5.3 地域ポータル / 施工事例 / 住宅紹介（`portal_site_reference`）

| 項目 | 評価 |
|------|------|
| ログイン必須 | 記事・事例は公開が多い |
| CAPTCHA | サイト依存 |
| robots / 規約 | **要確認** |
| 自動アクセス | ポータルごとに個別判断 |
| 表記揺れ | 紹介名 ≠ 正式社名のリスク **中** |
| 公式 URL | 記事内リンク要人間確認 |

**結論:** 手動 URL ◎。自動はポータル単位で **ホワイトリスト承認後**。

---

### 5.4 楽天市場（`rakuten_marketplace_reference`）

| 項目 | 評価 |
|------|------|
| ログイン | 閲覧は公開可が多い |
| CAPTCHA | 中（アクセス増で上がりやすい） |
| robots / 規約 | **厳しめ想定** — 要法務・規約確認 |
| 住宅相性 | 中（リフォーム資材・家具 EC は別ターゲット） |
| メール | **店舗ページメールは使用禁止**（40.6） |
| 大量巡回 | **×** |

**結論:** 手動 URL のみ ○。自動巡回は **本運用α 後** または対象外。

---

### 5.5 求人サイト（`job_site_reference`）

| サイト | ログイン | CAPTCHA | 規約リスク | 自動 | 手動URL | 住宅相性 |
|--------|----------|---------|------------|------|---------|----------|
| **Wantedly** | 低 | 低〜中 | 中 | △ 低頻度 | ◎ | 高 |
| **Green** | 低 | 中 | 中 | △ | ○ | 中 |
| **engage** | 低 | 中 | 中 | △ | ○ | 中 |
| **求人ボックス** | 低 | 中 | 中〜高 | △ | ○ | 中 |
| **Indeed** | 低 | **高** | **高** | **×** | ○ | 中 |
| **doda** | 中 | **高** | **高** | **×** | ○ | 中 |
| **マイナビ転職** | 中 | **高** | **高** | **×** | ○ | 中 |
| **リクナビNEXT** | 中 | **高** | **高** | **×** | ○ | 中 |

**共通リスク:**

- 求人ページの **採用メールは使用禁止**
- 会社名と **正式商号** のズレ
- 公式サイトリンクが **採用 LP** のみの場合あり → コーポレート URL 要確認
- 大量アクセスは **アカウント停止・IP ブロック** リスク

**結論:** 全求人サイト **手動 URL から開始**。自動は Wantedly / 中小サイトのみ **41.3 で個別承認**。

---

## 6. 推奨実装優先順位

評価軸: 安全性 > 規約リスク > 手動適性 > 住宅相性 > 実装容易性 > メール貢献

| 順位 | 対象 | 理由 |
|------|------|------|
| **1** | **手動 URL 投入** | 実アクセスなし・人間確認・40.6 と完全整合 |
| **2** | **業界団体サイト** | 住宅ターゲット一致・公開一覧多い・手動が容易 |
| **3** | **地域ポータル** | 仙台/東北の地域メディアと相性良 |
| **4** | **施工事例 / 住宅紹介** | 工務店発見に有効・手動 URL 向き |
| **5** | **Wantedly（手動→低頻度自動）** | 会社ページ構造が比較的シンプル |
| **6** | **Green / engage / 求人ボックス** | 中リスク・個別規約確認後 |
| **7** | **楽天市場参考** | EC 寄り・規約厳しめ・優先度低 |
| **8** | **Indeed / doda / マイナビ / リクナビ** | CAPTCHA・規約リスク大・**自動巡回は最後** |

---

## 7. 自動化してよい範囲 / しない範囲

### 自動化してよい（Phase 41.2 以降）

- 手動入力 URL の `discoverySourceUrl` として保存
- `discoverySource` / `discoverySourceSite` / `collectionProfile` スナップショット付与
- 会社名・公式サイト候補 URL の **保存**（人間入力値）
- 表記揺れ・既存 Lead / 候補との **重複チェック**（既存 dedupe）
- **公式サイト内**の代表メール確認（`enrichCandidateEmailFromWebsite`）
- `sourceCompliance` 判定・UI 表示
- Lead 化ブロック（`blocked_by_policy` 等）
- verify / 監査ログ（secret なし）

### 自動化しない（人間承認まで禁止）

- 求人サイトの **大規模巡回**
- 楽天市場の **大量巡回**
- ログイン必須ページの取得
- CAPTCHA 回避
- 応募・問い合わせフォーム送信
- 外部掲載サイト上メールの採用
- 採用担当者個人情報の収集
- Gmail 送信 / `messages.send`
- Gmail 下書きの **無確認大量** `drafts.create`
- Cloud Scheduler / Secret / OAuth / API キー変更
- 既存 Lead・送信履歴・GCS 候補の削除

---

## 8. Phase 41.2 仕様案 — 手動 URL 投入型

### 8.1 ユーザーフロー

```
人間が候補収集タブ「外部参照を手動追加」を開く
  ↓
discoverySource / discoverySourceSite を選択
  ↓
discoverySourceUrl（掲載元URL）を入力 ※システムはこのURLにアクセスしない
  ↓
companyName / officialSiteUrl候補 / area（都道府県）を入力
  ↓
（任意）「公式サイトでメール確認」→ enrichCandidateEmailFromWebsite（公式のみ）
  ↓
sourceCompliance 判定 → UI に status 表示
  ↓
external-candidates.json に preview 候補として保存
  ↓
Lead化承認待ち一覧へ（blocked なら承認不可）
```

### 8.2 UI（新規）

| コンポーネント | 内容 |
|----------------|------|
| `Daily30ManualExternalReferencePanel.tsx` | 手動追加フォーム |
| 配置 | `CandidateCollectionView.tsx` — 候補収集タブ |

**入力項目:**

| フィールド | 必須 | 備考 |
|------------|------|------|
| `discoverySource` | ✅ | select |
| `discoverySourceSite` | 条件付き | `job_site_reference` 時 |
| `discoverySourceUrl` | ✅ | 掲載元。アクセスしない |
| `companyName` | ✅ | |
| `officialSiteUrl` | 推奨 | 未入力なら `official_site_not_found` |
| `prefecture` / `area` | ✅ | |
| `discoverySourceLabel` | 任意 | ポータル名等 |
| `notes` | 任意 | 人間メモ |

**表示:**

- `CollectionProfileDisplay` — 発見元 vs メール取得元
- `sourceComplianceStatus` バッジ
- `blocked_by_policy` 時は Lead 化不可理由

### 8.3 API（案）

| メソッド | パス | 用途 |
|----------|------|------|
| `POST` | `/api/daily30-external-reference/manual` | 候補 1 件追加 |
| `POST` | `/api/daily30-external-reference/manual/enrich` | 公式サイトメール確認のみ |

**ゲート:** 新規 `ADD_EXTERNAL_REFERENCE_MANUAL`（人間確認 UI）または既存 FETCH 系とは **独立**（Gmail / Places 不使用）

**保存:**

- `external-candidates.json` に `importStatus: preview` / `pipelineStatus: collected|email_found|email_not_found`
- `discoverySourceUrl` 設定 / `emailCandidateSourceUrl` は enrich 後のみ公式ドメイン

### 8.4 サーバー処理（案）

1. URL バリデーション（形式のみ。**fetch しない**）
2. `discoverySourceUrl` が既知外部ホストなら `discoverySourceSite` 自動推定（任意）
3. `applyDaily30DefaultCollectionProfile` + `evaluateSourceCompliance`
4. 重複チェック `findDuplicateReason`
5. `enrichExternalLeadCandidate` → 保存

### 8.5 verify（Phase 41.2）

`verifyPhase412ManualExternalReference`:

- 手動 API が外部 URL を fetch しない
- `discoverySourceUrl` ≠ `emailCandidateSourceUrl`（求人サイトケース）
- `blocked_by_policy` で Lead 化不可
- secret / token 非表示
- Gmail send / drafts.create 不使用

---

## 9. Phase 41.3〜41.5 ロードマップ

| フェーズ | 名称 | 内容 | 人間承認 |
|----------|------|------|----------|
| **41.1** ✅ | 承認準備 | 本ドキュメント | — |
| **41.2** | 手動 URL 投入 | UI + API + verify | UI 操作 |
| **41.3** ✅ | 低頻度 adapter | 許可サイトのみ `DiscoveryReferenceAdapter` 基盤（dry-run / rate limit） | **サイト別承認必須** |
| **41.4** ✅ | Daily 30 接続 | `fetchDaily30Candidates` が execution plan を参照し補完可否を判断。手動URL候補参照。実ネットワークなし | Cloud Run 再デプロイ |
| **41.5** | 本運用α 完了判定 | 1 回以上本番で external 候補がフロー完走・監査 OK | 運用確認 |

### 41.3 実装順（承認後・案）

1. 業界団体（許可 URL リスト固定）
2. 地域ポータル（1 ポータルずつ）
3. Wantedly 低頻度（1 社ページ / 実行）
4. その他求人サイトは **手動のみ継続**

### 41.4 接続方針（実装済み 2026-07-02）

- `fetchDaily30Candidates` / Cloud Run がメール取得 30 件未達時に `runDaily30ExternalReferenceSupplement()` を呼ぶ
- `resolveDiscoveryAdapterExecutionPlan()` で canRun / mode を判定
- **未承認 / dry-run / blocked:** 外部アクセスなし。warning + state + UI に理由を記録
- **approved_for_low_frequency:** Phase 41.4 では adapter 呼び出しのみ（`networkAccessPerformed: false`・実巡回 pending）
- **手動 URL:** `external-candidates.json` の `manual-external-reference` を補完候補として参照（`blocked_by_policy` 除外）
- **dryRun:** execution plan 確認のみ。state / GCS / schedule 変更なし
- メール enrich は常に公式サイトのみ（40.6 不変）
- **Cloud Run 反映:** 再デプロイ必要（人間確認後）。Scheduler / Secret 変更不要

### 41.5H GCS compliance dry-run（2026-07-02）

- `npm run growly-sales:phase415h-compliance-dry-run` — 読み取り専用
- 更新対象 23件（`sourceComplianceStatus` / `sourceComplianceNote` のみ）
- **GCS 書き込み未実施** — 人間承認後に 41.5H-2 で apply

### 41.5 完了判定チェックリスト

- [ ] 手動 URL で候補が Daily 30 一覧に載る
- [ ] 公式サイトメール確認 → `official_site_verified`
- [ ] 外部掲載メール候補は Lead 化不可
- [ ] Lead 化 → 営業文 → 下書き候補 → CREATE_DRAFTS → 人間送信 → 記録
- [ ] `discoverySourceUrl` / `emailSourceUrl` が UI・Lead で追跡可能
- [ ] 本番 Cloud Run 1 回以上成功 or partial_success
- [ ] Gmail 自動送信なし

---

## 10. 人間承認が必要な項目

| 項目 | タイミング |
|------|------------|
| 本ドキュメントの方針承認 | **Phase 41.1 → 41.2 前** |
| サイト別 robots / 利用規約確認 | Phase 41.3 各サイト前 |
| 低頻度自動 adapter の有効化 | Phase 41.3 サイトごと |
| Cloud Run 再デプロイ | Phase 41.4 |
| Cloud Scheduler / Secret 変更 | 原則しない（必要時のみ） |
| 外部サイト実巡回開始 | **41.3 以降・サイト別** |
| Gmail 下書き本番作成 | 既存 CREATE_DRAFTS ゲート |
| Gmail 手動送信 | 人間 |

---

## 11. Phase 41.1 実施記録

| 項目 | 結果 |
|------|------|
| 外部サイト実アクセス | **未実施** |
| スクレイピング | **未実施** |
| コード変更 | **なし**（docs のみ） |
| verify | **未実行**（コード変更なし） |

**参照ファイル:** CLAUDE.md, NEXT_TASKS.md, WORK_LOG.md, GROWLY_SALES_COLLECTION_PROFILE_SCHEMA.md, GROWLY_SALES_DAILY30_COLLECTION_PROFILE_PLAN.md, GROWLY_SALES_DAILY30_RUNBOOK.md, `adapters/discovery/*`, `sourceCompliance.ts`, `getDaily30LeadApprovalBlockReason.ts`, `enrichCandidateEmailFromWebsite.ts`

---

## 13. Phase 41.2 — 手動 URL 投入型（実装済み）

**UI:** 候補収集タブ「外部参照URLから候補追加」  
**API:** `POST /api/daily30-external-reference/manual`

| 項目 | 内容 |
|------|------|
| 掲載元URL | `discoverySourceUrl` として保存。**システムはアクセスしない** |
| enrich | `shouldEnrichOfficialSiteEmail=true` 時のみ `officialSiteUrl` ドメイン内 |
| プロファイル | `collectionProfileId: manual-external-reference` / `collectionMode: manual` |
| Lead化 | 公式サイト + 代表メール確認済みのみ承認可。`blocked_by_policy` は不可 |
| verify | `verifyPhase412ManualExternalReference` |

---

## 12. 承認チェック（人間用）

- [ ] 推奨優先順位（§6）に同意
- [ ] 取得可/不可（§3）に同意
- [ ] Phase 41.2 を手動 URL から開始することに同意
- [ ] 大規模求人サイト自動巡回を **41.3 以降・個別承認** とすることに同意
- [ ] 41.5 完了条件（§9）に同意

**承認者:** _______________ **日付:** _______________
