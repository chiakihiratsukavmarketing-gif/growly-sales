# Growly Sales — メール運用基盤強化（Phase 43）

> **正本:** 本ドキュメントが Phase 43（開封計測・配信停止・カスタムメール）の仕様正本です。  
> **Phase 43.1 状態:** 設計・既存調査・mock/live 境界の確定のみ。DDL / env / 公開 URL / Cloud 変更は未実施。

---

## 0. 進行

| Phase | 内容 | 状態 |
|-------|------|------|
| **43.1** | 基準線・データ構造・安全要件 | **本ドキュメント** |
| 43.2 | 配信停止リンク・配信禁止企業管理 | 未着手 |
| 43.3 | 営業メールのカスタムテンプレート | 未着手 |
| 43.4 | 開封計測・開封率表示 | mock 完了 |

**公開順（live 化）:** ①配信停止 → ②カスタムメール → ③開封計測  
配信停止チェックが live 完了するまで、新メール生成・下書きへの自動適用は **live 化しない**。

---

## 0.1 テナント方針（Phase 44.1 で準備）

- **現在:** single tenant deployment（自社運用）
  - `tenantId = want-reach`
  - 公開サブドメイン候補: `mailops.wantreach.jp`
- **将来:** multi-tenant SaaS へ移行可能
  - tenant resolver / public URL resolver / store interface を経由
  - 共通 Growly ドメインまたは顧客独自ドメインへ交換可能

---

## 1. 現行営業ルート（固定仕様・変更禁止）

```
候補収集（FETCH_DAILY_30）
  → Human Approval による Lead 化
  → AI 営業文生成（GENERATE_DAILY_30_COPY）
  → 人間による確認・カスタム（UI / 手修正）
  → Gmail 下書き候補化（IMPORT_DAILY_30_DRAFT_CANDIDATES）
  → Gmail 下書き作成（CREATE_DRAFTS / users.drafts.create のみ）
  → Gmail で人間が手動送信（Growly Sales は送信しない）
  → 送信記録（record-manual-gmail-sent）
  → 返信・フォローアップ管理
```

### 1.1 絶対維持する安全ルール

| ルール | 根拠 |
|--------|------|
| Gmail 自動送信禁止 | `users.messages.send` / `users.drafts.send` 不使用 |
| Human Approval 省略禁止 | ゲート: Lead化 / 下書き候補 / CREATE_DRAFTS |
| 既存 Lead・候補・送信記録の削除禁止 | ローカル JSON / GCS 上書き削除なし |
| 配信停止企業への下書き生成禁止 | Phase 43.2 で suppression チェックを挿入 |
| 開発中機能の本番送信への自動適用禁止 | feature flag + mock/live 分離 |
| 生トークン・secret の保存・表示禁止 | hash のみ永続化 |

### 1.2 既存の近似機能（Phase 43 との関係）

| 既存 | 場所 | Phase 43 との差分 |
|------|------|-------------------|
| `Lead.doNotContact` | `types/lead.ts` | Lead 単位フラグ。**メールアドレス単位の配信禁止リストではない** |
| `sendStatus: blocked` | `types/lead.ts` | レビュー拒否等。**配信停止リンク由来ではない** |
| `isInitialOutreachEligible` | `outreach/outreachEligibility.ts` | `doNotContact` を参照。**suppression テーブル未参照** |
| `getGmailDraftExclusionReason` | `integrations/gmail/selectGmailDraftCandidates.ts` | 下書き除外理由。**配信停止未連携** |
| 固定署名・CTA | `generation/generateSalesEmail.ts` | コード内ハードコード。**テンプレート編集 UI なし** |

Phase 43 では **suppression を正規の配信禁止ソース**とし、既存 `doNotContact` は互換のまま維持（suppression active 時に同期可・削除しない）。

---

## 2. 通常運用で維持する記録（WORK_LOG 区分）

毎回の通常営業運用ログに記録する項目（開発ログで上書きしない）:

