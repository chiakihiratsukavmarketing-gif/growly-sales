# Growly Sales

SNS運用代行の営業先を発掘・分析・営業文作成・校閲・送信管理するAI営業OS（開発中）。

> **このリポジトリは Growly Sales です。** Growly SNS分析アプリ（`OneDrive\ドキュメント\growly\`）とは別プロジェクトです。  
> 作業入口: **[CLAUDE.md](./CLAUDE.md)** · 履歴: [WORK_LOG.md](./WORK_LOG.md) · 次タスク: [NEXT_TASKS.md](./NEXT_TASKS.md)

**現在 Phase:** 20-lite 完了 → 次は **Phase 18**（外部fetch）または **Phase 19**（Gmail下書き実作成・emailあり3社）

## 連絡導線について

| フィールド | 用途 |
|------------|------|
| `emailCandidates` | Gmail下書き候補（Phase 16） |
| `contactFormUrl` | 下書き候補UIでのコピー運用 |

パイロット6社は Phase 20-lite 後 **emailCandidates 50%（3社）**、残り3社は問い合わせフォームのみ（コピー運用継続）。  
Gmail下書き実テスト（Phase 19）にはメールあり Lead が必要です。改善設計: [GROWLY_SALES_EMAIL_CANDIDATES_IMPROVEMENT_PLAN.md](./docs/GROWLY_SALES_EMAIL_CANDIDATES_IMPROVEMENT_PLAN.md)

## 入力データ（input-sites.csv）

**`data/growly-sales/input-sites.csv` は人間が手動で編集します。**

| 項目 | 内容 |
|------|------|
| 入力者 | 人間（営業担当） |
| 実在企業URL | 人間が調査のうえ1社ずつ追加 |
| テスト用URL | `https://example.com` はパイプライン動作確認用のみ（実在企業ではない） |

AIやスクリプトが実在企業URLを大量収集することはありません。Google Places / Web検索 API は Day2前半時点では **本番接続していません**（adapter は disabled）。

### CSVの文字コード

**必ず UTF-8 で保存してください。**

| 項目 | 内容 |
|------|------|
| 推奨 | **UTF-8**（BOM付き・なしどちらも可） |
| 非推奨 | Shift-JIS / Windows-932 |

### input-sites.csv の列

```csv
companyName,area,industry,websiteUrl
```

## 設定プロファイル（営業対象・オファー）

住宅会社専用に固定せず、後から変更できる設計です。

| ファイル | 用途 |
|----------|------|
| `config/growly-sales/targets/housing.json` | 営業対象（業種・地域・検索キーワード） |
| `config/growly-sales/offers/sns-operation.json` | 売るサービス（オファー・切り口・禁止表現） |

将来は `介護施設 × SNS採用支援` など別プロファイルを追加できます。

## 環境変数（.env）

APIキーは `.env` に設定しますが、**Day2前半では使用しません**。

```bash
cp .env.example .env
# GOOGLE_PLACES_API_KEY= などを将来入力
```

`.env` は `.gitignore` 対象です。`.env.example` のみコミットします。

## コマンド

```bash
npm install
npm run growly-sales:day1         # input-sites.csv → サイト解析 → leads.json
npm run growly-sales:generate     # 営業判断・分析・メール・校閲
npm run growly-sales:verify       # 安全・生成・型・UI・エクスポート検証
npm run growly-sales:ui           # 人間承認UI（http://localhost:3847）
npm run growly-sales:export-drafts # 承認済みLeadの手動下書きエクスポート
npm run growly-sales:mvp-check    # ローカル手動運用MVPの完成チェック
npm run growly-sales:gmail-preview       # Gmail下書き preview（API非接続・dry-run）
npm run growly-sales:gmail-create-drafts # Gmail下書き実作成（CREATE_DRAFTS必須・送信なし）
npm run growly-sales:external-preview    # 外部候補 dry-run（API非接続）
npm run growly-sales:external-fetch      # 外部API候補取得（FETCH_CANDIDATES必須）
npm run growly-sales:external-import-approved  # 承認済み候補→input-sites.csv
```

**API接続**: Phase 17 で Places / Web検索は **営業候補取得のみ**（`API_PRODUCTION_ENABLED=true` + `FETCH_CANDIDATES` 必須）。**Phase 18-lite 時点では実fetch未実施。** Gmail下書き実作成も未実施（Phase 19）。OpenAIは未接続。

## 人間承認UI（Phase 10 / 11A-2）

**必ずプロジェクト直下から起動してください。**

```bash
cd "C:\Users\chiak\AI_\Growly Sales"
npm run growly-sales:ui
```

起動時にサーバーログに `Leads path:` が表示されます。`data/growly-sales/leads.json` を指していることを確認してください。

ブラウザで `http://localhost:3847` を開きます。

**タブ**
- **営業リスト** — 確認・承認・編集
- **下書き候補** — 承認済みLeadのコピー（件名・本文・問い合わせURL）
- **営業候補** — 外部API取得候補の一覧・個別取り込み承認（自動大量取り込みなし）
- **営業分析** — 手動送信/返信/商談/フォロー記録を集計 + **連絡導線分析**

