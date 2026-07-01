# Growly Sales — NEXT_TASKS

次回セッションで着手するタスク。  
**Growly SNS分析アプリ**（`OneDrive\ドキュメント\growly\NEXT_TASKS.md`）とは別ファイルです。

**ワークスペース:** `C:\Users\chiak\AI_\Growly Sales`  
**更新日:** 2026-07-01  
**現在フォーカス:** **Phase 37.1 完了 + Daily 30 実運用（下書き7件作成済）**

作業入口: [CLAUDE.md](./CLAUDE.md) · 履歴: [WORK_LOG.md](./WORK_LOG.md) · Daily 30: [docs/GROWLY_SALES_DAILY30_RUNBOOK.md](./docs/GROWLY_SALES_DAILY30_RUNBOOK.md)

---

## 最優先 — Gmail手動送信・送信記録（2026-07-01 Daily30分）

Growly Sales **からは送信しない**。Gmail 下書き7件を人間が確認して送信後、送信記録タブで記録する。

### 送信前チェック（各件）

- [ ] From = `c_hiratsuka@wantreach.jp`
- [ ] Reply-To = `c_hiratsuka@wantreach.jp`
- [ ] 宛先が会社代表メール
- [ ] 本文にフォームURL・確認元URLが混入していない
- [ ] 機械的な文章になっていない

### 送信記録（送信したものだけ）

- channel: `manual_gmail`
- batchId: `2026-07-01`
- source: `daily30`
- draftId を WORK_LOG の一覧と照合

### 対象7社

1. 住まいの足軽隊 〜住宅リフォーム店〜
2. オークヴィルホームズ
3. 桂住宅建設株式会社
4. 株式会社AS IT IS
5. 有限会社 水戸工務店
6. MIRAIE株式会社
7. (株)テクノホーム

---

## 明日 9:00 — Phase 37 本番反映確認

Cloud Scheduler 実行後:

1. GCS state: `partial_success`（未達時）/ `stoppedReason` 記録 / formOnly・noEmail 実数
2. totalCollected が 30 で止まらないか（120上限まで探索）
3. 群馬県までエリア拡大するか
4. UI「収集時メール取得 X/30」と「Lead化承認待ち」が分離表示されるか

コマンド: `npm run growly-sales:phase-c-cloud-status`

---

## 本日未処理リード（継続）

| 会社名 | 理由 | 次アクション |
|--------|------|--------------|
| ㈱徳田工務店 | 既存Lead重複 | スキップ（既存Leadでフォロー） |
| Banana works LABO | info@xxx.com プレースホルダ | メール再調査または除外 |

---

## 返信・フォロー（既存）

- [ ] 返信管理タブ — 返信待ち13件の確認
- [ ] フォローアップ対象の確認

---

## 参考コマンド

```powershell
cd "C:\Users\chiak\AI_\Growly Sales"
npm run growly-sales:ui
npm run growly-sales:phase-c-cloud-status
npm run growly-sales:daily30-preview
```

---

## バックログ

- [ ] Lead一覧 棚卸し承認待ちの消化
- [ ] Phase 38: 候補カード重複ヒント強化（必要なら）
- [ ] 週次 `npm run growly-sales:verify`