| 項目 | 取得元（現行） |
|------|----------------|
| 収集件数 | `dashboard.totalCollectedAtCollection` / 詳細パネル「全収集」 |
| メール営業候補数 | `dashboard.emailFoundAtCollection` |
| Lead 化承認件数 | 当日 `leadApprovalApprovedCount` 増分（手動記録可） |
| 営業文作成件数 | `copyGeneratedCount` / 候補 `copyGeneratedAt` |
| Gmail 下書き候補数 | `gmailDraftCandidateCount` / draft-candidates API |
| Gmail 手動送信件数 | `manualSentCount` / `sendStatus=manual_sent` |
| 返信件数 | `replyStatus` が replied 系 |
| 配信停止件数 | Phase 43.2 以降 `suppressions` active 件数（現状は `doNotContactCount` を参考） |
| フォローアップ件数 | `followUpTargetCount` |
| 運用上の詰まり | 自由記述 |

---

## 3. 機能 A — 配信停止・配信禁止企業管理

### 3.1 データモデル（案）

**永続化ファイル（新規・案）:** `data/growly-sales/mail-suppressions.json`

```typescript
interface MailSuppressionRecord {
  suppressionId: string;          // UUID
  companyId: string | null;       // 将来: 安定 company key（website host 等）
  leadId: string | null;
  emailAddress: string;           // 表示用（正規化前の記録は避け、normalized を主キー候補に）
  normalizedEmail: string;        // 小文字 trim
  status: MailSuppressionStatus;
  reason: string;                 // 表示用短文（例: 本人による配信停止）
  source: MailSuppressionSource;
  unsubscribedAt: string | null;  // ISO8601
  createdAt: string;
  updatedAt: string;
  tokenHash: string | null;       // 生トークンは保存しない（SHA-256 + pepper）
  lastAttemptBlockedAt: string | null;
  // 解除監査（Human Approval 必須）
  reactivatedAt?: string | null;
  reactivatedBy?: 'human' | null;
  reactivationMemo?: string | null;
}

type MailSuppressionStatus =
  | 'active'
  | 'unsubscribed'
  | 'manually_blocked'
  | 'invalid_address'
  | 'complaint'
  | 'legal_block';

type MailSuppressionSource =
  | 'unsubscribe_link'
  | 'manual_ui'
  | 'import'
  | 'reply_opt_out'
  | 'legal';
```

**インデックス（アプリ内）:** `normalizedEmail` → record、`leadId` → record[]

**冪等性:** 同一 `normalizedEmail` で `active` が既にあれば、再クリックは成功画面を返し件数は増やさない（`updatedAt` のみ更新可）。

### 3.2 停止リンク設計（live は人間承認後）

**メール末尾（案）:**

```text
配信停止をご希望の場合はこちら
{PUBLIC_BASE_URL}/u/{opaqueToken}
```

**トークン設計（Phase 43.1）:**

| 項目 | 方針 |
|------|------|
| 形式 | URL-safe random 32+ bytes → base64url（生値はメールにのみ埋め込み） |
| 保存 | `tokenHash = HMAC-SHA256(pepper, token)` または SHA-256(salt+token) |
| ペイロード | `leadId` + `normalizedEmail` + `sentMessageRef`（将来）をサーバー側で token→send レコードに解決 |
| 有効期限 | 設計案: 無期限だが rotate 可能。失効は suppression を `legal_block` に |
| ログ | 生 token・Authorization ヘッダを **ログに出さない** |

**公開 endpoint（live・未作成）:**

| Method | Path | 用途 |
|--------|------|------|
| GET | `/u/{token}` | 停止確認画面 → POST で確定 |
| POST | `/u/{token}/confirm` | 停止実行（冪等） |

**Mock endpoint（Phase 43.2・ローカル UI のみ）:**

| Method | Path | 用途 |
|--------|------|------|
| GET | `/api/mock/unsubscribe/preview` | UI プレビュー用固定 HTML |
| POST | `/api/mock/suppressions` | メモリ or `_verify_` JSON のみ（本番 GCS 非接触） |

**画面:**

| 状態 | 表示 |
|------|------|
| 成功 | 「配信を停止しました」+ 会社名（マスク可） |
| 期限切れ / 無効 | 「リンクが無効です」+ 問い合わせ先（署名メール） |
| 既に停止済み | 成功と同様（冪等） |

