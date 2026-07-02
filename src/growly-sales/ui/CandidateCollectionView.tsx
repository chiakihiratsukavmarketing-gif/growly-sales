import { useCallback, useState } from 'react';
import { SectionCard } from './SectionCard.js';
import { SummaryStatCard } from './SummaryStatCard.js';
import { Daily30CloudResultsPanel } from './Daily30CloudResultsPanel.js';
import { Daily30LeadCandidatesPanel } from './Daily30LeadCandidatesPanel.js';
import { Daily30DraftImportPanel } from './Daily30DraftImportPanel.js';
import { PageHeader } from './common/PageHeader.js';
import { DevDetails } from './common/DevDetails.js';
import { Daily30CollectionSchedulePanel } from './Daily30CollectionSchedulePanel.js';
import { Daily30ManualExternalReferencePanel } from './Daily30ManualExternalReferencePanel.js';
import { Daily30ExternalReferenceApprovalPanel } from './Daily30ExternalReferenceApprovalPanel.js';
import type { Daily30DashboardResponse } from './daily30Api.js';
import { Daily30OperationsPanel, Daily30SafetyRulesPanel } from './Daily30OperationsPanel.js';
import { Daily30CloudStatusPanel } from './Daily30CloudStatusPanel.js';
import { Daily30ExternalReferenceSupplementBanner } from './Daily30ExternalReferenceSupplementBanner.js';

interface CandidateCollectionViewProps {
  daily30?: Daily30DashboardResponse | null;
  daily30Loading?: boolean;
  onError?: (message: string) => void;
  onSuccess?: (message: string) => void;
  refreshKey?: number;
  onDataChanged?: () => void;
}

