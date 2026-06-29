# Growly Sales — emailCandidates 改善計画

**Phase:** 18-lite（設計のみ）  
**実装:** Phase 20 以降（day1 コレクター拡張）  
**目的:** Gmail下書き実作成テスト（Phase 19）に向け、安全に法人窓口メール検出率を上げる

---

## 現状

### パイロット6社の実績

| 指標 | 値 |
|------|-----|
| totalLeads | 6 |
| emailCandidateLeads | **0**（0%） |
| contactFormOnlyLeads | **6**（100%） |
| noContactPathLeads | 0 |
| Gmail下書き実作成候補 | **0件** |

### 観察

- 宮城県の工務店・住宅会社は、公開サイト上で **問い合わせフォーム中心** の傾向が強い
- トップページ単体解析では `emailCandidates` が空になりやすい
- `contactFormUrl` は6社すべて検出済み → **コピー運用は可能**
- `emailCandidates` 0% は **パイプライン失敗ではない**（住宅業界では一般的）
- ただし **Phase 19（Gmail下書き実作成テスト）** には `emailCandidates` あり Lead が必要

### 現行 day1 の制約

- 公式サイト **1リクエスト/Lead**（トップページ中心）
- 許可prefixフィルター（`info@`, `contact@` 等）適用済み
- 個人メールは保存しない方針

---

## 改善方針（許可する改善のみ）

以下は **公開ページ・追加1〜2リクエスト以内** で実施可能な安全な改善です。

### 解析範囲の拡張（同一ドメイン内）

| 改善 | 内容 |
|------|------|
| contact ページ追加解析 | `/contact`, `/inquiry`, `/toiawase` 等への **1回** 追加 fetch |
| company / about 追加解析 | `/company`, `/about`, `/corporate` 等への **1回** 追加 fetch |
| フッター解析 | 全ページ共通フッター内の `mailto:` / テキストメール |
| mailto 検出強化 | `href="mailto:..."` の正規化・複数候補の重複排除 |
| テキスト正規化 | 全角 `＠` → `@`、不可視文字除去、`(at)` 表記は **採用しない**（誤検出リスク） |

### 法人窓口メールの優先

以下のローカルパートを **高信頼度** として優先（既存 `SAFETY_RULES` と整合）:

- `info`, `contact`, `office`, `support`, `sales`, `toiawase`, `inquiry`, `recruit`（採用窓口は営業対象外の場合あり → 要フラグ）

### メタデータの保存

| 項目 | 説明 |
|------|------|
| `sourceUrls` | 検出元URLを必ず追記（既存ルール維持） |
| `emailCandidateConfidence` | 0〜1 の信頼度スコア（新規提案） |
| `emailCandidateSourceUrls` | 各メール候補の検出元URL配列（新規提案） |
| `emailContactType` | 分類（下記） |
| `contactPathType` | 連絡導線の種別（下記） |
| `contactPathConfidence` | 連絡導線判定の信頼度 |

### 実装時の上限（大量クローリング防止）

- Leadあたり追加 fetch: **最大2ページ**（contact + about のいずれか）
- 同一ドメイン外へのリンクは追わない
- サイトマップ・無限パス探索はしない

---

## 禁止する改善

| 禁止 | 理由 |
|------|------|
| 個人メール収集 | 安全ルール・法令・信頼性 |
| Gmail / Yahoo 等の個人利用ドメインを営業対象化 | 個人メール疑い |
| 非公開情報取得 | ログイン・会員限定ページ |
| ログインが必要なページ解析 | 同上 |
| 画像OCRでメール取得 | 誤検出・プライバシー |
| WHOIS等からのメール取得 | 同意・用途外 |
| SNS個人プロフィールからのメール取得 | 個人情報 |
| 大量クローリング | 負荷・ブロック・倫理 |
| 外部スクレイピング（Maps画面等） | 安全ルール違反 |
| Google Maps画面スクレイピング | 明示禁止 |

---

## 追加候補フィールド（Lead型拡張案）

**今回は設計のみ。Phase 20 実装時に Lead 型・DATA_SCHEMA を更新。**

```typescript
// 提案（実装時に確定）

emailCandidateConfidence?: number;        // 0〜1、最良候補の信頼度
emailCandidateSourceUrls?: string[];      // emailCandidates と同順 or 代表URL
emailContactType?: 'corporate' | 'generic' | 'personal_rejected' | 'unknown';
contactPathType?: 'email' | 'contact_form' | 'both' | 'none';
contactPathConfidence?: number;           // 0〜1
```

### emailContactType

| 値 | 意味 |
|----|------|
| `corporate` | 法人窓口（info@ 等）— Gmail下書き候補可 |
| `generic` | 形式は法人だがドメイン不明瞭 |
| `personal_rejected` | 個人疑いで **保存しない**（ログのみ可） |
| `unknown` | 判定不能 |

### contactPathType

| 値 | 意味 |
|----|------|
| `email` | emailCandidates のみ |
| `contact_form` | contactFormUrl のみ |
| `both` | 両方あり |
| `none` | 連絡導線なし → needs_review |

---

## 連絡導線の運用方針

Lead を連絡導線で分類し、**送信経路を人間が選ぶ**（自動送信はしない）。

| 分類 | 条件 | 推奨運用 | Gmail下書き |
|------|------|----------|-------------|
| **emailあり** | `emailCandidates.length > 0` | Gmail下書き or 手動メール | ✅ 候補（approved時） |
| **問い合わせフォームのみ** | email なし + `contactFormUrl` あり | 下書き候補UIで **件名・本文・URLをコピー** | ❌ 対象外 |
| **email + form 両方** | 両方あり | Gmail下書きもフォーム手動送信も可 | ✅ 候裡 |
| **連絡導線なし** | 両方なし | `needs_review` / 人間調査 | ❌ |
| **個人メールのみ** | 検出したが拒否 | 保存しない / `high` risk | ❌ |

### UI / 分析との整合

- **連絡導線分析**（`buildContactPathAnalytics`）で集計継続
- `emailCandidateRate` が 0% でも **contactFormRate 100%** なら運用可能
- Phase 18 以降、新規 Lead 取り込み後に **メールあり率を観察**（目標値は設けず、改善効果の観測のみ）

---

## Phase 19 への接続

Gmail下書き実作成テストに進むには:

1. 本計画に基づく day1 改善 **または** 手動で `emailCandidates` あり Lead を1件以上用意
2. `humanReviewStatus=approved`, `sendStatus=not_sent`
3. `npm run growly-sales:gmail-create-drafts`（`CREATE_DRAFTS` 必須）

問い合わせフォームのみ Lead は引き続き **コピー運用が正** です。

---

## 実装フェーズ

| Phase | 内容 | 状態 |
|-------|------|------|
| 18-lite | 設計書 | ✅ |
| **20-lite** | **day1 コレクター実装** | **✅ 完了** |
| 18 | 外部候補 fetch | 次 |
| 19 | Gmail下書き実作成 | emailあり3社で可能 |

---

## 関連ドキュメント

- `docs/GROWLY_SALES_SAFETY_RULES.md` — 許可メールprefix・禁止事項
- `docs/GROWLY_SALES_DATA_SCHEMA.md` — Lead型（将来拡張）
- `docs/GROWLY_SALES_WORKFLOW.md` — day1 ワークフロー
- `src/growly-sales/analytics/buildContactPathAnalytics.ts` — 現行集計
