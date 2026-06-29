# Growly Sales 実装計画

## Day 1（2026-06-25）— ✅ 完了

Phase 1 / 2 / 3-lite: 設計・Lead型・JSON/CSV・サイト解析土台・verify

## Day 1.5 — ✅ 完了

CSV UTF-8 / 文字化け検出 / needs_review

## Day 2前半（2026-06-25）— ✅ 完了

### Phase 3強化: 公式サイト解析精度改善

- 相対URL → 絶対URL正規化、末尾 `/` 除去
- mailto: 抽出強化
- 日本語リンク文言拡充（資料請求・来場予約・施工事例 等）
- Instagram プロフィールURL正規化（投稿URL除外）
- script/hidden メール → needs_review
- sourceUrls に発見URLを集約

### Phase 4準備: 設定・adapter雛形

- `targetProfile` / `offerProfile` TypeScript ローダー
- `housing.json` / `sns-operation.json`
- `placesAdapter` / `webSearchAdapter` / `env.ts`
- **API本番接続なし**（API_PRODUCTION_ENABLED=false）

---

## Day 3（2026-06-25）— ✅ 完了（Phase 5〜9）

### 方針変更

- **Google Places / Web検索 API は最後に延期**
- 手動 `input-sites.csv` → day1 → **generate** で完成形に近づける

### Phase 5〜9: 営業生成ループ（ルールベース・OpenAIなし）

- `scoreLead` / `generateSalesAngle` 強化
- `generateCompanyAnalysis.ts` — 企業分析文
- `generateCustomHook.ts` — 個別フック
- `generateSalesEmail.ts` — 件名・本文
- `reviewSalesEmail.ts` — approve/revise/reject
- `run-growly-sales-generate.ts` — `npm run growly-sales:generate`
- verify 104項目

### 次（API接続より先）

- ~~人間承認UI~~ ✅ Phase 10 完了
- Gmail下書き（送信なし）
- 返信分類

### 最後に実施

- Google Places / Web検索 API 本番接続

---

## ~~Day 2後半〜Day 3（予定）— Phase 3本番~~ → 延期

### Google Places API接続（人間承認後）

- `API_PRODUCTION_ENABLED=true` に切替
- searchPlaces 実装
- input-sites.csv 半自動生成（人間レビュー必須）

### Web検索API接続（人間承認後）

- searchWeb 実装
- 公式サイトURL特定の補助

**必要な準備**: `.env` に GOOGLE_PLACES_API_KEY / WEB_SEARCH_API_KEY

---

## Day 4（2026-06-25）— ✅ 完了（Phase 10）

### Phase 10: 人間承認UI / 営業リスト編集画面

- `ui/` — React ダッシュボード（一覧・詳細・承認アクション・メール編集）
- `workflow/updateLeadReview.ts` — 承認・却下・連絡禁止・メール編集
- `server/uiServer.ts` — ローカルHTTP API + 静的ファイル配信（Node標準のみ）
- `npm run growly-sales:ui` — UI起動
- verify 129項目

### 重要

- 承認しても `sendStatus` は `not_sent` のまま
- Gmail下書き作成は **Phase 16 で実装済み**（送信なし）。自動送信は未実装
- API本番接続は disabled のまま

---

## Day 5（2026-06-25）— ✅ 完了（Phase 11A）

### Phase 11A: Gmailなし下書きエクスポート

- `selectDraftCandidates` — 承認済みLead抽出・除外理由
- `exportDraftCandidates` — JSON / CSV / draft-copy.txt
- `npm run growly-sales:export-drafts`
- UI下書き統計パネル
- verify 156項目

### 次

- ~~Phase 11A-2: 下書き候補UI・コピー~~ ✅ 完了
- ~~Phase 11B: Gmail下書き（外部連携・将来）~~ → **Phase 16 で完了**
- API接続は最後

---

## Day 5後半（2026-06-25）— ✅ 完了（Phase 11A-2）

### Phase 11A-2: 下書き候補UI表示・コピー機能

- タブ切り替え（営業リスト / 下書き候補）
- CopyButton（件名・本文・まとめて・問い合わせURL）
- `GET /api/draft-candidates` / `POST /api/export-drafts`
- verify 180項目

---

## Day 6（2026-06-25）— ✅ 完了（Phase 12-lite）

### Phase 12-lite: 手動送信・返信ステータス管理（記録のみ）

