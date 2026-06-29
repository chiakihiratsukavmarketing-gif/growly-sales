# Growly Sales プロジェクト状態

**最終更新**: 2026-06-25（Phase 18-lite — handoff整備 + emailCandidates改善設計）

## 最重要方針

**外部APIは営業候補取得のみ。送信・Gmail下書き自動大量作成とは完全分離。**  
**Gmailは下書き作成のみ（Phase 16）。送信APIは禁止。**  
`input-sites.csv` は人間入力が主データ源。外部候補は `external-candidates.json` に保存し、人間確認後のみ取り込み。

### 連絡導線（Phase 17〜18-lite）

| フィールド | 用途 |
|------------|------|
| `emailCandidates` | **Gmail下書き候補**（Phase 16） |
| `contactFormUrl` | **コピー運用**（下書き候補UI） |

- パイロット6社は `emailCandidates` **0%**（問い合わせフォームのみ）— 住宅業界ではあり得る **失敗ではない**
- Gmail下書き実作成テスト（Phase 19）にはメールあり Lead が必要
- 改善設計: `docs/GROWLY_SALES_EMAIL_CANDIDATES_IMPROVEMENT_PLAN.md`
- UI「営業分析」→ **連絡導線分析** で `emailCandidateRate` / `contactFormOnlyLeads` を確認

### handoff（Phase 18-lite）

プロジェクトルートの `CLAUDE.md` / `WORK_LOG.md` / `NEXT_TASKS.md` が **Growly Sales 専用** の作業入口。  
`OneDrive\ドキュメント\growly\` の同名ファイルは **Growly SNS分析アプリ** 用（混同禁止）。

```
input-sites.csv（人間入力）
  → day1（サイト解析・Lead保存）
  → generate（営業判断・分析・メール・校閲）
  → 人間承認UI（humanReviewStatus）
  → export-drafts / 下書き候補UI（手動コピー）
  → gmail-preview（dry-run）
  → gmail-create-drafts（Gmail下書き作成・送信なし）
  → 人間が手動送信 → sendStatus = manual_sent
