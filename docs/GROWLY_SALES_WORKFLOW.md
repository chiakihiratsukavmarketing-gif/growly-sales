# Growly Sales ワークフロー

## Day 1 ワークフロー（現行）

```
1. input-sites.csv を用意
   （companyName, area, industry, websiteUrl）

2. npm run growly-sales:day1 を実行

3. 各URLに対して:
   a. HTML取得（公開ページのみ）
   b. メール候補・リンク抽出
   c. 安全フィルター適用
   d. A/B/Cランク判定
   e. 営業切り口生成
   f. Leadオブジェクト作成

4. 既存leadsと重複排除

5. leads.json / leads.csv に保存

6. run-log.json に実行結果記録

7. npm run growly-sales:verify で検証
```

## 外部候補取得ワークフロー（Phase 17）

```
targetProfile → 検索クエリ生成
  ↓
external-preview（dry-run・外部通信なし）
  ↓
external-fetch（API_PRODUCTION_ENABLED + FETCH_CANDIDATES 必須）
  ↓
external-candidates.json / .csv に保存
  ↓
UI「営業候補」で個別に取り込み承認
  ↓
external-import-approved（IMPORT_APPROVED 必須）
  ↓
input-sites.csv 追記（leads.json には直接書かない）
  ↓
day1 → generate → …
```

## 連絡導線ワークフロー（Phase 17 / 18-lite）

day1 解析後、Lead は連絡導線で分類して運用する。

```
day1 解析
  ↓
（Phase 20-lite）同一ドメイン内 contact/about 等を最大2ページ追加解析
  ↓
emailCandidates あり？ ──Yes──→ Gmail下書き候補（Phase 16・approved時）
  │
  No
  ↓
contactFormUrl あり？ ──Yes──→ 下書き候補UIでコピー運用（現行パイロット6社）
  │
  No
  ↓
needs_review（人間調査）
```

- `emailCandidates` 0% は住宅業界では **あり得る**（失敗扱いしない）
- 営業分析タブ「連絡導線分析」で率を観察
- 改善設計: `docs/GROWLY_SALES_EMAIL_CANDIDATES_IMPROVEMENT_PLAN.md`（実装は Phase 20 以降）
- Phase 18 以降: 新規 Lead 取り込み後にメールあり率を観察

## ローカル手動運用ワークフロー（MVP）

```
input-sites.csv（人間入力）
  ↓
day1（サイト解析・Lead保存）
  ↓
generate（企業分析・営業文・校閲）
  ↓
UI（人間承認 / メール編集）
  ↓
下書き候補をコピー（または export-drafts）
  ↓
人間が手動送信（Growly Salesは送信しない）
  ↓
UIで「手動送信済み・返信・商談・フォロー」を記録（記録のみ）
  ↓
営業分析（ローカルJSONを集計）
  ↓
運用サマリー（ルールベース提案、AI APIなし）
  ↓
mvp-check（ローカル手動運用MVPの完成チェック）
  ↓
10社パイロット運用テスト（Phase 15.5）
  ↓
（人間判断）外部連携フェーズへ
```

## 将来ワークフロー（Phase 3以降）

```
[発掘]
  Places API / Web検索 → 候補リスト
       ↓
[収集] Collector Agent
       ↓
[安全] Safety Agent
       ↓
[分析] Scoring + AI分析
       ↓
[生成] Writer Agent（OpenAI）
       ↓
[校閲] 自動校閲 + 人間レビュー
       ↓
[下書き] Gmail下書き作成（Phase 16・users.drafts.create のみ・送信なし）
       ↓
[送信] 人間が手動送信（sendStatus = manual_sent）
       ↓
[追跡] 返信分析
```

## Leadライフサイクル

| ステータス | フィールド | 遷移 |
|------------|-----------|------|
| 収集 | collectionStatus | pending → collected / failed / needs_review |
| 安全 | riskLevel | low / medium / high |
| 人間レビュー | humanReviewStatus | pending → approved / rejected |
| 校閲 | reviewStatus | pending → approve / revise / reject |
| 送信 | sendStatus | not_sent → manual_sent（人間が実際に送信した記録のみ） |
| Gmail下書き | gmailDraftStatus | none → draft_created / skipped / failed |
| 返信 | replyStatus | none → replied / bounced |

## 重複排除ルール

以下3つがすべて一致するLeadは重複：

1. companyName（正規化後）
2. websiteUrl（正規化後）
3. emailCandidates（ソート後JSON一致）

重複時は先に存在するLeadを保持。

## 人間介入ポイント

| タイミング | 確認内容 |
|------------|----------|
| Lead保存後 | emailCandidates, riskLevel |
| 営業文生成後（将来） | 件名・本文の内容 |
| 送信前（将来） | humanReviewStatus = approved |
| doNotContact設定時 | 除外リスト確認 |

## エラー処理

- HTML取得失敗 → collectionStatus = failed, 他フィールドは入力値で保存
- 空input-sites.csv → 正常終了（0件処理）
- 存在しないファイル → 空配列として処理
