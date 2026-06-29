# Growly Sales 10社パイロット運用チェックリスト

**Phase 15.5〜15.7** — 各項目をパイロット運用中に確認し、✅ / ❌ を記録してください。

**実施日**: 2026-06-25  
**Lead数**: 6社（10社以内）

---

## データ準備

- [x] `input-sites.csv` に **10社以下** で入力している（6社）
- [x] CSVが **UTF-8** で保存されている
- [x] 文字化けがない（会社名・地域・業種が正しく表示される）
- [x] 実在企業の公式サイトURLを使用している（`example.com` のみではない）

## パイプライン実行

- [x] `npm run growly-sales:day1` が成功している
- [x] `npm run growly-sales:generate` が成功している
- [x] `npm run growly-sales:verify` が通っている（0 failed — **292 passed**）
- [x] `npm run growly-sales:mvp-check` で ready=true

## UI表示

- [x] UIにLeadが表示されている（6件）
- [x] ヘッダーに「ローカル手動MVP / パイロット運用」が表示されている
- [x] 外部API：未使用 / Gmail：未使用 / 自動送信：なし が表示されている

## Lead品質（各社）

- [x] 各Leadの **問い合わせURL** が正しい
- [x] **Instagram URL** が正しい（他SNSでない）
- [x] **施工事例URL** が正しい（または未取得で妥当）
- [x] **企業分析文** が自然
- [x] **個別フック** が自然（**6社すべて異なる** — Phase 15.7）
- [x] **メール件名** が自然
- [x] **メール本文** に禁止表現がない
- [x] `reviewStatus` が approve / revise / reject に妥当に分類されている（全社 approve）

## 承認・下書き（Phase 15.6）

- [x] 人間承認なしのLeadが **下書き候補に出ていない**
- [x] 承認後、下書き候補タブで件名・本文をコピーできる（workflow検証済み）
- [x] **コピーしても sendStatus が not_sent のまま**
- [x] UIに「コピーしても送信済みにはなりません」注意文がある

## 手動送信・返信記録

- [x] 手動送信済みにすると `manual_sent` になる
- [x] 返信ステータスが更新できた（菅原工務店 replyStatus=replied 保持）
- [x] フォロー予定日・商談ステータスが更新できた（dealStatus=open 保持）
- [x] generate 再実行後も手動送信・返信・商談記録が保持される

## 分析・サマリー

- [x] **営業分析**タブに集計が反映されている（manualSentLeads=2）
- [x] **パイロット用サマリー**が表示されている
- [x] **運用サマリー**が表示されている
- [x] 改善提案が運用実態と大きく矛盾しない

## 安全・セキュリティ

- [x] 自動送信コードが存在しない（verifyで確認）
- [x] Gmail送信コードが存在しない（verifyで確認）
- [x] API本番接続が disabled（verifyで確認）
- [x] パイロット中に外部APIを有効化していない

---

## パイロット結果メモ

| 項目 | 記録 |
|------|------|
| 実施日 | 2026-06-25 |
| Lead数 | 6 |
| 承認数（humanReviewStatus） | 2（UI表示用：森のめぐみ工房・佐元工務店） |
| 校閲 approve 数 | 6 |
| 手動送信数 | 2（菅原・アオバクラフト） |
| 返信記録数 | 1（菅原） |
| customHook | 6社すべて異なる（Phase 15.7） |
| 主な課題 | generate再実行で humanReviewStatus が pending に戻る（意図的な安全設計） |
| 外部連携へ進むか | **要検討**（Phase 16 着手前に人間判断） |

---

## 参照

- 手順書: `docs/GROWLY_SALES_PILOT_RUNBOOK.md`
- 安全ルール: `docs/GROWLY_SALES_SAFETY_RULES.md`
- 完了後: `docs/GROWLY_SALES_PROJECT_STATE.md` を更新
