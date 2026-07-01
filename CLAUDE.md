# Growly Sales — AIエージェント作業入口

> **このリポジトリは Growly Sales（AI営業OS）です。**  
> **Growly SNS分析アプリ（`OneDrive\ドキュメント\growly\`）とは別プロジェクトです。混同しないでください。**

## ワークスペース

```
C:\Users\chiak\AI_\Growly Sales
```

別パスの `growly\CLAUDE.md` / `WORK_LOG.md` / `NEXT_TASKS.md` は **SNS分析アプリ用** です。本リポジトリの handoff は **プロジェクトルート** の同名ファイルを参照してください。

## プロジェクト概要

SNS運用代行の営業先を **発掘・分析・営業文作成・校閲・下書き作成・送信管理・返信分析** まで行う AI営業OS。

| 項目 | 内容 |
|------|------|
| 初期ターゲット | 宮城・仙台 / 住宅会社・工務店・リフォーム |
| 初期オファー | Instagram / SNS運用代行の無料診断レポート |
| データ保存 | ローカル JSON / CSV（`data/growly-sales/`） |

## 最初に読む docs

1. `docs/GROWLY_SALES_MASTER_BLUEPRINT.md`
2. `docs/GROWLY_SALES_PROJECT_STATE.md`
3. `docs/GROWLY_SALES_WORKFLOW.md`
4. `docs/GROWLY_SALES_SAFETY_RULES.md`
5. `docs/GROWLY_SALES_DATA_SCHEMA.md`
6. `docs/GROWLY_SALES_EVALUATION.md`
7. `docs/GROWLY_SALES_IMPLEMENTATION_PLAN.md`
8. `docs/GROWLY_SALES_RUN_LOG.md`
9. `docs/GROWLY_SALES_PILOT_RUNBOOK.md`
10. `docs/GROWLY_SALES_PILOT_CHECKLIST.md`
11. `docs/GROWLY_SALES_EMAIL_CANDIDATES_IMPROVEMENT_PLAN.md`（連絡導線改善設計）
12. `docs/GROWLY_SALES_DAILY30_RUNBOOK.md`（Daily 30 毎日運用手順・Phase 26）

作業ログ・次タスク: **`WORK_LOG.md`** / **`NEXT_TASKS.md`**（本リポジトリルート）

## 現在 Phase

| 状態 | Phase |
|------|-------|
| **完了** | **Phase 37.1** — Cloud Run 再デプロイ（partial_success 本番反映） |
| **直近完了** | Phase 37 partial_success/state/UI / Phase 36.6 Lead一覧 |
| **運用** | **2026-07-01 Daily30 実運用** — 下書き7件作成済。**次: Gmail手動送信→送信記録** |

### Daily 30 フロー（Phase 23–26 完成）

```
FETCH_DAILY_30 → Lead化承認 → GENERATE_DAILY_30_COPY
→ IMPORT_DAILY_30_DRAFT_CANDIDATES → 下書き候補承認 → CREATE_DRAFTS
→ Gmail手動送信 → 送信記録 → 返信管理
```

| ゲート | 用途 |
|--------|------|
| `FETCH_DAILY_30` | 候補収集 |
| `GENERATE_DAILY_30_COPY` | 営業文生成・品質チェック |
| `IMPORT_DAILY_30_DRAFT_CANDIDATES` | leads.json 取り込み（Gmail API 不使用） |
| `CREATE_DRAFTS` | Gmail 下書き作成のみ |

詳細: `docs/GROWLY_SALES_DAILY30_RUNBOOK.md`

### MVPフロー進捗（当初ゴール）

| ステップ | 状態 |
|----------|------|
| 候補収集（Daily 30） | ✅ フロー完成（`FETCH_DAILY_30`） |
| 個別営業メール生成 | ✅（`GENERATE_DAILY_30_COPY`） |
| 人間承認 | ✅（Lead化 + 下書き候補タブ） |
| Gmail下書き作成 | ✅（`CREATE_DRAFTS`・パイロット実績あり） |
| 人間送信 | 運用時に Gmail 画面で実施 |
| 手動結果記録 | ✅（送信記録タブ） |

### Phase 21–26 で確定した Daily 30 コマンド

- `npm run growly-sales:daily30-preview` — dry-run
- `npm run growly-sales:daily30-fetch` — `FETCH_DAILY_30` 必須
- `npm run growly-sales:daily30-generate-copy` — `GENERATE_DAILY_30_COPY` 必須
- `npm run growly-sales:daily30-import-draft-candidates` — `IMPORT_DAILY_30_DRAFT_CANDIDATES` 必須
- 互換: `candidates-preview` / `fetch-candidates`（Phase 21）

## 安全ルール（必須）

| ルール | 内容 |
|--------|------|
| 自動送信 | **禁止** |
| Gmail送信 | **禁止**（`users.drafts.send` / `users.messages.send` 禁止） |
| Gmail下書き | `users.drafts.create` のみ。`CREATE_DRAFTS` 確認必須。`GMAIL_DRAFT_CREATE_LIMIT` で件数制限可 |
| Google Maps | **画面スクレイピング禁止**（Places API adapter のみ可・ゲート付き） |
| 個人メール | **収集禁止** |
| 非公開情報 | ログイン必要ページ・会員限定は **取得禁止** |
| APIキー | `.env` のみ。**直書き・コミット禁止** |
| 外部API fetch | `API_PRODUCTION_ENABLED=true` + **`FETCH_CANDIDATES` 確認必須** |
| 外部候補 | **直接 Lead 化禁止**。人間確認後のみ `input-sites.csv` へ |
| 大量収集 | 無差別大量収集・大量スクレイピング **禁止** |

## 禁止事項（実装・運用）

- OpenAI / Supabase / Google Sheets / 外部DB の無断接続
- `.env` のコミット
- 候補の自動 Lead 化・自動営業
- WHOIS / 画像OCR / SNS個人プロフィールからのメール取得
- 既存 Lead の無断削除

## 実行してよい確認コマンド（人間確認不要）

```powershell
cd "C:\Users\chiak\AI_\Growly Sales"
npm run growly-sales:verify
npm run growly-sales:mvp-check
npm run growly-sales:candidates-preview  # Phase 21 dry-run・外部通信なし
npm run growly-sales:daily30-preview     # Daily 30 dry-run
npm run growly-sales:candidates-audit    # 30件収集の監査
npm run growly-sales:external-preview    # 互換 dry-run
npm run growly-sales:gmail-preview       # dry-run・Gmail API非接続
npm run growly-sales:gmail-oauth-helper  # refresh token 取得補助のみ
npm run growly-sales:ui:build
npm run growly-sales:day1                # 既存 input-sites.csv のみ
npm run growly-sales:generate
```

## 人間確認が必要な作業

| 作業 | 確認 |
|------|------|
| Daily 30 候補収集 | `FETCH_DAILY_30`（UI または `daily30-fetch`） |
| Daily 30 営業文生成 | `GENERATE_DAILY_30_COPY` |
| Daily 30 leads 取り込み | `IMPORT_DAILY_30_DRAFT_CANDIDATES`（一括）または UI 1件ずつ |
| 30件候補取得（Phase 21 互換） | `FETCH_CANDIDATES` |
| 外部候補取り込み | UI個別承認 + CLI **`IMPORT_APPROVED`** |
| Gmail下書き実作成 | Gmail OAuth設定 + CLI **`CREATE_DRAFTS`** |
| 手動送信記録 | UI操作（Growly Salesは送信しない） |
| APIキー追加・`.env` 編集 | 人間が実施 |
| 新規 npm パッケージ追加 | 理由を明記し人間確認 |

## 連絡導線の要点

- `emailCandidates` → **Gmail下書き候補**（Phase 16）
- `contactFormUrl` → **コピー運用**（下書き候補UI）
- パイロット6社は emailCandidates **3社 (50%)**（Phase 20-lite 改善後）。Gmail下書き実作成は Phase 19 で1件成功。
