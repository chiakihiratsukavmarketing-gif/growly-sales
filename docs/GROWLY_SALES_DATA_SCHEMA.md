# Growly Sales データスキーマ

## Lead型

**定義ファイル**: `src/growly-sales/types/lead.ts`

### 基本情報

| フィールド | 型 | 必須 | 説明 |
|------------|-----|------|------|
| id | string | ✅ | UUID形式の一意ID |
| companyName | string | ✅ | 会社名 |
| area | string | ✅ | 地域（例: 宮城県仙台市） |
| industry | string | ✅ | 業種（工務店/注文住宅/リフォーム等） |
| websiteUrl | string | ✅ | 公式サイトURL |

### 収集情報

| フィールド | 型 | 説明 |
|------------|-----|------|
| instagramUrl | string \| null | Instagram URL |
| emailCandidates | string[] | 法人窓口メール候補（Gmail下書き用） |
| emailCandidateSourceUrls | string[] | メール検出元URL |
| emailCandidateConfidence | enum | low / medium / high |
| emailContactType | enum | corporate / generic / personal_rejected / unknown |
| contactPathType | enum | email / contact_form / both / none |
| contactPathConfidence | enum | low / medium / high |
| contactFormUrl | string \| null | 問い合わせフォームURL（コピー運用） |
| recruitUrl | string \| null | 採用ページURL |
| caseStudyUrl | string \| null | 施工事例ページURL |
| companyProfileUrl | string \| null | 会社概要ページURL |
| sourceUrls | string[] | 取得元URL（必須・空不可） |

### スコアリング・営業

| フィールド | 型 | 許可値 |
|------------|-----|--------|
| leadScore | enum | A, B, C, UNKNOWN |
| salesAngle | string | 営業切り口テキスト |
| companyAnalysis | string | 企業分析文 |
| customHook | string | 個別フック |
| hookSourceType | string | フック生成の主ソース種別（case_study / instagram / recruit 等） |
| hookSourceUrl | string \| null | フック生成の参照URL |
| customHookReason | string | フック生成理由（デバッグ・レビュー用） |
| gmailDraftStatus | GmailDraftStatus | none / previewed / draft_created / failed / skipped |
| gmailDraftId | string \| null | Gmail下書きID（draft_created時） |
| gmailDraftCreatedAt | string \| null | Gmail下書き作成日時 |
| gmailDraftError | string | 作成失敗時のエラー |
| gmailDraftPreviewedAt | string \| null | preview実行日時（将来用） |

**Gmail下書き作成後も sendStatus は not_sent のまま。** emailCandidates がないLeadは Gmail下書き対象外。

| emailSubject | string | 営業メール件名 |
| emailBody | string | 営業メール本文 |

### レビュー・ステータス

| フィールド | 型 | 許可値 / 初期値 |
|------------|-----|----------------|
| reviewStatus | enum | pending, approve, revise, reject |
| reviewComment | string | 校閲コメント |
| nextAction | string | 次アクション |
| collectionStatus | enum | pending, collected, failed, needs_review |
| humanReviewStatus | enum | pending, approved, rejected, **needs_revision** |
| sendStatus | enum | not_sent, **manual_sent**, draft, sent, **blocked** |
| replyStatus | enum | none, no_reply, replied, interested, not_interested, meeting_scheduled, follow_up_needed, bounced |
| manualSentAt | string \| null | 手動送信記録日時（ISO） |
| manualSendMethod | enum \| null | contact_form, email, instagram_dm, other |
| replyReceivedAt | string \| null | 返信受領日時（ISO） |
| replyMemo | string | 返信メモ |
| followUpDate | string \| null | フォロー予定日（YYYY-MM-DD） |
| followUpMemo | string | フォローメモ |
| dealStatus | enum | none, open, won, lost, paused |
| outcomeMemo | string | 結果メモ（受注/失注など） |
| communicationMemo | string | 通信メモ（自由記述） |
| doNotContact | boolean | false（初期） |
| riskLevel | enum | low, medium, high |

### メタ

| フィールド | 型 | 説明 |
|------------|-----|------|
| createdAt | string (ISO8601) | 作成日時 |
| updatedAt | string (ISO8601) | 更新日時 |

## 入力CSV（input-sites.csv）

```csv
companyName,area,industry,websiteUrl
```

## 出力JSON（leads.json）

```json
{
  "leads": [ /* Lead[] */ ],
  "updatedAt": "2026-06-25T00:00:00.000Z"
}
```

## 出力CSV（leads.csv）