### 3.3 配信禁止チェック挿入点

以下の **直前** に `assertNotSuppressed({ leadId, email })` を挿入（Phase 43.2 実装）:

| 処理 | ファイル候補 |
|------|----------------|
| 営業文生成（Daily 30） | `candidates/generateDaily30SalesCopy.ts` / `runDaily30GenerateCopy` 経路 |
| 営業文生成（Lead） | `generation/applyFullGeneration.ts` |
| Gmail 下書き候補化 | `drafts/selectDraftCandidates.ts` / `buildUiDraftCandidates.ts` |
| Gmail 下書き作成 | `integrations/gmail/createGmailDraftForLead.ts`（要確認） |
| フォローアップ候補化 | `outreach/outreachEligibility.ts` / Follow-up ビュー |
| 再送候補化 | `outreach/outreachPolicy.ts` |

**ブロック時 UI 表示（案）:**

```text
配信禁止：本人による配信停止
停止日時：2026-07-06 10:00
```

### 3.4 管理 UI（設計）

**配置:** 設定タブ → 「配信禁止リスト」（または専用タブ `suppressions`）

| 機能 | 要件 |
|------|------|
| 一覧 | 会社名・メール・理由・停止日時・自動/手動 |
| 検索 | 会社名・メールアドレス |
| 手動追加 | Human Approval + 理由必須 |
| 解除 | **Human Approval 必須** + メモ必須 |

---

## 4. 機能 B — 営業メールのカスタムテンプレート

### 4.1 方針

- 人間が **骨格（固定ブロック）** を編集
- AI が **企業別パーツ** を生成
- 保存後も **既存 Lead の emailSubject/emailBody は上書きしない**
- **次回 `generateSalesEmail` / Daily30 生成から** 新テンプレート適用

### 4.2 ブロックモデル（案）

**永続化:** `data/growly-sales/outreach-templates.json` + `config/growly-sales/outreach-template-defaults.json`（初期値）

```typescript
interface OutreachTemplateVersion {
  templateId: string;
  version: number;
  name: string;
  enabled: boolean;
  createdAt: string;
  createdBy: 'human' | 'system';
  blocks: OutreachTemplateBlocks;
  constraints: OutreachTemplateConstraints;
}

interface OutreachTemplateBlocks {
  subjectTemplate: string;       // 人間固定: "{{companyName}}様向け｜..."
  greeting: string;              // 人間固定
  aiIntroSlot: 'ai';             // AI: customOpening / personalization
  companyIntro: string;          // 人間固定（自社紹介）
  proposal: string;              // 人間固定
  proof: string;                 // 人間固定（実績）
  cta: string;                   // 人間固定骨格 + AI CTA 差し込み可
  signature: string;             // 人間固定（現 buildSalesEmailSignature 相当）
  unsubscribeNotice: string;     // 人間固定（配信停止案内・リンクプレースホルダ）
  disclaimer: string;            // 人間固定
}

interface OutreachTemplateConstraints {
  bannedPhrases: string[];
  maxBodyChars: number;
  tone: 'formal' | 'plain';
  ctaStyle: 'reply_hope' | 'link' | 'meeting';
}
```

**AI スロット（生成時マージ）:**

| キー | 内容 |
|------|------|
| companyName | Lead / 候補から |
| companySummary | `companyAnalysis` 要約 |
| personalizationPoint | customHook 由来 |
| proposalAngle | `salesAngle` |
| websiteObservation | signals 由来 |
| subjectSuggestion | オプション（件名は原則テンプレート優先） |
| customOpening | 冒頭 AI 文 |
| customCTA | CTA 内差し込み |

### 4.3 UI（設定タブ）

**「営業メールテンプレート」セクション:**

- テンプレート名・有効/無効
- ブロック別エディタ（AI 変更可部分は背景色で明示）
- 下書き保存 / プレビュー / テスト企業で AI プレビュー
- 初期状態へ戻す / バージョン履歴 / 現在使用中表示

**Human Approval:** 有効テンプレートの「本番適用」切替時

### 4.4 変更対象（実装時）

