# Growly Sales — NEXT_TASKS

**更新日:** 2026-07-06  
**進行:** 通常運用UI改善 **7 / 7 完了** ✅ | Phase 43 **1 / 4** 完了

---

## Phase 43 — メール運用基盤強化

**仕様正本:** `docs/GROWLY_SALES_MAIL_OPERATIONS_UPGRADE.md`

| サブフェーズ | 内容 | 状態 |
|-------------|------|------|
| **43.1** | 基準線・データ構造・安全要件 | ✅ 完了 |
| 43.2 | 配信停止リンク・配信禁止企業管理 | 未着手 |
| 43.3 | 営業メールのカスタムテンプレート | 未着手 |
| 43.4 | 開封計測・開封率表示 | 未着手 |

**live 公開順:** ①配信停止 → ②カスタムメール → ③開封計測  
配信停止チェック live 完了まで、新メール生成・下書きへの自動適用は **live 化しない**。

### 43.2 次タスク（設計済み・実装待ち）

- [ ] `mail-suppressions.json` 型・store（mock / `_verify_` のみ）
- [ ] `assertNotSuppressed` を営業文・下書き・フォローアップ入口に挿入
- [ ] 設定タブ「配信禁止リスト」UI mock
- [ ] unsubscribe mock endpoint（ローカル API のみ）
- [ ] 人間承認後: 公開 `/u/{token}`・env・Cloud Run

### 43.3 次タスク

- [ ] `outreach-templates.json` + デフォルトを `generateSalesEmail` から移植
- [ ] 設定タブ「営業メールテンプレート」UI
- [ ] 次回生成から適用（既存 Lead 本文不変）

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