- 承認しても **自動送信しません**（sendStatus は not_sent のまま）
- コピーしても **sendStatus は not_sent のまま**
- Gmail下書き作成は **Phase 16 で実装済み**（送信なし・CLIのみ）
- 連絡禁止にすると doNotContact=true / sendStatus=blocked

### 手動送信・返信ステータス管理（Phase 12-lite）

Lead詳細パネルで以下を**記録のみ**で管理できます（実送信は行いません）。

- 手動送信済みにする（sendStatus=manual_sent, method, sentAt）
- 返信ステータス（replyStatus）とメモ
- フォロー予定日（followUpDate）とメモ
- 商談ステータス（dealStatus: open/won/lost/paused）

重要: **自動送信なし / Gmail APIなし**

## Gmail下書き作成（Phase 16 / Phase 19 OAuth）

**送信はしません。** `users.drafts.create` のみ使用。

```bash
npm run growly-sales:gmail-oauth-helper   # refresh token 取得補助（送信・下書き作成なし）
npm run growly-sales:gmail-preview        # dry-run（Gmail API非接続）
npm run growly-sales:gmail-create-drafts  # 実作成（.env認証 + CREATE_DRAFTS入力必須）
```

| ルール | 内容 |
|--------|------|
| OAuth helper | refresh token 取得のみ。`.env` は人間が手動編集。token はファイル保存しない |
| 対象 | `emailCandidates` あり・承認済み・`sendStatus=not_sent` |
| 対象外 | `emailCandidates` なし → 問い合わせフォーム用コピー運用 |
| sendStatus | 下書き作成後も **not_sent のまま** |
| 認証 | `.env`（gitignore）。`.env.example` を参照 |

## 下書きエクスポート（Phase 11A）

```bash
npm run growly-sales:export-drafts
```

UIで `humanReviewStatus=approved` にしたLeadのみ、以下に出力します。

- `data/growly-sales/drafts/draftCandidates.json`
- `data/growly-sales/drafts/draftCandidates.csv`
- `data/growly-sales/drafts/draft-copy.txt`

**Gmail API接続なし・自動送信なし。** 手動コピー・確認用です。export後も sendStatus は not_sent のままです。

## 営業結果の手動分析 / 運用サマリー（Phase 13-lite / 14-lite）

UIの **営業分析** タブで、`leads.json` に手動記録した結果（手動送信・返信・商談・フォロー）を集計して表示します。

- Gmail / 外部API / 自動送信は使用しません
- 提案は **ルールベース**（AI APIなし）

## ローカル手動運用MVP完成チェック（Phase 15）

```bash
npm run growly-sales:mvp-check
```

- `ready=true/false` と未完了チェック、次にやることを表示します
- 破壊的操作は行いません（ファイル削除・外部通信なし）

## 10社パイロット運用テスト（Phase 15.5）

ローカル手動MVPが実運用として成立するか、**10社以下**で安全に試します。

| ドキュメント | 用途 |
|-------------|------|
| `docs/GROWLY_SALES_PILOT_RUNBOOK.md` | パイロット運用手順書 |
| `docs/GROWLY_SALES_PILOT_CHECKLIST.md` | 確認チェックリスト |

**推奨**: 初回パイロットは **10社以内**。10社を超えてもシステムは動作しますが、品質確認のため10社以下を推奨します。

UIヘッダーに **ローカル手動MVP / パイロット運用** モードが表示されます。営業分析タブにパイロット用サマリーがあります。

パイロット完了後、外部連携（Gmail / Places API 等）に進むかは**人間が判断**します。

**2026-06-25 実施結果（6社）**: day1 / generate / verify（292 passed）/ mvp-check（ready=true）すべて成功。

**Phase 16（2026-06-25）**: Gmail下書き作成（送信なし）。`gmail-preview` / `gmail-create-drafts`。verify 326 passed。

## UI（見た目）

- **UI Polish 1** 適用済み: 白ベース＋ティール系のSaaS管理画面テイスト
- ヘッダーにパイロット運用モード表示、営業分析タブにパイロット用サマリー

## 安全方針

- 自動送信なし
- 人間承認なしで送信しない
- コピーしても `sendStatus` は **not_sent のまま**（実際に送信した場合のみ手動送信済みとして記録）
- Gmail下書き作成は Phase 16（送信なし・`CREATE_DRAFTS` 確認必須）
- 個人メールは収集しない
- 手動入力された公式サイト URL のみアクセス
- Google Maps 画面のスクレイピングなし
- 外部 API は Day2前半で disabled

## 実URLテスト（宮城・仙台 工務店3社）

`input-sites.csv` に登録した実在URLでパイプラインを検証しています。

| 検証項目 | 内容 |
|----------|------|
| 森のめぐみ工房 | morimegu.co.jp |
| 一建設 | hajime-kensetsu.co.jp |
| 菅原工務店 | sugawara-koumuten.com |

**誤検出修正済み（Day 2後半）**:

- `companyProfileUrl` に Facebook 等の SNS URL は入れない
- `contactFormUrl` に `/reform` 等のサービスページは入れない
- 問い合わせページが不明な場合は `contactFormUrl: null`（無理に埋めない）

詳細は `docs/GROWLY_SALES_RUN_LOG.md` および `docs/GROWLY_SALES_SAFETY_RULES.md` を参照してください。