| ファイル | 変更内容 |
|----------|----------|
| `generation/generateSalesEmail.ts` | テンプレートブロックから本文組み立て |
| `candidates/generateDaily30SalesCopy.ts` | 同上 |
| `review/reviewSalesEmail.ts` | 禁止表現・最大文字チェックに constraints 連携 |
| `ui/SettingsView.tsx` | テンプレート UI |
| `config/paths.ts` | `getOutreachTemplatesPath()` 追加 |
| `server/uiServer.ts` | CRUD API（mock → live） |

---

## 5. 機能 C — 開封計測

### 5.1 方針

- 各送信メールに **推測困難な tracking ID** を付与した 1x1 画像（または同等）を **下書き本文に人間確認後に挿入**
- Growly Sales は **送信しない** ため、計測画像は **Gmail 下書き作成時** に MIME に追加（Phase 43.4）
- 開封率は **参考値**。返信率・商談化と併記し、唯一の KPI にしない

### 5.2 イベントモデル（案）

**ファイル:** `data/growly-sales/email-open-events.json`（append-only イベントログ）  
**集計:** `email-send-tracking.json`（送信単位の集約）

```typescript
interface EmailSendTrackingRecord {
  emailMessageId: string;       // 内部 ID（leadId + send 回数 + draftId 等）
  leadId: string;
  companyId: string | null;
  trackingTokenHash: string;    // 生 token 非保存
  sentAt: string;
  firstOpenedAt: string | null;
  lastOpenedAt: string | null;
  openCount: number;
  rawEventCount: number;
  uniqueOpenCount: number;      // privacy proxy 疑いで dedupe 後
  userAgentCategory: 'gmail_proxy' | 'apple_mpp' | 'desktop' | 'mobile' | 'unknown';
  privacyProxySuspected: boolean;
}

interface EmailOpenEvent {
  eventId: string;
  trackingTokenHash: string;
  receivedAt: string;
  userAgent: string;              // 短縮保存可
  userAgentCategory: string;
  // IP は原則保存しない（設計上省略）
}
```

### 5.3 公開 endpoint（live・未作成）

| Method | Path | 備考 |
|--------|------|------|
| GET | `/t/{token}.gif` | 1x1 transparent GIF、204/200、冪等カウント |

**Mock（Phase 43.4）:**

- `POST /api/mock/open-events` — UI 開発用イベント注入
- SendRecordsView に「未開封/開封済み」バッジの **静的モック表示**

### 5.4 UI 追加（設計）

**送信記録 (`SendRecordsView.tsx`):**

- 未開封 / 開封済み
- 初回・最終開封日時、開封回数
- 「参考開封率」注記

**ダッシュボード (`SalesDashboardView.tsx`):**

- 送信数 / 計測可能数 / 開封済み数 / 参考開封率
- 返信率・配信停止率（既存 metrics 拡張）

**プライバシー表示:** 計測不能（画像オフ・プロキシ）の説明を UI に常記

---

## 6. 既存コード調査 — 変更対象候補（ファイル単位）

### 6.1 Gmail 下書き

| ファイル | 役割 |
|----------|------|
| `integrations/gmail/gmailDraftAdapter.ts` | `users.drafts.create` |
| `integrations/gmail/createGmailDraftForLead.ts` | Lead 単位下書き作成 |
| `integrations/gmail/selectGmailDraftCandidates.ts` | 候補選定・除外理由 |
| `integrations/gmail/previewGmailDrafts.ts` | dry-run |
| `integrations/gmail/createDraftsGate.ts` | CREATE_DRAFTS ゲート |
| `ui/GmailDraftCandidatesView.tsx` | 下書き候補 UI |
| `ui/GmailDraftCreateDialog.tsx` | 作成確認 |

### 6.2 営業文生成

| ファイル | 役割 |
|----------|------|
| `candidates/generateDaily30SalesCopy.ts` | Daily30 営業文 |
| `generation/generateSalesEmail.ts` | 件名・本文テンプレート本体 |
| `generation/applyFullGeneration.ts` | Lead 一括生成 |
| `candidates/qualityCheckDaily30Copy.ts` | 品質チェック |
| `review/reviewSalesEmail.ts` | レビュー |

