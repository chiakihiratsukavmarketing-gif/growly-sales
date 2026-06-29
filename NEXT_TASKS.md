# Growly Sales — NEXT_TASKS

次回セッションで着手するタスク。  
**Growly SNS分析アプリ**（`OneDrive\ドキュメント\growly\NEXT_TASKS.md`）とは別ファイルです。

**ワークスペース:** `C:\Users\chiak\AI_\Growly Sales`  
**更新日:** 2026-06-29  
**現在フォーカス:** **Phase 26 完了** — Daily 30 毎日運用開始

作業入口: [CLAUDE.md](./CLAUDE.md) · 履歴: [WORK_LOG.md](./WORK_LOG.md) · Daily 30: [docs/GROWLY_SALES_DAILY30_RUNBOOK.md](./docs/GROWLY_SALES_DAILY30_RUNBOOK.md)

---

## ロードマップ（Phase 18–26）

| Phase | 内容 | 状態 |
|-------|------|------|
| 18 | 外部候補・`FETCH_CANDIDATES` ゲート | **完了** |
| 19 | Gmail下書き実作成・`CREATE_DRAFTS` | **完了** |
| 21 | 30件候補収集フロー | **完了** |
| 23 | Daily 30 候補収集 | **完了** |
| 24 | 営業文生成・品質チェック | **完了** |
| 25 | ready_for_draft → leads.json → Gmail下書きフロー接続 | **完了** |
| **26** | **Daily 30 完成版・運用統合** | **完了** |

---

## Phase 26（完了）— Daily 30 運用統合

### 完了項目

- [x] エンドツーエンドチェックリスト（候補収集タブ）
- [x] 今日の進捗サマリー（12指標 + 次にやること）
- [x] 4ゲートの役割表示（FETCH / GENERATE / IMPORT / CREATE_DRAFTS）
- [x] Daily 30 安全ルール（候補収集タブ + 設定タブ）
- [x] `docs/GROWLY_SALES_DAILY30_RUNBOOK.md`
- [x] `verifyPhase26Daily30OperationsIntegration`
- [x] CLAUDE.md 更新

### 毎日の手順（運用開始）

1. UI を開く → **候補収集**タブで進捗確認
2. 不足なら `FETCH_DAILY_30`
3. Lead化承認 → `GENERATE_DAILY_30_COPY`
4. 取り込み → 下書き候補タブで承認 → `CREATE_DRAFTS`
5. Gmail 手動送信 → 送信記録 → 返信管理

---

## 任意・継続運用

- [ ] タカコウ・ハウス2件目 Gmail 下書き（`CREATE_DRAFTS`）
- [ ] 実際の Daily 30 本番 fetch（APIキー + ゲート）
- [ ] 週次で `npm run growly-sales:verify` 実行

---

## 参考コマンド

```powershell
cd "C:\Users\chiak\AI_\Growly Sales"
npm run growly-sales:verify
npm run growly-sales:ui
npm run growly-sales:daily30-preview
npm run growly-sales:daily30-fetch              # FETCH_DAILY_30
npm run growly-sales:daily30-generate-copy      # GENERATE_DAILY_30_COPY
npm run growly-sales:daily30-import-draft-candidates  # IMPORT_DAILY_30_DRAFT_CANDIDATES
npm run growly-sales:fetch-candidates              # FETCH_CANDIDATES（Phase 21 互換）
npm run growly-sales:gmail-create-drafts           # CREATE_DRAFTS
```
