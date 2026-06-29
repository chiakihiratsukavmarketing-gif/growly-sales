# Growly Sales 実行ログ

## 2026-06-26 — Phase 19: Gmail OAuth helper

### 作業内容

- `run-growly-sales-gmail-oauth-helper.ts` 追加
- `npm run growly-sales:gmail-oauth-helper` 追加
- scope: `https://www.googleapis.com/auth/gmail.compose`
- redirect_uri: `http://localhost`（Desktop App）
- verify に helper 安全チェック追加

### ルール

- helper は **refresh token 取得補助のみ**
- Gmail送信・下書き作成・自動送信なし
- `.env` 自動編集なし / token ファイル保存なし
- secret 類は git にコミットしない

### 実施しなかったこと

- Gmail下書き実作成（`gmail-create-drafts`）
- Gmail送信
- `.env` 編集

---

## 2026-06-25 — Day 1

### 作業内容

- Growly Sales プロジェクト新規作成
- Phase 1: 設計ドキュメント9ファイル作成
- Phase 2: Lead型、JSON/CSV Repository、重複排除
- Phase 3-lite: 公式サイト解析コレクター、安全フィルター、スコアリング
- 手動入力スクリプト（run-growly-sales-day1）
- verifyスクリプト（verify-growly-sales）
- package.json スクリプト追加

### 実行コマンド

```bash
npm install
npm run growly-sales:verify
npm run growly-sales:day1
npm audit
```

### 結果

| 項目 | 結果 |
|------|------|
| npm install | ✅ 成功（6 packages） |
| growly-sales:verify | ✅ 33/33 passed |
| growly-sales:day1 | ✅ 1件処理、1件追加 |
| npm audit | ✅ 0 vulnerabilities |

### 生成Leadサンプル

- サンプル工務店（example.com）: leadScore=C, collectionStatus=collected, riskLevel=medium
- 問い合わせ先なし → 安全ルール通過、人間レビュー待ち

### 課題・メモ

- 単一ページHTML解析のみ。サブページクロールはPhase 3以降
- サンプルinput-sites.csvはローカルテスト用（実URLは人間が入力）
- ネットワークアクセスはday1実行時のみ（verifyはオフライン）

### 次回（Day 2）

- Phase 3: Google Places API連携検討
- input-sites.csv自動生成の設計

---

## 2026-06-25 — CSV文字コード対応

### 作業内容

- `input-sites.csv` を UTF-8 前提で読み込み（BOM除去）
- 文字化け文字 `` 検出時に警告 + `collectionStatus: needs_review`
- verify で `companyName` / `area` / `industry` の文字化けを failed 判定
- README に「CSVはUTF-8で保存」を明記

### 結果

| 項目 | 結果 |
|------|------|
| UTF-8 input-sites.csv | ✅ 日本語正しく読み込み（サンプル工務店） |
| 文字化けCSV | ✅ verify が failed（2件） |
| BOM除去 | ✅ verify 通過 |
| growly-sales:verify | ✅ 40/40 passed（正常CSV時） |

---

## 2026-06-25 — Day 2前半

### 作業内容

- Phase 3強化: 公式サイト解析精度改善（URL正規化・mailto・日本語リンク・Instagram）
- Phase 4準備: targetProfile / offerProfile / API adapter 雛形
- verify 強化（85項目）
- README: example.com はテスト用、実URLは人間入力と明記

### 結果

| 項目 | 結果 |
|------|------|
| growly-sales:verify | ✅ 85/85 passed |
| growly-sales:day1 | ✅ 動作確認（サンプル工務店 / example.com） |
| npm audit | ✅ critical=0, high=0 |
| API本番接続 | ❌ 意図的に disabled |

### 人間確認事項

- 実在企業URLは `input-sites.csv` に人間が UTF-8 で入力すること
- `example.com` はパイプライン検証用のみ
- 次Phaseで API 接続する前に `.env` 設定を人間が承認

### 次回（Day 2後半〜）

- Phase 3本番: Google Places / Web検索 API 接続（人間承認後）

---

## 2026-06-25 — Day 2後半（誤検出修正）

### 発見した誤検出

| 会社 | フィールド | 誤り | 原因 |
|------|-----------|------|------|
| 一建設 | companyProfileUrl | facebook.com/profile.php | `profile` キーワード誤マッチ |
| 菅原工務店 | contactFormUrl | /reform | サービスページを問い合わせと誤判定 |