### 6.3 送信記録・返信・フォロー

| ファイル | 役割 |
|----------|------|
| `workflow/recordManualGmailSent.ts` | 手動送信記録 |
| `ui/SendRecordsView.tsx` | 送信記録 UI |
| `ui/ManualSendRecordDialog.tsx` | 記録ダイアログ |
| `ui/ReplyManagementView.tsx` | 返信管理 |
| `ui/FollowUpDashboardView.tsx` | フォローアップ |
| `outreach/outreachPolicy.ts` | 推奨アクション・除外 |
| `outreach/outreachEligibility.ts` | 初回 outreach 可否 |

### 6.4 設定・サーバー・ストレージ

| ファイル | 役割 |
|----------|------|
| `ui/SettingsView.tsx` | 設定タブ |
| `server/uiServer.ts` | ローカル API 一式 |
| `config/paths.ts` | データパス |
| `storage/loadLeadsForApi.ts` | Lead 読み込み |
| `config/storageBackend.ts` | local / GCS |
| Cloud: `candidates/runDaily30CloudAutoFetch.ts` | GCS 候補（**Phase 43 では変更しない**） |

### 6.5 新規モジュール（Phase 43.2+ 案）

```
src/growly-sales/mail-operations/
  suppressionTypes.ts
  suppressionStore.ts
  suppressionCheck.ts
  unsubscribeToken.ts
  outreachTemplateTypes.ts
  outreachTemplateStore.ts
  openTrackingTypes.ts
  openTrackingStore.ts
```

---

## 7. API / endpoint 一覧

### 7.1 現行（変更しない）

- `GET/POST /api/leads/*` — Lead CRUD・承認・送信記録
- `GET /api/gmail-draft-candidates` — 下書き候補
- `POST .../create-gmail-draft` — 下書き作成
- `GET /api/send-record-pending` — 送信記録待ち
- Daily30 系 `/api/daily30-*`

### 7.2 Phase 43 追加（mock → live）

| 優先 | Endpoint | Phase | Live 要承認 |
|------|----------|-------|-------------|
| 1 | `GET/POST /api/suppressions` | 43.2 mock | — |
| 1 | `POST /api/suppressions/check` | 43.2 | — |
| 1 | `GET /u/{token}` | 43.2 live | **要** |
| 2 | `GET/PUT /api/outreach-templates` | 43.3 mock | — |
| 2 | `POST /api/outreach-templates/preview` | 43.3 | — |
| 3 | `GET /t/{token}.gif` | 43.4 live | **要** |
| 3 | `POST /api/mock/open-events` | 43.4 mock | — |
| 3 | `GET /api/send-records/{leadId}/open-stats` | 43.4 | — |

---

## 8. mock と live の境界

| 層 | mock（43.1〜43.4 開発） | live（人間承認後） |
|----|-------------------------|-------------------|
| データ | `_verify_*` / メモリ / ローカル JSON のみ | `data/growly-sales/*.json` + GCS 同期方針は別途 |
| 公開 URL | なし（UI 内プレビュー） | `PUBLIC_BASE_URL` on Cloud Run |
| メール埋め込み | 下書きに **計測画像を付けない** | 下書き MIME に pixel 追加（CREATE_DRAFTS 後人間確認） |
| 配信停止リンク | プレースホルダテキストのみ | 実リンク生成 |
| Feature flag | `MAIL_OPS_MODE=mock`（案） | `MAIL_OPS_MODE=live` |

---

## 9. Human Approval ポイント

| # | 作業 | 理由 |
|---|------|------|
| 1 | 配信停止公開 URL・ドメイン・TLS | 外部公開 |
| 2 | Cloud Run / Load Balancer デプロイ | 本番 endpoint |
| 3 | env: `UNSUBSCRIBE_TOKEN_PEPPER`, `PUBLIC_BASE_URL` | secret |
| 4 | 配信禁止 **解除** | 法的・運用リスク |
| 5 | テンプレート「本番適用」 | 全社メール文言変更 |
| 6 | 開封計測 pixel の下書き埋め込み live 化 | プライバシー・同意 |
| 7 | GCS に suppression / open events 書き込み | 本番データ |

