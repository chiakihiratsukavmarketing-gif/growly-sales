# Growly Sales — Daily 30 運用 Runbook（Phase 26 完成版）

## 目的

住宅会社・工務店・リフォーム会社向けに、**毎日30件**の営業候補を収集し、  
営業文生成 → 品質チェック → Gmail下書き候補化 → **人間による手動送信**までを安全に回す。

- 自動送信は**しない**
- Gmail `messages.send` は**使わない**
- Gmail下書きは `users.drafts.create` のみ（`CREATE_DRAFTS` ゲート付き）

## エリア拡大順

1. 宮城県（優先）
2. 福島県
3. 北関東 — 茨城県 → 栃木県 → 群馬県

## 毎日の実行手順

1. Growly Sales UI を開く
2. **候補収集**タブで Daily 30 進捗を確認
3. 候補が足りなければ `FETCH_DAILY_30` で収集
4. `email_found` を確認し **Lead化承認**
5. `GENERATE_DAILY_30_COPY` で営業文生成・品質チェック
6. `ready_for_draft` を確認
7. `IMPORT_DAILY_30_DRAFT_CANDIDATES` で leads.json に取り込み（または1件ずつ）
8. **下書き候補**タブで内容確認・人間承認
9. `CREATE_DRAFTS` で Gmail 下書き作成
10. Gmail 画面で確認して**手動送信**
11. **送信記録**タブで `sent` / `manual_gmail` を記録
12. **返信管理**で返信状況を確認（`replySummary` のみ保存）

## ゲートの意味

| ゲート | 用途 | Gmail API |
|--------|------|-----------|
| `FETCH_DAILY_30` | 候補収集 | 呼ばない |
| `GENERATE_DAILY_30_COPY` | 営業文生成・品質チェック | 呼ばない |
| `IMPORT_DAILY_30_DRAFT_CANDIDATES` | leads.json への一括取り込み | 呼ばない |
| `CREATE_DRAFTS` | Gmail 下書き作成のみ | `drafts.create` のみ |

**重要:** 取り込みと下書き作成は別ゲート。取り込み時に Gmail API を呼ばない。

## Gmail下書き作成と送信の違い

| 操作 | 実行者 | ツール |
|------|--------|--------|
| 下書き作成 | Growly Sales UI + `CREATE_DRAFTS` | `users.drafts.create` |
| 送信 | **人間** | Gmail 画面で手動 |
| 送信記録 | 人間 | Growly Sales 送信記録タブ |

## 人間確認が必要なポイント

- Lead化承認（`email_found` → `approved_for_lead`）
- 下書き候補タブでの内容承認（`humanReviewStatus=approved`）
- Gmail 画面での送信前確認
- 送信記録・返信記録の入力

## トラブル時の確認箇所

| 症状 | 確認 |
|------|------|
| 収集できない | `.env` APIキー、`API_PRODUCTION_ENABLED=true`、`FETCH_DAILY_30` |
| 営業文が生成されない | Lead化承認済みか、`GENERATE_DAILY_30_COPY` 入力 |
| 取り込めない | `ready_for_draft` / 重複 / `needs_review` / `failureReason` |
| 下書き作成できない | `humanReviewStatus=approved`、`CREATE_DRAFTS`、Gmail OAuth |
| 送信記録できない | 先に下書き作成・手動送信済みか |

データファイル:

- `data/growly-sales/external-candidates.json`
- `data/growly-sales/leads.json`

## 既存11社の送信履歴保護

- パイロット・送信済み Lead の `sendStatus` / `replyStatus` / 返信メモは**上書きしない**
- Daily 30 取り込みは重複 Lead を拒否
- `generate` / 取り込みパイプラインは送信済み Lead に触れない

## CLI（参考）

```powershell
cd "C:\Users\chiak\AI_\Growly Sales"
npm run growly-sales:daily30-preview          # dry-run
npm run growly-sales:daily30-fetch              # FETCH_DAILY_30
npm run growly-sales:daily30-generate-copy      # GENERATE_DAILY_30_COPY
npm run growly-sales:daily30-import-draft-candidates  # IMPORT_DAILY_30_DRAFT_CANDIDATES
npm run growly-sales:gmail-create-drafts        # CREATE_DRAFTS（別途）
```

## 安全ルール（固定）

- 自動送信しない
- 個人メールは除外
- `needs_review` / `excluded` は下書き候補化しない
- 署名 Email: `c_hiratsuka@wantreach.jp`
- 返信本文全文は保存せず `replySummary` のみ
- APIキー / refresh token / secret は画面・ログに出さない