export function CandidateCollectionView({
  daily30 = null,
  daily30Loading = false,
  onError = () => {},
  onSuccess,
  refreshKey = 0,
  onDataChanged,
}: CandidateCollectionViewProps) {
  const [sessionExcludedIds, setSessionExcludedIds] = useState<ReadonlySet<string>>(
    () => new Set()
  );

  const markExcluded = useCallback((candidateId: string) => {
    setSessionExcludedIds((prev) => {
      if (prev.has(candidateId)) return prev;
      const next = new Set(prev);
      next.add(candidateId);
      return next;
    });
  }, []);

  const d = daily30?.dashboard;
  const cloudOk = daily30?.ok !== false && !daily30Loading;
  const target = d?.targetEmailFound ?? d?.target ?? 30;
  const emailFoundAtCollection = daily30Loading
    ? null
    : (d?.emailFoundAtCollection ?? daily30?.emailFound ?? d?.emailFoundCount ?? null);
  const totalCollected = cloudOk ? (d?.totalCollectedAtCollection ?? d?.totalCollected ?? 0) : null;
  const formOnly = cloudOk ? (d?.formOnlyAtCollection ?? d?.formOnlyCount ?? 0) : null;
  const noEmail = cloudOk ? (d?.noEmailAtCollection ?? d?.noEmailCount ?? 0) : null;
  const leadApprovalPending = daily30Loading ? null : (d?.leadApprovalPendingCount ?? 0);
  const leadApprovalApproved = daily30Loading ? null : (d?.leadApprovalApprovedCount ?? 0);
  const copyGenerated = daily30Loading ? null : (d?.copyGeneratedCount ?? 0);
  const draftImportPending = daily30Loading ? null : (d?.draftImportPendingCount ?? d?.readyForDraftCount ?? 0);

  return (
    <div className="candidate-collection-view">
      <PageHeader
        title="候補収集"
        subtitle="メール取得済み候補を確認してLead化します。"
      />

      <SectionCard title="今日の状態" className="candidate-today-status">
        {daily30Loading && (
          <p className="hint candidate-cloud-hint">収集結果を読み込み中…</p>
        )}
        {!daily30Loading && !cloudOk && (
          <p className="hint candidate-cloud-hint">
            収集結果を読み込めません。下の収集結果セクションで接続を確認してください。
          </p>
        )}
        <div className="stats-grid candidate-today-stats">
          <SummaryStatCard
            value={
              daily30Loading
                ? '…'
                : emailFoundAtCollection != null
                  ? `${emailFoundAtCollection} / ${target}`
                  : '—'
            }
            label="収集時メール取得"
            highlight={cloudOk && (emailFoundAtCollection ?? 0) > 0}
          />
          <SummaryStatCard
            value={leadApprovalPending ?? '—'}
            label="Lead化承認待ち"
            highlight={Boolean(leadApprovalPending && leadApprovalPending > 0)}
          />
          <SummaryStatCard value={leadApprovalApproved ?? '—'} label="Lead化承認済み" />
          <SummaryStatCard value={copyGenerated ?? '—'} label="営業文生成済" />
          <SummaryStatCard value={draftImportPending ?? '—'} label="下書き取り込み待ち" />
        </div>
        {cloudOk && totalCollected != null ? (
          <p className="hint candidate-path-summary">
            総収集候補 {totalCollected}件 / フォームのみ {formOnly ?? 0}件 / 導線なし {noEmail ?? 0}件
          </p>
        ) : null}
        {cloudOk ? <Daily30ExternalReferenceSupplementBanner summary={daily30} compact /> : null}
      </SectionCard>

      <SectionCard title="明日の収集設定" className="candidate-collection-schedule">
        <Daily30CollectionSchedulePanel
          onError={onError}
          onSuccess={onSuccess}
          refreshKey={refreshKey}
        />
      </SectionCard>

      <SectionCard title="外部参照URLから候補追加" className="candidate-manual-external-reference">
        <Daily30ManualExternalReferencePanel
          onError={onError}
          onSuccess={onSuccess}
          onChanged={onDataChanged}
        />
      </SectionCard>

      <SectionCard title="1. 収集結果">
        <Daily30CloudResultsPanel
          onError={onError}
          onSuccess={onSuccess}
          refreshKey={refreshKey}
          onChanged={onDataChanged}
          sessionExcludedIds={sessionExcludedIds}
          onMarkExcluded={markExcluded}
        />
        <DevDetails title="手動実行（開発者向け）">
          <Daily30DashboardPanel
            onError={onError}
            refreshKey={refreshKey}
            onFetched={onDataChanged}
          />
        </DevDetails>
      </SectionCard>

      <SectionCard title="2. Lead化承認・営業文">
        <Daily30LeadCandidatesPanel
          onError={onError}
          onSuccess={onSuccess}
          refreshKey={refreshKey}
          onChanged={onDataChanged}
          sessionExcludedIds={sessionExcludedIds}
          onMarkExcluded={markExcluded}
        />
      </SectionCard>

      <SectionCard title="3. 下書き候補取り込み">
        <Daily30DraftImportPanel
          onError={onError}
          onSuccess={onSuccess}
          refreshKey={refreshKey}
          onChanged={onDataChanged}
        />
      </SectionCard>

      <DevDetails title="外部参照 adapter 承認状態（Phase 41.3）">
        <Daily30ExternalReferenceApprovalPanel refreshKey={refreshKey} />
      </DevDetails>

      <DevDetails title="運用フロー・開発者向け詳細">
        <ol className="daily30-flow-steps daily30-flow-steps-compact">
          <li>毎朝9時に自動収集</li>
          <li>Lead化承認（人間確認）</li>
          <li>営業文生成・品質チェック（手動ゲート）</li>
          <li>下書き候補へ取り込み（leads.json）</li>
          <li>Gmailで手動送信（自動送信なし）</li>
        </ol>
        <Daily30OperationsPanel onError={onError} refreshKey={refreshKey} />
        <Daily30CloudStatusPanel onError={onError} refreshKey={refreshKey} />
        <Daily30SafetyRulesPanel />
      </DevDetails>
    </div>
  );
}
