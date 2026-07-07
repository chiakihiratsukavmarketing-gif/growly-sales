# Growly Sales — NEXT_TASKS

**更新日:** 2026-07-07
**進行:** Phase 43 **4 / 4** 完了 / Phase 44 **0 / 3**（44.1 準備 **9 / 15**・No-Go 維持）

---

## Phase 44 — メール運用機能 live 化

| サブフェーズ | 内容 | 状態 |
|-------------|------|------|
| **44.0** | live 化前安全確認 | ✅ `9c9dd45` |
| **44.1** | 配信停止 live 準備（tenant境界・保存境界） | ✅ 準備完了 `9d07810` / **No-Go 維持** |
| 44.2 | カスタムテンプレート live | 未着手 |
| 44.3 | 開封計測 live | 未着手 |

**監査正本:** `docs/GROWLY_SALES_MAIL_OPERATIONS_LIVE_READINESS.md`

**live 公開順:** ①配信停止 → ②カスタムメール → ③開封計測  
44.1 live 完了まで、テンプレート・pixel のメール埋め込み live 化は **禁止**。

### 44.1 Go 再評価に必要な人間作業

- [x] **contactEmail** — `info@wantreach.jp`（Want Reach 既定 tenant・tenant 設定一元管理・2026-07-07 Human Approval）
- [ ] 公開ドメイン・`PUBLIC_BASE_URL` 決定
- [ ] Cloud Run mail-ops サービス作成・デプロイ承認（設計案は §LIVE_READINESS §7）
- [ ] HTTPS 確認
- [ ] Secret Manager（`UNSUBSCRIBE_TOKEN_PEPPER` 等）
- [x] suppression 保存先承認（GCS設計 Human Approval 済み: `be9d026` / `mail-operations/` prefix / generation-match / retry / backup / IAM / rollback / audit）
- [x] **法務表示方針** — Human Approval 済み（2026-07-07・§8.4 / メール全体表示要件・フッター所在地重複なし・一般的運用確認）
- [x] **配信停止画面文案** — Human Approval 済み（2026-07-07・`UnsubscribeScreenState` 5 状態・mock API のみ）
- [x] **配信停止メール末尾文面** — Human Approval 済み（2026-07-07・`buildUnsubscribeEmailFooterCopy`・所在地なし・Gmail/live 未適用）
- [ ] fail-closed 実装フェーズへの着手承認

### 44.1 実装原則（自社優先 + SaaS拡張余地）

- [x] `DEFAULT_TENANT_ID = want-reach`（single tenant）
- [x] 公開候補: `mailops.wantreach.jp`
- [x] tenant resolver / public URL resolver / store interface 経由（文字列の散在禁止）
- [x] suppression: `scope=platform|tenant`（platform UI は作らない）
- [x] contactEmail: `info@wantreach.jp`（tenant 設定のみ・Gmail/live 未適用）
- [x] 法務表示方針・配信停止画面文案（tenant 経由・mock のみ）
- [x] mock GET/POST 配信停止画面（maskedEmail のみ・冪等・fail-closed 準備）
- [x] GCS 保存設計 Human Approval 記録（`be9d026`・実 GCS 操作なし）
- [x] mail-ops Cloud Run 設計案（読み取り調査・§LIVE_READINESS §7・デプロイなし）
- [x] GCS store + mail-ops entrypoint 実装（in-memory verify・実 GCS 未接続）

### 44.1 内部進行（15 ステップ）

| # | 内容 | 状態 |
|---|------|------|
| 1–5 | tenant / contactEmail / 法務 / footer / mock screen | ✅ |
| 6 | GCS 保存設計承認・commit | ✅ `be9d026` |
| 7 | mail-ops Cloud Run 設計調査 | ✅ `84739d1` |
| 8 | GCS store 土台 + mail-ops slim コンテナ | ✅ `cf5deed` |
| 9 | IAM・Secret 構成調査 | ✅ 本セッション（docs のみ） |
| 10–15 | live 接続・デプロイ準備等 | 未 |

### Phase 43 完了（mock・参照）

| サブ | commit |
|------|--------|
| 43.1 設計 | `98abff3` |
| 43.2 配信停止 mock | `5ed05de` |
| 43.3 テンプレート mock | `51acf05` |
| 43.4 開封計測 mock | `fc1a686` |
| 43 完了記録 | `e28e311` |

---

## 通常営業運用（人間作業）

1. UI: `http://localhost:3847`
2. Daily 30: 候補収集 → Lead化承認 → 営業文 → 下書き → Gmail手動送信 → 送信記録
3. 各ゲート承認必須（`FETCH_DAILY_30` / `GENERATE_DAILY_30_COPY` / `IMPORT_*` / `CREATE_DRAFTS`）

**禁止:** 自動送信 / force=true / 無断デプロイ / Scheduler・Secret変更 / Phase 44 live 機能の本番適用（Go 前）

**WORK_LOG:** `## 通常営業運用` に日次件数を記録

---

## 参照

- Phase 43 仕様: `docs/GROWLY_SALES_MAIL_OPERATIONS_UPGRADE.md`
- Phase 44 監査: `docs/GROWLY_SALES_MAIL_OPERATIONS_LIVE_READINESS.md`
- Daily 30 運用: `docs/GROWLY_SALES_DAILY30_RUNBOOK.md`
- 作業ログ: `WORK_LOG.md`（通常運用 / Phase 43・44 区分）