---

## 10. DDL / env / Cloud 変更候補（実行しない・候補のみ）

現行は **ローカル JSON + オプション GCS** のため RDB DDL は **Phase 43 では必須ではない**。将来 Supabase 等に移行する場合:

```sql
-- 参考（未適用）
CREATE TABLE mail_suppressions (...);
CREATE TABLE email_send_tracking (...);
CREATE TABLE email_open_events (...);
CREATE TABLE outreach_template_versions (...);
```

**env 候補（未設定）:**

| 変数 | 用途 |
|------|------|
| `PUBLIC_BASE_URL` | 停止・計測の公開基底 URL |
| `UNSUBSCRIBE_TOKEN_PEPPER` | トークン hash |
| `OPEN_TRACKING_TOKEN_PEPPER` | 計測 token hash |
| `MAIL_OPS_MODE` | `mock` \| `live` |
| `MAIL_OPEN_TRACKING_ENABLED` | `false` 既定 |

**Cloud 候補:** 公開用 Cloud Run サービス（既存 Daily30 fetch サービスとは **分離推奨**）

---

## 11. セキュリティリスク

| リスク | 対策 |
|--------|------|
| 生 unsubscribe token 漏洩 | hash のみ保存・ログマスク |
| トークン総当たり | 長い random・レート制限・失効 |
| 開封 pixel で受信者 IP 収集 | IP 非保存・UA カテゴリのみ |
| 配信停止なのに送信 | 全パイプライン入口で suppression check |
| 誤解除 | Human Approval + 監査ログ |
| Gmail 自動送信の誤実装 | 既存 `verifyNoSendCode` 維持 |
| テンプレート XSS | プレーンテキスト MIME のみ・HTML メールは Phase 43 外 |

---

## 12. 実装フェーズ分割（詳細）

| Step | 内容 | 依存 |
|------|------|------|
| 43.1 | 本ドキュメント・verify・WORK_LOG 分離 | — |
| 43.2a | suppression 型・store・check（mock） | 43.1 |
| 43.2b | 管理 UI mock・生成/下書き前チェック | 43.2a |
| 43.2c | 公開 unsubscribe（live） | 人間承認 |
| 43.3a | テンプレート store・デフォルト移植 | 43.1 |
| 43.3b | 設定 UI・プレビュー・次回生成から適用 | 43.3a |
| 43.4a | open event mock・SendRecords UI | 43.1 |
| 43.4b | 下書き MIME への pixel（live） | 43.2c 推奨 + 人間承認 |

---

## 13. Rollback 方針

| 層 | 手順 |
|----|------|
| Feature flag | `MAIL_OPS_MODE=mock` で即時無効化 |
| テンプレート | 前バージョンを `enabled` に戻す（Lead 本文は不変） |
| Suppression | live 停止後も **レコード削除せず** `status` 維持 |
| 公開 endpoint | Cloud Run リビジョン rollback |
| コード | git revert（データファイルは手動バックアップから復元可） |

---

## 14. 通常運用記録と開発記録の分離

- **`WORK_LOG.md`:** セクション `## 通常営業運用` と `## Phase 43開発` を分ける
- **`NEXT_TASKS.md`:** 通常運用タスクと Phase 43 サブタスクを分表
- **本ドキュメント:** 技術仕様のみ。日次の件数は WORK_LOG に記録し、ここでは上書きしない

---

## 15. Phase 43.1 完了条件チェックリスト

- [x] 現行営業ルート固定仕様
- [x] 3 機能のデータモデル案
- [x] UI 画面一覧
- [x] API / endpoint 案
- [x] mock / live 境界
- [x] Human Approval ポイント
- [x] DDL / env / Cloud 候補（未実行）
- [x] セキュリティリスク
- [x] 実装フェーズ分割
- [x] Rollback 方針
- [x] 記録分離方法
- [x] 既存コード調査・変更ファイル候補

**未実施（意図的）:** DDL 適用、env 変更、公開 URL、Cloud デプロイ、Gmail 操作、データ削除

---

*最終更新: 2026-07-06（Phase 43.1）*
