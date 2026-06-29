# Growly Sales — WORK_LOG

作業履歴の簡易ログ。詳細な Phase 履歴は `docs/GROWLY_SALES_RUN_LOG.md` / `docs/GROWLY_SALES_PROJECT_STATE.md` を参照。

> **注意:** `OneDrive\ドキュメント\growly\WORK_LOG.md` は **Growly SNS分析アプリ** 用です。本ファイルは **Growly Sales** 専用です。

**ワークスペース:** `C:\Users\chiak\AI_\Growly Sales`

---

## 2026-06-25 — Phase 21: 30件候補収集フロー

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

次回作業: [NEXT_TASKS.md](./NEXT_TASKS.md) — **Phase 20**