Lead型の全フィールドをフラット化。配列フィールドは `;` 区切り。

## 外部候補（external-candidates.json / .csv）— Phase 17

外部APIで取得した営業候補。**直接 leads.json には書き込まない。**

| フィールド | 型 | 説明 |
|------------|-----|------|
| externalCandidateId | string (UUID) | 候補ID |
| sourceType | enum | google_places / web_search / manual |
| companyName | string | 会社名 |
| area | string | 地域 |
| industry | string | 業種 |
| websiteUrl | string \| null | 公式サイト（なし→needs_review） |
| phoneNumber | string \| null | 保存可・営業送信には使わない |
| importStatus | enum | preview / approved_for_import / imported / skipped / duplicate / needs_review |
| sourceQuery | string | 検索クエリ |
| confidenceScore | number | 0〜1 |
| duplicateReason | string | 重複理由 |

取り込みフロー: UI個別承認 → `approved_for_import` → CLI → `input-sites.csv` 追記 → day1

### Phase 41.5H / 41.5H-2: sourceCompliance 永続化

GCS 生 JSON の `sourceComplianceStatus` / `sourceComplianceNote` を `evaluateSourceCompliance()` 結果と照合。

| フィールド | 永続化対象 | 備考 |
|------------|------------|------|
| sourceComplianceStatus | ✅（41.5H-2 apply済） | `official_site_verified` 等 |
| sourceComplianceNote | ✅（41.5H-2 apply済） | ブロック理由の補足 |
| sourceComplianceCheckedAt | ✅（41.5H-2 apply済） | ISO 8601・optional |

**コマンド:**
- dry-run: `npm run growly-sales:phase415h-compliance-dry-run`
- apply（人間承認必須）: `npm run growly-sales:phase415h-compliance-apply -- --apply --confirm=APPLY_COMPLIANCE_REFRESH`

### Phase 41.5J: Cloud Run state supplement フィールド

`daily30-cloud-run-state.json` の `runs[batchId]` に保存:

| フィールド | 例（2026-07-03） |
|------------|------------------|
| externalReferenceSupplementAttempted | `false` |
| externalReferenceSupplementMode | `not_applicable` |
| externalReferencePlanReason | `not_reference_discovery_source` |
| externalReferenceNetworkAccessPerformed | `false` |
| externalReferenceManualCandidatesAvailable | `4` |
| externalReferenceManualCandidatesEligible | `4` |
| externalReferenceDisplayMessage | 文言あり |

### Phase 40.2: 収集プロファイル（optional）

候補・Lead に共通の optional フィールド。詳細は `docs/GROWLY_SALES_COLLECTION_PROFILE_SCHEMA.md`。

| フィールド | 説明 |
|------------|------|
| collectionProfileId / collectionProfileName | 収集プロファイル識別 |
| collectionMode | auto_continue 等 |
| industryCategory / areaStrategy | 業種・エリア戦略 |
| discoverySource / discoverySourceUrl | **企業発見元**（求人サイト等はこちら） |
| emailCandidateSourceUrl(s) | **メール確認元**（公式サイトのみ） |
| collectionBatchId / collectionRunId | 日次バッチ・実行 ID |

**batchId:** 新規 run は JST `YYYY-MM-DD`（`todayBatchIdJst()`）。既存 UTC batchId は維持。

### Phase 40.4: UI 表示・フィルター

- `resolveCollectionProfileDisplay.ts` — ラベル解決・フィルター一致・後方互換
- Lead / 候補 / 下書き / 送信記録で `discoverySourceUrl` と `emailSourceUrl` を分離表示
- 既存 Lead は optional フィールド未設定でも一覧から消えない

### daily30-collection-schedule.json（Phase 40.2）

次回収集設定用。`daily30-cloud-run-state.json` とは別ファイル。未存在時は `daily30-housing-auto` にフォールバック。

## 実行ログ（run-log.json）

```json
{
  "runAt": "ISO8601",
  "inputFile": "path",
  "processed": 0,
  "added": 0,
  "skippedDuplicates": 0,
  "failed": 0,
  "errors": []
}
```

## 重複判定キー

```
normalize(companyName) + normalize(websiteUrl) + sort(emailCandidates).join(";")
```

## 送信対象判定（将来）

```typescript
function isSendEligible(lead: Lead): boolean {
  return (
    lead.humanReviewStatus === 'approved' &&
    lead.reviewStatus === 'approve' &&
    lead.doNotContact === false &&
    lead.sendStatus === 'not_sent'
  );
}
```

Day 1では送信処理自体が存在しない。

