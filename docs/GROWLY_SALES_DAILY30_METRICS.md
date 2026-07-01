# Growly Sales — Daily 30 / ダッシュボード数値定義（Phase 38.4）

## 候補収集タブ（Daily 30）

| 表示 | 定義 |
|------|------|
| 収集時メール取得 X / 30 | `emailFoundAtCollection` — GCS cloud-run state の `emailFound`。Lead化承認・除外後も**減らない**。 |
| Lead化承認待ち | `leadApprovalPendingCount` — 当日 batch で `isDaily30LeadApprovalPending`（email_found・未取り込み・excluded でない）。 |
| Lead化承認済み | `leadApprovalApprovedCount` — `importStatus=approved_for_lead` かつ human excluded でない。 |
| 営業文生成済 | `copyGeneratedCount` — `copyGeneratedAt` あり かつ human excluded でない。 |
| 下書き取り込み待ち | `draftImportPendingCount` — `ready_for_draft` + `approved_for_lead` + 未 import + excluded でない。 |
| 除外済み | `humanExcludedCount` — excluded 系フィールドのいずれかに該当。 |
| 総収集候補 | `totalCollectedAtCollection` — GCS state の収集 run 時点。除外後も**減らない**。 |
| フォームのみ / 導線なし | GCS state または batch metrics から（除外後も収集時 KPI は維持）。 |

## ダッシュボード（Lead / 送信）

| 表示 | 定義 |
|------|------|
| 承認待ち | leads の `humanReviewStatus=pending` または Daily 30 の Lead化承認待ち（文脈による）。 |
| 下書き候補 | Gmail 下書き候補タブの Lead（`selectGmailDraftTabLeads`）。 |
| 下書き可 | `selectGmailDraftCreationTargets` — CREATE_DRAFTS 可能な Lead。 |
| 送信済み | `sendStatus=manual_sent` または `sent`。**draft 作成済み not_sent は含めない**。 |
| 返信待ち | 送信済みで返信未確認（`isAwaitingReplyLead`）。 |

## 除外候補

論理削除のみ。以下いずれかで通常一覧から非表示:

- `pipelineStatus === 'excluded'`
- `importStatus === 'excluded'`
- `humanReviewStatus === 'rejected'`
- `excludedAt` あり
- `excludedBy === 'human'`

保存先: `GROWLY_STORAGE_BACKEND` に従う `external-candidates.json`（GCS または local）。

## Phase 40.2: batchId・収集プロファイル

| 項目 | 定義 |
|------|------|
| batchId（新規） | JST `YYYY-MM-DD`（`todayBatchIdJst`） |
| 収集時メール取得 | 上記 batchId でフィルタ（既存 UTC batchId もそのまま参照可） |
| collectionProfile | 候補・Lead の optional フィールド。発見元（discovery）とメール取得元（email）は分離 |

### Phase 40.5: schedule 実行反映

- `resolveDaily30CollectionSchedule.ts` — oneDay / next / active / fallback
- `areasUsed` を cloud-run-state に保存
- 求人サイト等は warning のみ（巡回は Phase 40.6）

詳細: `docs/GROWLY_SALES_COLLECTION_PROFILE_SCHEMA.md`
