# Growly Sales — NEXT_TASKS

次回セッションで着手するタスク。  
**Growly SNS分析アプリ**（`OneDrive\ドキュメント\growly\NEXT_TASKS.md`）とは別ファイルです。

**ワークスペース:** `C:\Users\chiak\AI_\Growly Sales`  
**更新日:** 2026-07-01  
**現在フォーカス:** **Phase 40.6** 外部掲載サイト参考ルート（40.5 完了・Cloud Run 再デプロイ待ち）

---

## 最優先 — Cloud Run 再デプロイ（Phase 40.5 反映）

Phase 40.5 コード完了。本番 Cloud Scheduler 9:00 実行に反映するには:

1. Cloud Run 再デプロイ
2. 翌朝 `npm run growly-sales:phase-c-cloud-status` で scheduleSource / areasUsed 確認
3. UI 候補収集タブで「今回使用した収集設定」を確認

**まだやらない:** 求人サイト自動巡回（40.6）

---

## ~~Phase 40.5 Cloud Run schedule 実行反映~~ ✅ 完了（2026-07-01）

- oneDayOverride / nextProfileOverride 消費
- areaStrategy エリアキュー
- areasUsed / scheduleSource を state に記録
- dryRun は schedule プレビューのみ

---

## ~~Phase 40.4 Lead一覧・候補一覧 収集プロファイル表示 / フィルター~~ ✅ 完了（2026-07-01）

- Lead一覧: 収集元 / 求人サイト / エリア / エリア戦略 / 収集プロファイル / メール確認
- Lead詳細「収集情報」、候補カード、下書き候補、送信記録
- `discoverySourceUrl` と `emailSourceUrl` 分離表示
- 既存 Lead 後方互換

---

## ~~Phase 40.3 明日の収集設定 UI~~ ✅ 完了（2026-07-01）

- 候補収集タブ「明日の収集設定」
- `GET/POST /api/daily30-collection-schedule`
- oneDayOverride / nextProfileOverride / reset_to_auto

---

## ~~再起動後 — 最優先（Phase 38.4 実画面確認）~~ ✅ 完了（2026-07-01）

**結果:** 徳田工務店除外が GCS に永続化。再読み込み後も Lead化承認待ちに戻らない。除外済み1件表示。詳細は [WORK_LOG.md](./WORK_LOG.md) Phase 38.4 実画面確認セクション。

**残作業（任意）:** UIサーバー再起動で `humanExcludedCount` 集計修正を反映（`buildDaily30CloudDashboard` の `allCandidates` 対応）。

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
- [x] Phase 38.1〜38.4 候補除外・永続化（コード完了・実画面確認は再起動後）
- [ ] 週次 `npm run growly-sales:verify`