### 修正内容

- `urlClassification.ts` — SNS除外・問い合わせパス厳格化
- `findCompanyProfileLinks.ts` — 同一ドメイン＋スコアリング、SNS除外
- `findContactFormLinks.ts` — 除外パス（/reform等）・強い問い合わせパスのみ採用
- verify に URL品質チェック追加

### 結果

| 項目 | 結果 |
|------|------|
| 実URL3社 再実行 | ✅ |
| growly-sales:verify | ✅ 93/93 passed |
| npm audit | ✅ critical=0, high=0 |

---

## 2026-06-25 — Phase 5〜9（営業生成ループ）

### 方針変更

- Google Places / Web検索 API は**最後に延期**
- 手動 input-sites.csv → day1 → generate で完成形に近づける

### 実装

- `generation/` — 企業分析・フック・メール・統合パイプライン
- `review/reviewSalesEmail.ts` — 校閲
- `npm run growly-sales:generate`

### 結果

| 項目 | 結果 |
|------|------|
| generate（実URL3社） | Approved: 3 / Rejected: 0 |
| verify | ✅ 104/104 passed |
| sendStatus | 全件 not_sent |
| humanReviewStatus | 全件 pending |

---

## 2026-06-25 — Phase 10（人間承認UI）

### 作業内容

- React 営業リストダッシュボード（一覧・詳細・承認アクション・メール編集）
- `workflow/updateLeadReview.ts` — 承認・却下・連絡禁止・メール編集
- `server/uiServer.ts` — ローカルHTTP API（Node標準のみ）
- Lead型拡張: humanReviewStatus に `needs_revision`, sendStatus に `blocked`
- verify 強化（129項目）

### 実行コマンド

```bash
npm install
npm run growly-sales:verify
npm run growly-sales:ui:build
npm audit
```

### 結果

| 項目 | 結果 |
|------|------|
| growly-sales:verify | ✅ 129/129 passed |
| growly-sales:ui:build | ✅ ビルド成功 |
| npm audit | ✅ critical=0, high=0 |
| Gmail送信コード | ❌ 存在しない（意図通り） |
| 自動送信 | ❌ 未実装（意図通り） |
| API本番接続 | ❌ disabled のまま |

### 重要ルール

- 承認しても `sendStatus` は `not_sent` のまま
- `humanReviewStatus=approved` は下書き候補であり送信許可ではない
- Gmail下書き作成は未実装

### 次回

- ~~Phase 11: Gmail下書き作成（送信なし）~~ → Phase 11A 完了（Gmailなしエクスポート）
- Phase 11B: Gmail下書き作成（将来・外部連携）
- API接続は最後

---

## 2026-06-25 — Phase 11A（Gmailなし下書きエクスポート）

### 作業内容

- `drafts/selectDraftCandidates.ts` — 承認済みLeadの抽出・除外理由
- `drafts/exportDraftCandidates.ts` — JSON / CSV / コピー用テキスト出力
- `npm run growly-sales:export-drafts`
- UIに下書き統計パネル追加
- verify 強化（156項目）

### 実行コマンド

```bash
npm run growly-sales:verify
npm run growly-sales:export-drafts
npm audit
```

### 結果

| 項目 | 結果 |
|------|------|
| growly-sales:verify | ✅ 156/156 passed |
| export-drafts（実URL3社） | Candidates: 0（全件 pending のため意図通り） |
| npm audit | ✅ critical=0, high=0 |
| sendStatus | export後も not_sent のまま |
| Gmail API | ❌ 未接続（意図通り） |

### 重要ルール

- approved Lead のみエクスポート候補
- export しても sendStatus は変更しない
- Gmail下書きは将来フェーズに延期

---

## 2026-06-25 — Phase 11A-2（下書き候補UI・コピー機能）

### 作業内容

- `DraftCandidatesView` / `DraftCandidateCard` / `CopyButton`
- ダッシュボードに「営業リスト」「下書き候補」タブ
- `GET /api/draft-candidates` / `POST /api/export-drafts`
- verify 180項目

### 結果

| 項目 | 結果 |
|------|------|
| growly-sales:verify | ✅ 180/180 passed |
| growly-sales:ui:build | ✅ ビルド成功 |
| npm audit | ✅ critical=0, high=0 |
| コピー | sendStatus 不変 |
| Gmail API | ❌ 未接続（意図通り） |