```

## 現在Phase

| Phase | 名称 | 状態 |
|-------|------|------|
| Phase 1〜3.5 | 設計・データ・サイト解析・誤検出修正 | ✅ 完了 |
| Phase 4準備 | API adapter雛形（本番未接続） | ✅ 完了 |
| Phase 5〜9 | 営業生成ループ（ルールベース） | ✅ 完了 |
| Phase 10 | 人間承認UI / 営業リスト編集画面 | ✅ 完了 |
| **Phase 11A** | **Gmailなし下書きエクスポート** | ✅ 完了 |
| **Phase 11A-2** | **下書き候補UI表示・コピー機能** | ✅ 完了 |
| **Phase 12-lite** | **手動送信・返信ステータス管理（記録のみ）** | ✅ 完了 |
| **Phase 13-lite** | **営業結果の手動分析（集計）** | ✅ 完了 |
| **Phase 14-lite** | **運用サマリー / 改善提案（ルールベース）** | ✅ 完了 |
| **Phase 15** | **ローカル手動運用版MVP完成チェック** | ✅ 完了 |
| **Phase 15.5** | **10社パイロット運用テスト** | ✅ **実運用テスト完了（6社）** |
| **Phase 15.6** | **承認〜コピー実操作確認** | ✅ 完了 |
| **Phase 15.7** | **customHook個別化改善** | ✅ 完了 |
| **Phase 16** | **Gmail下書き作成（送信なし）** | ✅ 完了 |
| **Phase 17** | **Google Places / Web検索API（候補取得・preview中心）** | ✅ 完了 |
| **Phase 18-lite** | **handoff整備 + emailCandidates改善設計** | ✅ 完了 |
| **Phase 20-lite** | **emailCandidates改善実装（day1追加解析）** | ✅ 完了 |
| **UI Polish 1** | **見た目調整（白ベース＋ティール系SaaS UI）** | ✅ 完了 |

**次のPhase**: **Phase 18** — 外部候補の小規模実fetchテスト（APIキー・人間確認必須）  
**その次**: **Phase 19** — Gmail下書き実作成テスト（emailCandidatesありLeadが3社に増加）

## 実行コマンド

```bash
npm run growly-sales:day1         # CSV → サイト解析 → leads.json
npm run growly-sales:generate     # 営業判断・分析・メール・校閲
npm run growly-sales:verify       # 安全・生成・型・UI・エクスポート検証
npm run growly-sales:ui           # 人間承認UI（**プロジェクト直下から**起動）
npm run growly-sales:export-drafts # 承認済みLeadの手動下書きエクスポート
npm run growly-sales:mvp-check    # ローカル手動運用MVPの完成チェック
npm run growly-sales:gmail-preview      # Gmail下書き preview（API非接続）
npm run growly-sales:gmail-create-drafts  # Gmail下書き実作成（CREATE_DRAFTS必須）
npm run growly-sales:external-preview   # 外部候補 dry-run（API非接続）
npm run growly-sales:external-fetch     # 外部API候補取得（FETCH_CANDIDATES必須）
npm run growly-sales:external-import-approved  # 承認済み候補→input-sites.csv
```

## パス解決（config/paths.ts）

`package.json`（name=growly-sales）を上方向に探索し、**process.cwd() に依存せず**プロジェクトルートを解決します。

| 関数 | 用途 |
|------|------|
| `getProjectRoot()` | プロジェクトルート |
| `getLeadsJsonPath()` | `data/growly-sales/leads.json` |
| `getDraftsDir()` | `data/growly-sales/drafts` |

UIサーバー起動時に `Leads path:` をログ出力します。

## UI API互換性（draft-stats）

- フロントは `GET /api/draft-stats` を利用（下書き統計）
- サーバー側も **`/api/draft-stats` を維持**して互換性を担保

## 下書き候補UI（Phase 11A-2）

`npm run growly-sales:ui` → **下書き候補**タブ

- `selectDraftCandidates` 条件を満たすLeadのみ表示
- 件名・本文・件名＋本文・問い合わせURLをクリップボードにコピー
- コピーしても `sendStatus=not_sent` のまま（自動送信なし）
- UIから下書きファイル再生成（`POST /api/export-drafts`）— Gmail API不使用

## 手動送信・返信ステータス管理（Phase 12-lite）

Lead詳細パネルで、以下を**記録のみ**で管理（実送信は行わない）。

- 手動送信記録: `sendStatus=manual_sent`, `manualSentAt`, `manualSendMethod`
- 返信ステータス: `replyStatus` + メモ
- フォロー予定: `followUpDate` + メモ
- 商談/結果: `dealStatus`（open/won/lost/paused）+ メモ

重要:

- コピーのみでは `sendStatus` は変えない
- doNotContact / riskLevel=high / 承認未完了のLeadは手動送信記録不可

## 下書きエクスポート対象条件

以下を**すべて**満たすLeadのみ:

- `humanReviewStatus=approved`
- `reviewStatus=approve`
- `sendStatus=not_sent`
- `doNotContact=false`
- `riskLevel=low` または `medium`
- `emailSubject` / `emailBody` が空でない
- 問い合わせフォームまたはメール候補あり
- 禁止表現・文字化けなし

## Phase 11A / 11A-2 の重要ルール

| 操作 | sendStatus |
|------|------------|
| export-drafts 実行 | **not_sent のまま（変更しない）** |
| UIコピー操作 | **not_sent のまま** |

- `humanReviewStatus=approved` は「手動エクスポート候補」であり、送信許可ではない
- Gmail API接続・Gmail下書き作成・自動送信は**未実装**

## 出力ファイル

- `data/growly-sales/drafts/draftCandidates.json`
- `data/growly-sales/drafts/draftCandidates.csv`
- `data/growly-sales/drafts/draft-copy.txt`

## 延期（最後に実施）

- Google Places API 本番接続
- Web検索API 本番接続
- OpenAI API
- Gmail API / **Gmail下書き作成（Phase 16・送信なし）** / 自動送信
- 返信分類・分析ダッシュボード・Supabase

## Phase 13-lite / 14-lite / 15（ローカル手動運用MVP）

- **営業分析**: `GET /api/sales-analytics`（ローカルJSON集計）
- **運用サマリー**: `GET /api/operation-summary`（ルールベース、AI APIなし）
- **MVPチェック**: `npm run growly-sales:mvp-check` / `GET /api/mvp-readiness`

## Phase 15.5（10社パイロット運用テスト）

- **手順書**: `docs/GROWLY_SALES_PILOT_RUNBOOK.md`
- **チェックリスト**: `docs/GROWLY_SALES_PILOT_CHECKLIST.md`
- **UI**: ヘッダーにパイロット運用モード表示
- **パイロットサマリー**: `GET /api/pilot-summary` / 営業分析タブ
- **推奨**: 10社以下で実運用テスト（超過してもエラーにならない）
- **ローカル手動MVP**: `mvp-check` で ready=true

## UI Polish 1（並行タスク）

- 白ベース＋ティール系アクセントのSaaS管理画面テイストに統一
- CSS変数によるデザインシステム整理（`styles.css`）
- タブ・サマリーカード・テーブル・バッジ・詳細パネル・営業分析画面の視認性改善
- 機能ロジック・API仕様は変更なし

## Phase 15.6 / 15.7（承認フロー確認・customHook個別化）

- **15.6**: 承認→下書き候補→コピー→手動送信記録の安全確認完了
- **15.7**: customHook を優先度ベースで会社ごとに個別化（6社すべて異なる）
- **コピー注意**: 「コピーしても送信済みにはなりません」を下書き候補タブに表示
- **generate再実行**: `preserveWorkflowState` で手動送信・返信・商談記録を保持
- **メタデータ**: `hookSourceType` / `hookSourceUrl` / `customHookReason` を Lead に追加
- **verify**: 292 passed（customHook個別化・コピー安全・再生成保持を追加検証）
- **Phase 16前**: Gmail/自動送信コードなし、API本番 disabled を再確認済み

## Phase 16（Gmail下書き作成 — 送信なし）

- **preview**: `npm run growly-sales:gmail-preview`（Gmail API非接続・dry-run）
- **実作成**: `npm run growly-sales:gmail-create-drafts`（`CREATE_DRAFTS` 入力必須）
- **API**: `users.drafts.create` のみ（送信系API禁止）
- **対象**: `emailCandidates` あり・承認済み・`sendStatus=not_sent` のLeadのみ
- **対象外**: `emailCandidates` なし（問い合わせフォームのみ）→ コピー運用のまま `gmailDraftStatus=skipped`
- **sendStatus**: 下書き作成後も **not_sent のまま**（実際に送信した場合のみ `manual_sent`）
- **認証**: `.env` の `GMAIL_CLIENT_ID` / `GMAIL_CLIENT_SECRET` / `GMAIL_REFRESH_TOKEN` または `GMAIL_CREDENTIALS_PATH`
- **verify**: 326 passed

## 人間確認が必要な箇所

1. `input-sites.csv` に実在企業URLを **10社以内** で追加
2. day1 → generate → verify → UI で一連フローを実施
3. パイロット完了後、外部連携（Gmail / Places API）に進むか判断
4. UI「下書き候補」タブで承認済みLeadの文面を確認・コピー
5. `draft-copy.txt` を手動コピーして送信前に最終チェック
