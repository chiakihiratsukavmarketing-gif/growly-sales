# Growly Sales — NEXT_TASKS

**更新日:** 2026-07-06  
**進行:** Phase 43 **3 / 4** 完了（43.1 `98abff3` / 43.2 `5ed05de` pushed）

---

## Phase 43 — メール運用基盤強化

| サブフェーズ | 内容 | 状態 |
|-------------|------|------|
| 43.1 | 基準線・設計 | ✅ pushed `98abff3` |
| 43.2 | 配信停止 mock | ✅ pushed `5ed05de` |
| **43.3** | カスタムメールテンプレート mock | ✅ 完了（未commit） |
| 43.4 | 開封計測 | 未着手 |

**live 公開順:** ①配信停止 → ②カスタムメール → ③開封計測  
配信停止チェック live 完了まで、新メール生成・下書きへの自動適用は **live 化しない**。

### 43.2 完了（mock）

- [x] suppression 型・mock store・チェックフック
- [x] 設定タブ「配信禁止リスト」
- [x] mock unsubscribe API
- [ ] 人間承認後: 公開 `/u/{token}`・env・Cloud Run

### 43.3 完了（mock）

- [x] テンプレート型・store・renderer
- [x] 設定UI（下書き・プレビュー・履歴・有効化ゲート）
- [x] 次回生成分から適用（既存 Lead 不変）

### 43.4 次タスク

- [ ] open event mock・SendRecords 開封バッジ
- [ ] ダッシュボード参考開封率
- [ ] 人間承認後: `/t/{token}.gif`・下書き MIME への pixel

---

## 通常営業運用（人間作業）

1. UI: `http://localhost:3847`
2. Daily 30: 候補収集 → Lead化承認 → 営業文 → 下書き → Gmail手動送信 → 送信記録
3. 各ゲート承認必須（`FETCH_DAILY_30` / `GENERATE_DAILY_30_COPY` / `IMPORT_*` / `CREATE_DRAFTS`）

**禁止:** 自動送信 / force=true / 無断デプロイ / Scheduler・Secret変更 / Phase 43 live 機能の本番適用

**WORK_LOG:** `## 通常営業運用` に日次件数を記録

---

## Phase 42 完了（参照）

通常運用UI横断改善 42.1〜42.20 完了。詳細は `WORK_LOG.md` 2026-07-03〜05 エントリ。

---

## 参照

- Phase 43 仕様: `docs/GROWLY_SALES_MAIL_OPERATIONS_UPGRADE.md`
- Daily 30 運用: `docs/GROWLY_SALES_DAILY30_RUNBOOK.md`
- 作業ログ: `WORK_LOG.md`（通常運用 / Phase 43 区分）
- 履歴フェーズ: Phase 18（`FETCH_CANDIDATES`）/ Phase 19（`CREATE_DRAFTS`）/ Phase 21（Daily 30 互換コマンド）

**commit / push:** Phase 43.1 は人間承認前のため未実施