### 次回

- Phase 11B: Gmail下書き（将来・外部連携）
- API接続は最後

---

## 2026-06-25 — パス解決修正（UI leads.json 読み込み）

### 発生した問題

- PowerShell の cwd が `data/growly-sales` のまま UI 起動
- リード一覧が空、「下書き統計の取得に失敗」
- `loadLeadsFromJson` がファイル未存在時に空配列を返していた

### 修正

- `config/paths.ts` — package.json 探索で cwd 非依存のパス解決
- `loadLeadsForApi.ts` — 未存在時はパス付き API エラー
- UI エラーに API 名・読み込みパスを表示
- 起動ログに Project root / Leads path / Drafts path を出力

### 結果

| 項目 | 結果 |
|------|------|
| verify | ✅ 194/194 passed |
| cwd=data/growly-sales でもパス解決 | ✅ verify で確認 |

### 起動手順

```bash
cd "C:\Users\chiak\AI_\Growly Sales"
npm run growly-sales:ui
```

---

## 2026-06-25 — Phase 13-lite〜15（ローカル手動運用版MVP完成パック）

### 作業内容

- Phase 13-lite: 営業結果の手動分析（ローカルJSON集計）を追加
  - `GET /api/sales-analytics`
  - UI「営業分析」タブ（サマリーカード / breakdown / フォロー / 次アクション）
- Phase 14-lite: 運用サマリー / 改善提案（ルールベース、AI APIなし）を追加
  - `GET /api/operation-summary`
- Phase 15: MVP完成チェック（ready / nextSteps）を追加
  - `npm run growly-sales:mvp-check`
  - `GET /api/mvp-readiness`

### 注意

- Gmail / OpenAI / 外部API / 自動送信は一切使用していません
- 分析・提案は `leads.json` の手動記録のみを対象にします

---

## 2026-06-25 — Phase 15.5（10社パイロット運用テスト準備）

### 作業内容

- `docs/GROWLY_SALES_PILOT_RUNBOOK.md` — パイロット運用手順書
- `docs/GROWLY_SALES_PILOT_CHECKLIST.md` — 確認チェックリスト
- UIヘッダーにパイロット運用モード表示（外部API/Gmail未使用/自動送信なし）
- 営業分析タブにパイロット用サマリー（`GET /api/pilot-summary`）
- verify 強化

### 注意

- パイロット推奨は **10社以下**（超過してもエラーにならない）
- Gmail / 外部API / 自動送信は使用しない
- パイロット完了後に外部連携へ進むか人間が判断

---

## 2026-06-25 — UI Polish 1（見た目調整）

### 作業内容

- `styles.css` を白ベース＋ティール系デザインシステムに刷新
- 共通UI: `SummaryStatCard` / `SectionCard` / `InfoBanner`
- ヘッダー・タブ・サマリーカード・テーブル・バッジ・詳細パネル・営業分析画面を整理
- 機能ロジック・API仕様は変更なし

### 注意

- パイロット運用（Phase 15.5）に支障がないよう、見た目調整のみ実施

---

## 2026-06-25 — UI APIルート不一致修正（/api/draft-stats 404）

### 発生した問題

- UIが `GET /api/draft-stats` を呼ぶが、サーバー側で 404 になるケースが発生
- その結果「Not found — API: GET /api/draft-stats」と表示

### 修正

- uiServer に `GET /api/draft-stats` を維持（互換性）
- `excludedCount` / `generatedAt` を追加し、`selectDraftCandidates` と整合
- verify に `draft-stats` ルート存在と一致検証を追加

### 結果

| 項目 | 結果 |
|------|------|
| growly-sales:verify | ✅ pass |
| npm audit | ✅ critical=0, high=0 |

### 対応方法（ユーザー向け）

- 既にUIサーバーを起動している場合は、**一度停止して再起動**してください（古いサーバーが残っていると404が継続します）

---

## 2026-06-25 — Phase 12-lite（手動送信・返信ステータス管理）

### 作業内容

- `sendStatus=manual_sent`（手動送信の記録のみ）
- `replyStatus` / `dealStatus` / `followUpDate` をUIから更新
- uiServer API: `manual-sent` / `reply-status` / `follow-up` / `deal-status` / `communication-memo`
- verify 強化（手動送信制約・返信/商談更新）

