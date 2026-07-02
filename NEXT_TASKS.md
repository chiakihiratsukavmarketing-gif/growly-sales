# Growly Sales — NEXT_TASKS

**更新日:** 2026-07-02  
**進行:** 外部参照 Daily 30 本運用α 完了まで **10 / 11 フェーズ**  
**現在フォーカス:** **Phase 41.5** — 外部参照 Daily 30 本運用α 完了判定

---

## 最優先 — Phase 41.5

本番 Cloud Run 再デプロイ後、外部参照補完 state が記録されることを確認し、本運用α 完了判定を行う。

1. Cloud Run 再デプロイ（人間確認後）
2. 次回 9:00 自動実行 or 手動 FETCH で supplement フィールド確認
3. 手動 URL 候補 → 公式サイトメール確認 → Lead 化 → 下書き → 人間送信の 1 サイクル監査
4. Phase 41.5 完了チェックリスト（`GROWLY_SALES_EXTERNAL_REFERENCE_APPROVAL.md` §9）

**まだやらない:** 未承認サイトの実巡回 / Wantedly・Indeed 等の本格 crawl

---

## ~~Phase 41.4 Daily 30 補完ルート接続~~ ✅ 完了（2026-07-02）

- `daily30ExternalReferenceSupplement.ts` — execution plan 参照
- `fetchDaily30Candidates` / Cloud Run — supplement 接続
- state / dashboard / UI バナー
- `verifyPhase414Daily30ExternalReferenceSupplement`

**Cloud Run:** 再デプロイ必要（未実施）。Scheduler / Secret 変更不要。

---

## ~~Phase 41.3 許可済み外部参照 adapter 基盤~~ ✅ 完了（2026-07-02）

---

## ~~Phase 41.2.1 手動URL投入 UI 実動作確認~~ ✅ 完了（2026-07-02）

---

## 並行運用 — Gmail 手動送信7件

Growly Sales **からは送信しない**。Gmail 下書き7件を人間が確認して送信後、送信記録タブで記録。

---

## ロードマップ（残り）

| Phase | 内容 |
|-------|------|
| **41.5** | 本運用α 完了判定 |
