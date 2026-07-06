# Growly Sales — NEXT_TASKS

**更新日:** 2026-07-06  
**進行:** Phase 43 **4 / 4** 完了（43.1 `98abff3` / 43.2 `5ed05de` / 43.3 `51acf05` / 43.4 `fc1a686` pushed）

---

## Phase 43 — メール運用基盤強化

| サブフェーズ | 内容 | 状態 |
|-------------|------|------|
| 43.1 | 基準線・設計 | ✅ pushed `98abff3` |
| 43.2 | 配信停止 mock | ✅ pushed `5ed05de` |
| 43.3 | カスタムメールテンプレート mock | ✅ pushed `51acf05` |
| **43.4** | 開封計測 mock | ✅ pushed `fc1a686` |

**live 公開順:** ①配信停止 → ②カスタムメール → ③開封計測  
配信停止チェック live 完了まで、新メール生成・下書きへの自動適用は **live 化しない**。

### 43.4 完了（mock）

- [x] open tracking 型・store・aggregator・privacy
- [x] 手動送信記録時の mock tracking 作成（既存記録は不変）
- [x] `POST /api/mock/open-events`
- [x] SendRecords 開封バッジ / ダッシュボード参考開封率
- [ ] 人間承認後: `/t/{token}.gif`・下書き MIME への pixel・`MAIL_OPEN_TRACKING_ENABLED`

### Phase 43 live 化（人間承認後・別タスク）

- [ ] 公開 unsubscribe URL・Cloud Run・env
- [ ] テンプレート本番運用
- [ ] 開封 pixel・公開 tracking endpoint

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