### 注意

- これは**記録のみ**であり、メール送信は行わない
- Gmail API / 自動送信は未実装・禁止

---

## 2026-06-25 — Phase 15.5（10社パイロット運用テスト — 実施）

### 入力データ

- `input-sites.csv`: **6社**（宮城県工務店、UTF-8、文字化けなし）
  - 森のめぐみ工房 / 一建設 / 株式会社　菅原工務店 / アオバクラフト / 佐元工務店 / タカコウ・ハウス

### 実行コマンド

```bash
npm run growly-sales:day1
npm run growly-sales:generate
npm run growly-sales:verify
npm run growly-sales:mvp-check
npm run growly-sales:ui:build
npm audit --json
```

### 結果

| 項目 | 結果 |
|------|------|
| day1 | ✅ 6件処理、重複スキップ6、失敗0 |
| generate | ✅ 6件生成、approve 6、reject 0 |
| verify | ✅ **256/256 passed** |
| mvp-check | ✅ **ready=true** |
| ui:build | ✅ 成功 |
| npm audit | ✅ critical=0, high=0 |
| UI API | ✅ `/api/leads` `/api/pilot-summary` `/api/draft-candidates` `/api/sales-analytics` `/api/operation-summary` `/api/mvp-readiness` すべて 200 |

### Lead品質（自動確認）

| 確認項目 | 結果 |
|---------|------|
| contactFormUrl | ✅ 全社 `/contact` または `/request` 系 |
| emailCandidates | ✅ 全社空（フォーム問い合わせのみ、個人メールなし） |
| Instagram | ✅ 全社公式プロフィールURL |
| 施工事例URL | ✅ 全社取得 |
| 会社概要URL | ✅ 5/6取得（一建設のみ null — サイト構造上妥当） |
| sourceUrls | ✅ 全社非空 |
| reviewStatus | ✅ 全社 approve |
| leadScore | ✅ 全社 A |
| 禁止表現 | ✅ verify通過、校閲コメントで確認 |

### 修正した問題

1. **`dirname is not defined`** — `run-growly-sales-day1.ts` / `run-growly-sales-generate.ts` の `node:path` import に `dirname` を追加
2. **generate再実行で手動送信記録が消える** — `applyFullGeneration.ts` に `preserveWorkflowState` を追加（`manualSentAt` / 返信 / 商談記録を保持、`humanReviewStatus` は再生成時に pending へリセット）
3. **sendStatus と manualSentAt の不整合** — `jsonLeadRepository.ts` で `manualSentAt` がある場合は `manual_sent` を推論

### 軽微な所見（未修正・許容）

- `customHook` が6社で同一テンプレート文（将来の生成改善候補）
- `generate` 再実行時は `humanReviewStatus` が pending に戻る（意図的な安全設計）
- UIサーバー再起動: ポート3847が既に使用中の場合は停止後に `npm run growly-sales:ui` を再起動

### 人間確認が必要な残タスク

- generate後の **humanReviewStatus 承認** → 下書き候補タブでのコピー確認（APIロジックは verify で検証済み）
- 外部連携（Gmail / Places API）へ進むかの判断

### 次のPhase

- **Phase 16**: Gmail下書き（人間判断後・外部連携）

---

## 2026-06-25 — Phase 15.6 / 15.7（承認フロー確認・customHook個別化）

### Phase 15.6 — 承認〜コピー実操作確認

- 下書き候補条件の再確認（verify 292 passed）
- コピー操作は sendStatus / 手動送信記録を変更しないことを UI・コードで確認
- `DraftCandidatesView` に注意文追加：「コピーしても送信済みにはなりません…」
- `run-growly-sales-pilot-flow-check.ts` で実操作フロー検証
  - 3社承認 → 下書き候補3件
  - コピー対象は sendStatus=not_sent のまま
  - 1社手動送信済み → manual_sent、下書き候補から除外
  - 営業分析 manualSentLeads=2（菅原・アオバクラフト）
  - generate 再実行後も菅原の手動送信・返信・商談記録を保持

### Phase 15.7 — customHook個別化改善

- `generateCustomHook.ts` を優先度ベースの個別フック生成に刷新
- Lead型に `hookSourceType` / `hookSourceUrl` / `customHookReason` を追加
- 6社すべて異なる customHook を生成（verifyで自動検証）
- メール本文にも会社ごとの個別フックを反映

