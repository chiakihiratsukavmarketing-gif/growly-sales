import { SectionCard } from './SectionCard.js';
import { InfoBanner } from './InfoBanner.js';
import { Daily30DashboardPanel } from './Daily30DashboardPanel.js';
import { Daily30OperationsPanel } from './Daily30OperationsPanel.js';
import { Daily30LeadCandidatesPanel } from './Daily30LeadCandidatesPanel.js';
import { Daily30DraftImportPanel } from './Daily30DraftImportPanel.js';

interface CandidateCollectionViewProps {
  gmailDraftCandidateCount?: number;
  onError?: (message: string) => void;
  refreshKey?: number;
  onDataChanged?: () => void;
}

export function CandidateCollectionView({
  gmailDraftCandidateCount = 0,
  onError = () => {},
  refreshKey = 0,
  onDataChanged,
}: CandidateCollectionViewProps) {
  const needsCollection = gmailDraftCandidateCount === 0;

  return (
    <div className="candidate-collection-view">
      <InfoBanner variant="info">
        Daily 30 フロー: 収集 → Lead化承認 → 営業文生成 → 品質チェック → 下書き候補取り込み → CREATE_DRAFTS。
        自動送信は行いません。
      </InfoBanner>

      {needsCollection && (
        <InfoBanner variant="warning">
          現在 Gmail下書き候補は <strong>0件</strong> です。以下の手順で新しい Lead
          を増やしてから、下書き候補タブへ進んでください。
        </InfoBanner>
      )}

      <Daily30OperationsPanel onError={onError} refreshKey={refreshKey} />

      <Daily30DashboardPanel
        onError={onError}
        refreshKey={refreshKey}
        onFetched={onDataChanged}
      />

      <Daily30LeadCandidatesPanel
        onError={onError}
        refreshKey={refreshKey}
        onChanged={onDataChanged}
      />

      <Daily30DraftImportPanel
        onError={onError}
        refreshKey={refreshKey}
        onChanged={onDataChanged}
      />

      <SectionCard title="従来ルート（input-sites.csv）">
        <ol className="workflow-steps workflow-steps-numbered">
          <li>
            <strong>input-sites.csv に会社URLを追加</strong>
            <p className="hint">
              調べたい工務店・住宅会社の公式サイト URL を CSV に追記します。
            </p>
          </li>
          <li>
            <strong>day1 を実行</strong>
            <p className="hint">
              <code>npm run growly-sales:day1</code>
              <br />
              サイト巡回・メール候補・フォーム URL・採用ページなどを Lead に反映します。
            </p>
          </li>
          <li>
            <strong>generate を実行</strong>
            <p className="hint">
              <code>npm run growly-sales:generate</code>
              <br />
              customHook・emailSubject・emailBody を生成。humanReviewStatus は pending になります。
            </p>
          </li>
          <li>
            <strong>email-outreach-candidates で確認</strong>
            <p className="hint">
              <code>npm run growly-sales:email-outreach-candidates</code>
              <br />
              メールあり Lead の一覧を確認（外部通信なし）。
            </p>
          </li>
          <li>
            <strong>下書き候補タブで承認</strong>
            <p className="hint">
              UI「下書き候補」で内容確認 →「内容確認済み・承認する」。承認は送信ではありません。
            </p>
          </li>
          <li>
            <strong>CREATE_DRAFTS で下書き作成</strong>
            <p className="hint">
              下書き候補タブで CREATE_DRAFTS を入力して Gmail 下書きを1社ずつ作成（自動送信なし）。
            </p>
          </li>
        </ol>
      </SectionCard>

      <SectionCard title="その後の営業フロー">
        <ol className="workflow-steps">
          <li>Gmail で手動送信</li>
          <li>送信記録タブで「手動送信済みに記録」</li>
          <li>返信があれば返信管理で replySummary のみ記録（本文全文は保存しない）</li>
        </ol>
      </SectionCard>

      <SectionCard title="外部 API 収集（ゲート付き）">
        <ul className="policy-list">
          <li>
            <code>npm run growly-sales:daily30-preview</code> — Daily 30 dry-run
          </li>
          <li>
            <code>npm run growly-sales:daily30-fetch</code> — FETCH_DAILY_30 明示時のみ
          </li>
          <li>
            <code>npm run growly-sales:daily30-generate-copy</code> — GENERATE_DAILY_30_COPY 明示時のみ
          </li>
          <li>
            <code>npm run growly-sales:daily30-import-draft-candidates</code> — IMPORT_DAILY_30_DRAFT_CANDIDATES 明示時のみ
          </li>
          <li>
            <code>npm run growly-sales:candidates-preview</code> — 互換プレビュー
          </li>
          <li>
            <code>npm run growly-sales:fetch-candidates</code> — FETCH_CANDIDATES 明示時のみ
          </li>
        </ul>
        <p className="hint warning-text">
          UI からの収集は上の Daily 30 パネルで FETCH_DAILY_30 入力時のみ。自動実行しません。
        </p>
      </SectionCard>
    </div>
  );
}
