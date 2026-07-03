# Growly Sales — NEXT_TASKS

**更新日:** 2026-07-03  
**進行:** 外部参照 Daily 30 本運用α **18 / 18 フェーズ完了** ✅

---

## 本運用α完了

**Growly Sales 外部参照 Daily 30 本運用α** — 2026-07-03 Phase 41.5J で正式完了。

**次ゴールは人間確認待ち。** 勝手に次フェーズを開始しない。

---

## 今日の通常運用（人間作業）

1. UI: `http://localhost:3847` → 候補収集
2. 本日 batch（2026-07-03）Lead化レビュー **28件** を確認
3. Lead化承認 → 営業文生成 → 下書き取り込み（各ゲートは人間承認）
4. Gmail送信は Gmail 画面で手動のみ

**禁止:** 自動送信 / force=true / 再デプロイ / Scheduler・Secret変更

---

## 直近完了（参照）

| Phase | 内容 |
|-------|------|
| 41.5H-2 | compliance 23件 GCS永続化 |
| 41.5I | Cloud診断・ui:build修復 |
| 41.5J | 7/3自然実行supplement state・本運用α完了判定 |

---

## 未コミット

コード・docs・dist/ui に変更あり。**git commit は人間確認後。**

コミット候補のまとまり:
1. Phase 41.5G〜41.5J（判定・compliance・UI・verify）
2. docs / WORK_LOG / NEXT_TASKS
3. dist/ui（production build）
4. data/ verify 成果物・schedule backup（別コミットまたは除外を検討）

**.env / credentials はコミットしない。**

---

## 参照

- `docs/GROWLY_SALES_DAILY30_RUNBOOK.md`
- compliance バックアップ: `gs://growly-sales-daily30/prod/growly-sales/external-candidates.json.2026-07-02T14-41-36-919Z.bak`