## TargetProfile（config/growly-sales/targets/*.json）

| フィールド | 型 | 説明 |
|------------|-----|------|
| targetId | string | プロファイルID（例: housing） |
| targetName | string | 表示名 |
| industries | string[] | 対象業種キーワード |
| defaultAreas | string[] | デフォルト地域 |
| searchKeywords | string[] | API検索用キーワード（将来） |
| highPrioritySignals | string[] | 高優先シグナル |
| mediumPrioritySignals | string[] | 中優先シグナル |
| lowPrioritySignals | string[] | 低優先シグナル |
| avoidTargets | string[] | 避けるべき対象 |
| preferredContactMethods | string[] | 推奨連絡手段 |
| scoringNotes | string | スコアリングメモ |

## OfferProfile（config/growly-sales/offers/*.json）

| フィールド | 型 | 説明 |
|------------|-----|------|
| offerId | string | オファーID（例: sns-operation） |
| offerName | string | サービス名 |
| entryOffer | string | 入口オファー（無料診断等） |
| mainValue | string | 提供価値 |
| targetGoals | string[] | 目標（来場予約等） |
| salesAngles | string[] | 営業切り口候補 |
| ctaPattern | string | CTA文言パターン |
| prohibitedClaims | string[] | 禁止表現 |
| emailTone | string | メールトーン |

## API Adapter（Day2前半: disabled）

- `placesAdapter.searchPlaces()` — 本番未接続、mock/disabled 返却
- `webSearchAdapter.searchWeb()` — 同上
- `env.ts` — `API_PRODUCTION_ENABLED=false` 固定

## 営業生成（Phase 5〜9）

`npm run growly-sales:generate` が各 Lead に以下を付与:

| フィールド | 内容 |
|------------|------|
| leadScore | A/B/C/UNKNOWN |
| salesAngle | 営業切り口 |
| companyAnalysis | 企業分析文（テンプレート） |
| customHook | メール冒頭フック |
| emailSubject / emailBody | 営業メール |
| reviewStatus | approve / revise / reject |
| reviewComment / nextAction | 校閲結果 |

生成後も `humanReviewStatus=pending`, `sendStatus=not_sent` を維持。

## 人間承認UI（Phase 10）

`npm run growly-sales:ui` でローカルダッシュボードを起動。

| 操作 | 関数 | 更新フィールド |
|------|------|----------------|
| 承認する | `approveLeadForDraft` | humanReviewStatus=approved, sendStatus=**not_sent** |
| 修正が必要 | `markLeadNeedsRevision` | humanReviewStatus=needs_revision |
| 却下する | `rejectLead` | humanReviewStatus=rejected |
| 連絡禁止 | `markDoNotContact` | doNotContact=true, sendStatus=blocked |
| メール編集 | `updateLeadEmailDraft` | emailSubject, emailBody, updatedAt |

```typescript
function isDraftCandidate(lead: Lead): boolean {
  return (
    lead.humanReviewStatus === 'approved' &&
    !lead.doNotContact &&
    lead.sendStatus !== 'blocked' &&
    lead.sendStatus !== 'sent'
  );
}
```

承認は下書き候補であり、送信許可ではない。Gmail下書き作成は未実装。

## 下書きエクスポート（Phase 11A）

`npm run growly-sales:export-drafts` で手動コピー用ファイルを出力。

### 出力先

| ファイル | 内容 |
|----------|------|
| `drafts/draftCandidates.json` | 候補Leadの全フィールド + excluded |
| `drafts/draftCandidates.csv` | スプレッドシート用 |
| `drafts/draft-copy.txt` | 手動コピー用（1社ごとブロック） |

### エクスポート対象条件

`selectDraftCandidates` が以下をすべて満たすLeadのみ抽出:

- humanReviewStatus=approved, reviewStatus=approve, sendStatus=not_sent
- doNotContact=false, riskLevel=low|medium
- emailSubject/emailBody 非空、問い合わせ手段あり
- 禁止表現・文字化けなし、sourceUrls 非空

export は leads.json を**変更しない**（sendStatus 維持）。

## 下書き候補UI（Phase 11A-2）

| API | 内容 |
|-----|------|
| `GET /api/draft-candidates` | candidates, excludedCount, generatedAt |
| `POST /api/export-drafts` | ファイル再生成（sendStatus 不変） |

UIコピー操作も sendStatus を変更しない。Gmail API は使用しない。

パス解決は `config/paths.ts` の `getLeadsJsonPath()` を使用（cwd 非依存）。