- `workflow/updateLeadCommunication.ts` — 手動送信・返信・フォロー・商談ステータス更新
- uiServer API 追加（ローカルJSON更新のみ）
- Lead詳細パネルに「手動送信・返信ステータス管理」セクション追加
- 一覧に `replyStatus` / `dealStatus` / `followUpDate` 表示追加
- verify 強化（手動送信制約・返信/商談更新）

重要:

- **自動送信なし**
- **Gmail APIなし**
- 「手動送信済み」は**記録のみ**

---

## Day 7（2026-06-25）— ✅ 完了（Phase 13-lite / 14-lite / 15）

### Phase 13-lite: 営業結果の手動分析（ローカルJSON集計）

- `analytics/buildSalesAnalytics.ts` — 基本集計 / 率 / breakdown / followUp / nextAction
- uiServer: `GET /api/sales-analytics`
- UI: 「営業分析」タブ追加

### Phase 14-lite: 運用サマリー / 改善提案（ルールベース）

- `analytics/buildOperationSummary.ts` — ルールベース summary（AI APIなし）
- uiServer: `GET /api/operation-summary`
- UI: 運用サマリーパネル追加

### Phase 15: ローカル手動運用版MVP完成チェック

- `mvp/checkLocalMvpReadiness.ts` — readiness 判定
- CLI: `npm run growly-sales:mvp-check`
- uiServer: `GET /api/mvp-readiness`
- UI: MVP ready/not ready 表示

---

## Day 8（2026-06-25）— ✅ 完了（Phase 15.5）

### Phase 15.5: 10社パイロット運用テスト準備

- `docs/GROWLY_SALES_PILOT_RUNBOOK.md` — 運用手順書
- `docs/GROWLY_SALES_PILOT_CHECKLIST.md` — チェックリスト
- `analytics/buildPilotSummary.ts` — パイロット用サマリー
- UI: `PilotModeBanner` / `PilotSummaryPanel`
- uiServer: `GET /api/pilot-summary`
- verify 強化

重要:

- **10社以下推奨**（超過してもエラーにしない）
- **自動送信なし / Gmail APIなし / 外部APIなし**
- パイロット完了後に外部連携へ進むか**人間判断**

---

## 2026-06-25 — パス解決修正（UI leads.json 読み込み）

### 発生した問題

- `data/growly-sales` から UI を起動すると、リード一覧が空・下書き統計エラー
- `loadLeadsFromJson` が ENOENT 時に空配列を返し、エラーが見えにくかった

### 修正内容

- `config/paths.ts` — package.json 探索でプロジェクトルートを cwd 非依存で解決
- `loadLeadsForApi.ts` — leads.json 未存在時は API エラー（パス付き）
- uiServer 起動ログに Project root / Leads path / Drafts path / CWD を出力
- UI API エラーに api 名・パスを表示
- verify 194項目（cwd 変更テスト含む）

### 結果

| 項目 | 結果 |
|------|------|
| growly-sales:verify | ✅ 194/194 passed |
| npm audit | ✅ critical=0, high=0 |

### 正しい起動手順

```bash
cd "C:\Users\chiak\AI_\Growly Sales"
npm run growly-sales:ui
```

---

## Day 4-5（予定）— Phase 4

- OpenAI API 営業文生成
- prohibitedClaims フィルター連携

## Phase 16（2026-06-25）— ✅ 完了（Gmail下書き作成）

- `integrations/gmail/` — adapter（drafts.create のみ）
- `growly-sales:gmail-preview` / `growly-sales:gmail-create-drafts`
- Lead型: `gmailDraftStatus` 等
- verify 326項目
- **追加npmパッケージなし**（native fetch + OAuth）

## Phase 17（2026-06-25）— ✅ 完了（外部API候補取得）

- Places / Web Search adapter（ゲート付き）
- external-preview / external-fetch / external-import-approved
- external-candidates.json / .csv
- UI「営業候補」+ 連絡導線分析
- Google Maps画面スクレイピング禁止

## Day 6+（予定）

- 外部候補実運用テスト / OpenAI / Supabase

---

## 技術スタック

| 項目 | Day 2前半 | 次Phase |
|------|-----------|---------|
| 設定 | JSON profiles | 同左 + env |
| API | adapter（ゲート付き） | Places / Web Search 候補取得のみ |
| 収集 | 手動URL + HTML解析 + 外部候補（人間確認後） | 実運用テスト |

## 依存パッケージ方針

- ランタイム外部依存なし（Node 18+ fetch）
- devDependencies: typescript, tsx, @types/node のみ
