# Growly Sales 10社パイロット運用手順書

**Phase 15.5 — ローカル手動運用版MVPの実運用検証**

## 目的

Phase 15までに完成したローカル手動MVPが、実際の営業運用フローとして成立するかを、**10社以内**で安全に確認します。

- **自動送信は行いません**
- **Gmail APIは使用しません**
- **Google Places / Web検索 / OpenAI APIは使用しません**
- データは **ローカルJSON**（`leads.json`）のみ

## 推奨規模

- パイロットは **10社以下** を推奨します
- 10社を超えてもシステムは動作しますが、初回パイロットでは品質確認のため10社以内に留めてください

---

## 1. input-sites.csv の準備

**ファイル**: `data/growly-sales/input-sites.csv`

### 入力ルール

| 列 | 内容 |
|----|------|
| companyName | 実在の会社名（人間が確認済み） |
| area | 地域（例: 宮城県仙台市） |
| industry | 業種（工務店 / 注文住宅 / リフォーム 等） |
| websiteUrl | **公式サイトURL**（人間が調査のうえ入力） |

### 文字コード

- **必ず UTF-8 で保存**してください
- Shift-JIS / Windows-932 は使用しないでください
- Excelで保存する場合は「CSV UTF-8」を選択

### 注意

- `example.com` はパイプライン検証用のみ。パイロットでは実在企業URLを使用
- 1社ずつ人間がURLを確認してから追加する

---

## 2. day1 実行（サイト解析）

```bash
cd "C:\Users\chiak\AI_\Growly Sales"
npm run growly-sales:day1
```

各URLに対して:

- HTML取得（公開ページのみ、1リクエスト/Lead）
- メール候補・リンク抽出
- A/B/Cランク判定
- 営業切り口生成
- `leads.json` / `leads.csv` に保存

**確認ポイント**:

- `collectionStatus` が `collected` または `needs_review`
- `sourceUrls` が空でない
- 問い合わせURL / Instagram URL が妥当か（UIで目視確認）

---

## 3. generate 実行（営業文生成）

```bash
npm run growly-sales:generate
```

生成される内容:

- 企業分析文（`companyAnalysis`）
- 個別フック（`customHook`）
- 営業メール件名・本文（`emailSubject` / `emailBody`）
- 校閲結果（`reviewStatus`: approve / revise / reject）

**確認ポイント**:

- 日本語が自然か
- 禁止表現が含まれていないか
- `sendStatus` は `not_sent` のまま
- `humanReviewStatus` は `pending` のまま

---

## 4. verify 実行

```bash
npm run growly-sales:verify
```

すべて ✅ になることを確認してからUIに進みます。

---

## 5. UI起動

```bash
npm run growly-sales:ui
```

ブラウザで `http://localhost:3847` を開きます。

起動ログに `Leads path:` が表示されます。正しい `leads.json` を指していることを確認してください。

**ヘッダー表示**:

- 現在モード: **ローカル手動MVP / パイロット運用**
- 外部API: 未使用 / Gmail: 未使用 / 自動送信: なし / 保存先: ローカルJSON

---

## 6. 営業文の確認（営業リストタブ）

各Leadを選択し、以下を確認します。

| 項目 | 確認内容 |
|------|----------|
| 問い合わせURL | 正しい問い合わせページか（/reform 等の誤検出がないか） |
| Instagram URL | Instagramのみ（他SNSでないか） |
| 施工事例URL | 施工事例ページか |
| 企業分析文 | 自然な日本語か、事実と矛盾しないか |
| 個別フック | その企業向けに妥当か |
| メール件名 | 自然か、長すぎないか |
| メール本文 | 禁止表現なし、誇大表現なし |
| reviewStatus | approve / revise / reject が妥当か |
| riskLevel | high の場合は送信対象外 |

---

## 7. 人間承認

### 承認基準（approved にする条件）

- `reviewStatus = approve`
- 問い合わせ先（フォームまたはメール候補）がある
- `riskLevel` が low または medium
- メール件名・本文に問題がない
- 禁止表現・文字化けがない
- `doNotContact = false`

### アクション

- **承認する** → `humanReviewStatus = approved`（sendStatus は **not_sent のまま**）
- **修正が必要** → `needs_revision` + コメント
- **却下する** → `rejected`
- **連絡禁止** → `doNotContact = true` / `sendStatus = blocked`

---

## 8. 下書き候補のコピー（下書き候補タブ）

承認済みかつ条件を満たすLeadのみ表示されます。

1. 件名・本文を確認
2. 「件名コピー」「本文コピー」「件名＋本文コピー」「問い合わせURLコピー」を使用
3. **コピーしても sendStatus は not_sent のまま**（自動送信なし）

必要に応じて:

```bash
npm run growly-sales:export-drafts
```

で `data/growly-sales/drafts/` にファイル出力（Gmail下書きではありません）。

---

## 9. 手動送信（Growly Sales外で実施）

Growly Salesは**送信しません**。人間が以下の手段で手動送信します。

- 問い合わせフォーム
- メール（Gmail等、Growly Sales経由ではない）
- Instagram DM 等

---

## 10. 手動送信済みの記録（営業リスト → 詳細パネル）

Lead詳細の「手動送信・返信ステータス管理」で記録します。

- **手動送信済みにする** → `sendStatus = manual_sent`
- 送信方法（contact_form / email / instagram_dm / other）
- 送信日時・メモ

**制約**: doNotContact / riskLevel=high / 未承認のLeadは記録不可

---

## 11. 返信・フォロー・商談の記録

| 操作 | フィールド |
|------|-----------|
| 返信あり | `replyStatus = replied` + メモ |
| 興味あり | `replyStatus = interested` |
| 商談化 | `replyStatus = meeting_scheduled` |
| フォロー必要 | `replyStatus = follow_up_needed` + `followUpDate` |
| 商談中 | `dealStatus = open` |
| 受注 | `dealStatus = won` |
| 失注 | `dealStatus = lost` |

---

## 12. 営業分析の確認（営業分析タブ）

**パイロット用サマリー**で以下を確認:

- 現在のLead数 / 10社パイロットまで残り何社か
- 承認済み数 / 手動送信済み数 / 返信記録済み数
- 要フォロー数 / 要確認Lead数 / 連絡禁止数

**集計・率**が手動記録と一致するか確認します。

注意: 「この分析はローカルJSONに手動記録された結果を集計したものです。Gmail・外部API・自動送信は使用していません。」

---

## 13. 運用サマリーの確認

ルールベースの改善提案（AI APIなし）を確認します。

- 現在の状態
- 良い兆候 / 注意点
- 次にやること
- フォロー推奨 / 改善アイデア

注意: 「この改善提案はローカルJSONの手動記録をもとにしたルールベースの提案です。AI APIは使用していません。」

---

## 14. パイロット完了後の判断

パイロット完了後、以下を人間が判断します。

1. 営業フロー全体が回せたか
2. URL誤検出・文面品質に問題がなかったか
3. 手動記録 → 分析 → サマリーの連携が機能したか
4. **外部連携（Gmail下書き / Places API 等）に進むか**

進む場合も、**人間承認後**に Phase 16 以降を開始します。

---

## 安全ルール（再掲）

- 自動送信しない
- Gmail送信処理を作らない
- 外部APIに接続しない
- 人間承認なしで下書き候補に出さない
- `humanReviewStatus=approved` は下書き候補であり送信許可ではない
- doNotContact企業には連絡しない
