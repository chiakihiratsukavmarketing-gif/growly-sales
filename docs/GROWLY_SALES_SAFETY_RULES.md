# Growly Sales 安全ルール

## 絶対禁止事項

1. **自動送信しない** — メール・DM・フォーム送信の自動化は禁止
2. **人間承認なしで送信しない** — humanReviewStatus = approved が必須（将来Phase）
3. **個人メールを収集しない** — 法人窓口メールのみ許可
4. **非公開情報を取得しない** — ログイン後・会員限定ページは対象外
5. **doNotContact企業に連絡しない** — doNotContact = true は永久除外
6. **Google Maps画面をスクレイピングしない**
7. **誇大表現・成果保証表現を生成しない**（将来のWriter Agent向け）

## 許可されるメール候補

以下のprefixのみ自動保存対象：

- `info@`
- `contact@`
- `sales@`
- `recruit@`
- `support@`
- `office@`
- `toiawase@`
- `inquiry@`
- `reception@`
- `hello@`

## 除外されるメール候補

- 個人名らしいメール（tanaka@, yamada@ 等）
- 社員個人メール
- 取得元不明のメール
- script/hidden内のみの怪しいメール
- 不自然な形式のメール

個人メールの可能性があるものは**保存しない**。riskLevel = high + humanReviewStatus = pending。

## 外部アクセス制限

- 手動入力された公式サイトURLのみアクセス
- 1リクエスト/Lead（Day 1）
- User-Agent明示
- タイムアウト設定（10秒）

## データ保存ルール

- **sourceUrls必須** — 取得元URLを必ず記録
- 収集失敗時もLeadを保存（collectionStatus = failed）
- 送信系フィールドは sendStatus = not_sent で初期化

## 外部API（Phase 17）

- **用途**: 営業候補の公式サイトURL候補取得のみ
- **禁止**: Google Maps画面スクレイピング、無差別大量収集、自動Lead化、自動送信
- **保存**: `data/growly-sales/external-candidates.json` / `.csv`
- **取り込み**: UIで個別承認 → `approved_for_import` → CLI `external-import-approved` → `input-sites.csv` 追記 → day1
- **preview**: `external-preview` は外部通信なし
- **fetch**: `API_PRODUCTION_ENABLED=true` + APIキー + `FETCH_CANDIDATES` 入力必須
- **APIキー**: `.env` のみ（コミット禁止）

## 送信フロー（Phase 16）

```
Lead生成 → 安全チェック → 人間レビュー(pending)
    → 人間承認(approved) → Gmail下書き作成（users.drafts.create のみ）
    → 人間がGmailから手動送信 → sendStatus = manual_sent（UIで記録）
```

**自動送信ステップは存在しない。Gmail送信API（drafts.send / messages.send）は実装禁止。**

### Gmail下書きの安全ルール（Phase 16）

| ルール | 内容 |
|--------|------|
| 送信禁止 | `drafts.send` / `messages.send` は実装しない |
| sendStatus | 下書き作成後も **not_sent のまま** |
| 対象Lead | `humanReviewStatus=approved` かつ `emailCandidates` あり |
| 対象外 | `emailCandidates` なし → 問い合わせフォーム用コピー運用（`gmailDraftStatus=skipped`） |
| 実作成 | CLIのみ、`CREATE_DRAFTS` 入力必須 |
| 認証 | `.env` のみ（gitignore）。コード直書き禁止 |

## Day 1での反映

| ルール | 実装 |
|--------|------|
| 自動送信禁止 | 送信処理コードなし |
| 個人メール除外 | contactPolicy.ts |
| sourceUrls保存 | extractWebsiteContacts.ts |
| doNotContact | Lead型フィールド + verify検証 |
| 人間承認必須 | humanReviewStatus = pending 初期値 |

## 違反時の対応

1. verifyスクリプトが失敗 → 修正必須
2. 個人メール検出 → 保存除外 or riskLevel = high
3. 送信コード検出 → 即削除・報告
