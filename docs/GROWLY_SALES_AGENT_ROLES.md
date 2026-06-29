# Growly Sales エージェント役割定義

## 概要

Growly Salesは複数の論理エージェント（モジュール）で構成されます。Day 1ではコードモジュールとして実装、将来はAIエージェントに拡張可能な設計とします。

## エージェント一覧

### 1. Collector Agent（収集）

**担当モジュール**: `src/growly-sales/collectors/`

| ファイル | 役割 |
|----------|------|
| `extractWebsiteContacts.ts` | 公式サイトHTML取得・統合 |
| `findContactFormLinks.ts` | 問い合わせフォームURL抽出 |
| `findSocialLinks.ts` | Instagram等SNSリンク抽出 |
| `findRecruitLinks.ts` | 採用ページURL抽出 |
| `findCaseStudyLinks.ts` | 施工事例ページURL抽出 |
| `findCompanyProfileLinks.ts` | 会社概要ページURL抽出 |

**制約**: 手動入力URLのみアクセス。ログイン不要の公開ページのみ。

### 2. Safety Agent（安全）

**担当モジュール**: `src/growly-sales/safety/`

| ファイル | 役割 |
|----------|------|
| `contactPolicy.ts` | 許可メールprefix定義・個人メール判定 |
| `validateLeadSafety.ts` | Lead全体の安全チェック |

**制約**: 個人メール収集禁止。doNotContact尊重。自動送信禁止。

### 3. Scoring Agent（スコアリング）

**担当モジュール**: `src/growly-sales/scoring/`

| ファイル | 役割 |
|----------|------|
| `scoreLead.ts` | A/B/C/UNKNOWNランク判定 |
| `generateSalesAngle.ts` | 業種・状況ベースの営業切り口生成 |

### 4. Storage Agent（保存）

**担当モジュール**: `src/growly-sales/storage/`

| ファイル | 役割 |
|----------|------|
| `jsonLeadRepository.ts` | JSON読み書き |
| `csvLeadRepository.ts` | CSV読み書き |

### 5. Workflow Agent（ワークフロー）

**担当モジュール**: `src/growly-sales/workflow/`

| ファイル | 役割 |
|----------|------|
| `dedupeLeads.ts` | 重複Lead排除 |

### 6. Human Review Agent（人間承認）— 将来

**Day 1**: `humanReviewStatus` フィールドのみ。UI未実装。

**将来**: 承認ダッシュボード、差戻しコメント管理。

### 7. Writer Agent（営業文生成）— 将来 Phase 4

OpenAI APIによる件名・本文・フック生成。Day 1未実装。

### 8. Sender Agent（送信管理）— 将来 Phase 6-7

Gmail下書き作成・送信管理。Day 1では**一切実装しない**。

## 責任分界

| 判断 | 担当 |
|------|------|
| データ収集 | Collector Agent（自動） |
| 安全フィルター | Safety Agent（自動） |
| ランク付け | Scoring Agent（自動） |
| Lead保存 | Storage Agent（自動） |
| 送信可否 | Human Review Agent（**人間必須**） |
| 実際の送信 | 人間のみ（将来も自動送信禁止） |
