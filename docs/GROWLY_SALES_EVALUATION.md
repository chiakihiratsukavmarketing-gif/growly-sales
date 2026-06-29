# Growly Sales 評価基準

## verifyスクリプト検証項目

`npm run growly-sales:verify` が以下をすべて検証します。

| # | 検証項目 | 合格基準 |
|---|----------|----------|
| 1 | Lead型必須項目 | 全必須フィールド存在 |
| 2 | JSON保存 | leads.jsonに読み書き可能 |
| 3 | CSV保存 | leads.csvに読み書き可能 |
| 4 | 重複排除 | 同一Leadが1件のみ残る |
| 5 | sourceUrls | 空配列でない |
| 6 | leadScore | A/B/C/UNKNOWN のみ |
| 7 | reviewStatus | pending/approve/revise/reject のみ |
| 8 | humanReviewStatus | pending/approved/rejected/**needs_revision** のみ |
| 9 | doNotContact | trueのLeadは送信対象外 |
| 10 | 個人メール | 許可prefix以外が保存されていない |
| 11 | 自動送信 | 送信処理コードが存在しない |
| 12 | Gmail送信 | Gmail API呼び出しが存在しない |
| 13 | companyProfileUrl | SNSドメイン（Facebook等）が入っていない |
| 14 | contactFormUrl | /reform /works /about 等の非問い合わせURLが入っていない |
| 15 | instagramUrl | Instagram URL のみ（他SNSは不可） |
| 16 | URL分類ルール | 単体テスト（Facebook=/reform 除外等） |
| 17 | 企業分析生成 | 日本語テンプレートで companyAnalysis |
| 18 | 個別フック | 日本語 customHook |
| 19 | 営業メール | emailSubject / emailBody 生成 |
| 20 | 校閲 | approve/revise/reject、禁止表現で reject |
| 21 | 生成後ステータス | sendStatus=not_sent, humanReviewStatus=pending |
| 22 | API | 本番接続 disabled |
| 23 | 承認ワークフロー | approveLeadForDraft で sendStatus=not_sent 維持 |
| 24 | 連絡禁止 | markDoNotContact で doNotContact=true, sendStatus=blocked |
| 25 | メール編集 | updateLeadEmailDraft で件名・本文・updatedAt 更新 |
| 26 | UIコンポーネント | Phase 10 ファイル存在確認 |
| 27 | sendStatus enum | not_sent/**manual_sent**/draft/sent/**blocked** |
| 28 | 下書き抽出 | approved+not_sent のみ候補 |
| 29 | 下書き除外 | pending/rejected/needs_revision/doNotContact/high risk |
| 30 | 下書きエクスポート | JSON/CSV/txt 生成、sendStatus 不変 |
| 31 | 下書き候補UI | approved Leadのみ表示、コピーで sendStatus 不変 |
| 32 | パス解決 | cwd 非依存で leads.json を正しく解決 |
| 33 | 手動送信記録 | approved のみ manual_sent、risk/doNotContact 制約 |
| 34 | 返信・商談管理 | replyStatus / dealStatus / followUpDate を更新できる |
| 35 | 営業分析 | 手動記録を集計（rates NaN/Infinityなし、breakdown、次アクション） |
| 36 | 運用サマリー | ルールベースでサマリー生成（AI APIなし） |
| 37 | MVPチェック | ready/passed/failed/warnings/nextSteps を返す |
| 38 | パイロット手順書 | PILOT_RUNBOOK / PILOT_CHECKLIST が存在 |
| 39 | パイロットUI | パイロット運用モード・サマリー表示 |
| 40 | customHook個別化 | 6社で全同一ではない、禁止表現なし、emailBodyに含まれる |
| 41 | customHookメタデータ | hookSourceType / hookSourceUrl / customHookReason |
| 42 | generate再実行 | 手動送信・返信・商談記録を保持（preserveWorkflowState） |
| 43 | コピー安全 | コピー操作は sendStatus を変更しない（UI注意文あり） |
| 44 | 承認前除外 | pending Lead は下書き候補に出ない |
| 45 | Gmail/自動送信 | 送信コードが存在しない |
| 46 | npm audit | critical/high = 0 |
| 47 | Gmail下書き | drafts.create のみ、送信API禁止 |
| 48 | gmail-preview | 外部通信なし |
| 49 | gmail-create-drafts | CREATE_DRAFTS 確認必須 |
| 50 | Gmail対象 | emailCandidates あり・承認済みのみ |

## customHook個別化評価（Phase 15.7）

- 施工事例・Instagram・採用・会社概要・問い合わせ導線の**優先度**に基づきフックを生成
- 同一テンプレートの会社名差し替えのみは不合格
- 禁止表現（成果保証・否定・断定）を含まない
- メール本文（emailBody）の冒頭に customHook が反映される

## 承認〜コピー安全評価（Phase 15.6）

- コピーはクリップボード操作のみ（送信記録ではない）
- 手動送信済みは UI の「手動送信済みにする」操作でのみ `manual_sent` になる
- `generate` 再実行後も `manualSentAt` / `replyStatus` / `dealStatus` を保持


### Aランク

- 公式サイトあり
- 問い合わせフォーム **または** 法人メール候補あり
- Instagramあり
- 施工事例ページ候補あり
- riskLevel = low

### Bランク

- 公式サイトあり
- 問い合わせフォーム **または** 法人メール候補あり
- Instagramなし **または** 施工事例ページ不明
- riskLevel = low または medium

### Cランク

- 公式サイトなし **または**
- 問い合わせ先不明 **または**
- 住宅会社か不明
- riskLevel = high

### UNKNOWN

- 上記いずれにも該当しない中間状態

## 営業切り口評価（初期ルール）

| 条件 | 切り口例 |
|------|----------|
| 工務店 | 子育て世帯に選ばれるInstagram集客診断 |
| 注文住宅 | 来場予約・資料請求につながる施工事例発信 |
| リフォーム | 地域密着型の事例投稿改善 |
| 採用ページあり | SNS採用導線の改善 |

## 安全評価

| riskLevel | 条件 |
|-----------|------|
| low | 許可メールのみ、sourceUrlsあり |
| medium | メール候補なし or フォームのみ |
| high | 個人メール疑い、収集失敗、不明情報 |

## Day 1 完了評価チェックリスト

- [ ] docs一式存在
- [ ] Lead型定義
- [ ] 手動CSV → Lead生成
- [ ] 公式サイト解析
- [ ] JSON/CSV保存
- [ ] 重複排除
- [ ] A/B/C/UNKNOWNランク
- [ ] 営業切り口（ルールベース）
- [ ] 安全チェック
- [ ] verify通過
- [ ] 自動送信なし
- [ ] Gmail送信なし
- [ ] APIキー直書きなし

## Phase 17 完了評価

- [x] external-preview が外部通信しない
- [x] external-fetch が FETCH_CANDIDATES なしでは実行されない
- [x] 外部候補が直接 Lead 化されない
- [x] duplicate / doNotContact / websiteUrl なし候補の取り込みブロック
- [x] 連絡導線分析（emailCandidates / contactFormOnly）
- [x] verify / mvp-check / ui:build 通過
- [x] npm audit critical/high 0

## Phase 20-lite 完了評価

- [x] 追加解析最大2ページ・同一ドメインのみ
- [x] mailto / 全角＠ / [at] 正規化
- [x] 個人・フリーメール・no-reply除外
- [x] contactPathAnalytics 強化（both / gmailDraftPossible / formCopyOnly）
- [x] day1 refresh で既存Lead更新（削除なし）
- [x] パイロット emailCandidates 50%（3/6）

## 連絡導線評価（継続）

| 指標 | 意味 | パイロット6社 |
|------|------|---------------|
| emailCandidateRate | Gmail下書き候補になり得る Lead 比率 | 0% |
| contactFormRate | フォームコピー運用 Lead 比率 | 100% |
| noContactPathRate | 連絡導線なし | 0% |

- `emailCandidates` は Gmail下書き用、`contactFormUrl` はコピー運用用
- 0% は失敗ではないが、Phase 19 にはメールあり Lead が必要
