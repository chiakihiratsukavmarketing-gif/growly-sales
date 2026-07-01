# Growly Sales — NEXT_TASKS

次回セッションで着手するタスク。  
**Growly SNS分析アプリ**（`OneDrive\ドキュメント\growly\NEXT_TASKS.md`）とは別ファイルです。

**ワークスペース:** `C:\Users\chiak\AI_\Growly Sales`  
**更新日:** 2026-07-01  
**現在フォーカス:** **Phase 36.6 完了** — UI polish 一連完了。次は **Daily 30 本番運用チェック**

作業入口: [CLAUDE.md](./CLAUDE.md) · 履歴: [WORK_LOG.md](./WORK_LOG.md) · Daily 30: [docs/GROWLY_SALES_DAILY30_RUNBOOK.md](./docs/GROWLY_SALES_DAILY30_RUNBOOK.md)

---

## 最優先 — 明日 9:00 Daily 30 本番運用チェック

Cloud Scheduler による自動収集後、UI で以下を確認する（**自動送信・Lead自動承認はしない**）。

1. UI 起動: `npm run growly-sales:ui` → `http://localhost:3847`
2. **ダッシュボード** — 「メール取得済み X / 30」が更新されているか、営業サイクル7列がはみ出していないか
3. **候補収集タブ** — 今日の状態（メール取得済・Lead化承認待ち）→ 収集結果 → メール取得済候補リスト
4. **Lead化承認** — 問題なければ1件ずつ人間確認して承認
5. **営業文生成** — 承認済みがあれば `GENERATE_DAILY_30_COPY` ゲートで実行
6. **下書き候補取り込み** — `ready_for_draft` があれば取り込み → 下書き候補タブで確認
7. **Gmail** — 人間が手動送信（Growly Sales は送信しない）→ 送信記録
8. 異常時 — DevDetails「実行メタデータ」で batchId / errorCode（secret は画面に出ない）

### 確認済み UI 状態（2026-07-01 時点）

- GCS 実データ読み込み可（メール取得済 10/30、総収集 30）
- 1366×768 でダッシュボード・候補収集・Lead一覧2カラム表示 OK
- verify: 1552 passed / 23 failed（既存のみ）

---

## Phase 35〜36.6（完了）— UI polish

| Phase | 内容 | 状態 |
|-------|------|------|
| 35 | ダッシュボード1画面化 | **完了** |
| 36 | 候補収集 polish・バッジ統一 | **完了** |
| 36.5 | ダッシュボード視認性・密度 | **完了** |
| 36.6 | Lead一覧 詳細パネル修正 | **完了** |

### 任意の続き（UI）

- [ ] 下書き候補タブの表示 polish（必要なら軽微調整のみ）
- [ ] 返信管理・フォローアップタブの2カラム同様の調整（崩れがあれば）

---

## 継続運用（バックログ）

- [ ] Lead化承認待ち 43件の消化（候補収集・Lead一覧から人間承認）
- [ ] タカコウ・ハウス2件目 Gmail 下書き（`CREATE_DRAFTS`）
- [ ] 週次で `npm run growly-sales:verify` 実行

---

## 参考コマンド

```powershell
cd "C:\Users\chiak\AI_\Growly Sales"
npm run growly-sales:ui
npm run growly-sales:verify
npm run growly-sales:ui:build
npm run growly-sales:daily30-preview
# 手動ゲート（人間確認必須）
npm run growly-sales:daily30-fetch              # FETCH_DAILY_30
npm run growly-sales:daily30-generate-copy      # GENERATE_DAILY_30_COPY
npm run growly-sales:daily30-import-draft-candidates
npm run growly-sales:gmail-create-drafts        # CREATE_DRAFTS
```