### customHook改善例

| 会社 | フック概要 |
|------|-----------|
| 森のめぐみ工房 | 施工事例＋採用情報 |
| 一建設 | カスタムハウス施工事例 |
| 菅原工務店 | 施工事例＋会社概要（大崎市） |
| アオバクラフト | 施工事例＋会社概要 |
| 佐元工務店 | 個別施工事例詳細ページ |
| タカコウ・ハウス | 施工事例＋採用（石巻市） |

### 結果

| 項目 | 結果 |
|------|------|
| verify | ✅ **292/292 passed** |
| mvp-check | ✅ ready=true |
| ui:build | ✅ 成功 |
| npm audit | ✅ critical=0, high=0 |

### Phase 16 前の最終安全確認

- Gmail送信コードなし / 自動送信コードなし / API本番 disabled
- コピーは送信記録ではない
- generate 再実行で手動記録を保持

---

## 2026-06-25 — Phase 16（Gmail下書き作成 — 送信なし）

### 作業内容

- `integrations/gmail/` — Gmail adapter（`users.drafts.create` のみ）
- `npm run growly-sales:gmail-preview` — dry-run（外部通信なし）
- `npm run growly-sales:gmail-create-drafts` — 実作成（`CREATE_DRAFTS` 確認必須）
- Lead型に `gmailDraftStatus` / `gmailDraftId` 等を追加
- UI下書き候補タブに Gmail下書きステータス表示
- verify 326 passed

### 安全ルール

- Gmail送信API（drafts.send / messages.send）は実装禁止
- 下書き作成後も sendStatus = not_sent
- emailCandidates なしLeadは Gmail下書き対象外（コピー運用）
- 認証情報は .env のみ（gitignore）

### 結果（パイロット6社）

| 項目 | 結果 |
|------|------|
| gmail-preview | ✅ 候補0 / スキップ2（フォームのみ）/ 除外4 |
| gmail-create-drafts（認証なし） | ✅ 明確なエラーで終了（exit 1） |
| verify | ✅ 326/326 |
| mvp-check | ✅ ready=true |
| npm audit | ✅ critical=0, high=0 |

### 次のPhase

- **Phase 18**: 外部候補の実運用テスト / day1連携強化

---

## 2026-06-25 — Phase 17: Google Places / Web検索API接続

### 作業内容

- Places / Web Search adapter（`API_PRODUCTION_ENABLED` ゲート付き）
- 外部候補型・重複排除・検索クエリ生成
- `external-preview`（dry-run・外部通信なし）
- `external-fetch`（`FETCH_CANDIDATES` 確認必須）
- `external-import-approved`（`IMPORT_APPROVED` 確認・input-sites.csv 追記のみ）
- UI「営業候補」タブ + 連絡導線分析
- verify / docs 更新

### 安全確認

- Google Maps画面スクレイピングなし
- 外部候補は直接 Lead 化しない
- APIキーは .env のみ

---

## 2026-06-25 — Phase 18-lite: handoff整備 + emailCandidates改善設計

### 作業内容

- プロジェクトルートに Growly Sales 専用 `CLAUDE.md` / `WORK_LOG.md` / `NEXT_TASKS.md`
- Growly SNS分析アプリ（`OneDrive\ドキュメント\growly\`）との混同防止を明記
- `docs/GROWLY_SALES_EMAIL_CANDIDATES_IMPROVEMENT_PLAN.md` 新規作成
- 連絡導線分析の考え方を docs / README に反映
- verify に Phase 18-lite チェック追加

### 今回やらなかったこと

- 外部API実fetch
- Gmail下書き実作成
- `.env` 編集

### 次のPhase

- **Phase 18**: 外部候補の小規模実fetchテスト
- **Phase 19**: Gmail下書き実作成（emailCandidatesあり3社）

---

## 2026-06-26 — Phase 20-lite: emailCandidates改善実装

### 作業内容

- 同一ドメイン最大2ページ追加解析（contact / company / about 優先）
- mailto / 全角＠ / [at] 正規化、フリーメール・個人メール除外
- Lead型拡張 + contactPathAnalytics 強化
- day1 既存Lead refresh（workflow保持）

### day1結果

- emailCandidates: 0% → **50%（3/6社）**
- contactPathType=both: 3社
- 外部API / Gmail実作成は未実施

