import { useCallback, useEffect, useMemo, useState } from 'react';
import { Daily30CloudResultsPanel } from './Daily30CloudResultsPanel.js';
import { Daily30LeadCandidatesPanel } from './Daily30LeadCandidatesPanel.js';
import { Daily30DraftImportPanel } from './Daily30DraftImportPanel.js';
import { DevDetails } from './common/DevDetails.js';
import { Daily30ManualExternalReferencePanel } from './Daily30ManualExternalReferencePanel.js';
import { Daily30ExternalReferenceApprovalPanel } from './Daily30ExternalReferenceApprovalPanel.js';
import type { Daily30DashboardResponse } from './daily30Api.js';
import { CandidateCollectionDetailsPanel } from './CandidateCollectionDetailsPanel.js';
import { isDeveloperUiEnabled } from './developerUi.js';
import type { CandidateDisplayMode } from './daily30CandidateFocusMode.js';

interface CandidateCollectionViewProps {
  daily30?: Daily30DashboardResponse | null;
  daily30Loading?: boolean;
  onError?: (message: string) => void;
  onSuccess?: (message: string) => void;
  refreshKey?: number;
  onDataChanged?: () => void;
}

type CandidateCollectionWorkView = 'results' | 'lead_approval' | 'draft_import';

function WorkTabButton({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number | null;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`btn work-tab-btn ${active ? 'active' : ''}`}
      onClick={onClick}
    >
      <span className="work-tab-label">{label}</span>
      {count != null ? <span className="work-tab-badge">{count}</span> : null}
    </button>
  );
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
  const [workView, setWorkView] = useState<CandidateCollectionWorkView>('results');
  const [showCollectionDetails, setShowCollectionDetails] = useState(false);
  const [showScheduleEditor, setShowScheduleEditor] = useState(false);
  const showDeveloperUi = isDeveloperUiEnabled();
  const [showExternalReferenceDrawer, setShowExternalReferenceDrawer] = useState(false);
  const [focusApprovalScreen, setFocusApprovalScreen] = useState(false);

  const handleDisplayModeChange = useCallback((mode: CandidateDisplayMode) => {
    setFocusApprovalScreen(mode === 'focus');
  }, []);

  useEffect(() => {
    if (workView === 'draft_import') {
      setFocusApprovalScreen(false);
    }
  }, [workView]);

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
  const leadApprovalPending = daily30Loading ? null : (d?.leadApprovalPendingCount ?? 0);
  const copyGenerated = daily30Loading ? null : (d?.copyGeneratedCount ?? 0);
  const draftImportPending = daily30Loading ? null : (d?.draftImportPendingCount ?? d?.readyForDraftCount ?? 0);

  const scheduleSummary = useMemo(() => {
    const resolved = daily30?.resolvedForToday;
    const profile = resolved?.profile;
    if (!cloudOk || !profile) return '—';
    const name = profile.collectionProfileName ?? '—';
    const strategy = profile.areaStrategy ?? '—';
    const source = profile.discoverySourceLabel ?? profile.discoverySource ?? '—';
    return `${name}｜${strategy}｜${source}`;
  }, [cloudOk, daily30?.resolvedForToday]);

  const resultsCount = cloudOk ? (leadApprovalPending ?? 0) : null;
  const leadCount = cloudOk ? (leadApprovalPending ?? 0) : null;
  const draftCount = cloudOk ? (draftImportPending ?? 0) : null;

  const todaySummaryLine = daily30Loading
    ? '読み込み中…'
    : !cloudOk
      ? '収集結果を読み込めません'
      : [
          `メール営業候補 ${emailFoundAtCollection ?? '—'} / ${target}`,
          `Lead化承認待ち ${leadApprovalPending ?? '—'}`,
          `営業文生成済み ${copyGenerated ?? '—'}`,
          `取り込み待ち ${draftImportPending ?? '—'}`,
        ].join('｜');

  return (
    <div
      className={`candidate-collection-view${focusApprovalScreen && workView !== 'draft_import' ? ' candidate-collection-view-focus' : ''}`}
    >
      <div className="candidate-collection-header candidate-collection-header-sticky">
        <h2 className="candidate-collection-title">候補収集</h2>

        <div className="candidate-collection-header-compactible">
          <p className="candidate-header-line candidate-header-today">
            <strong>今日：</strong>
            <span>{todaySummaryLine}</span>
          </p>
          <div className="candidate-header-line candidate-header-tomorrow">
            <p className="candidate-header-tomorrow-text">
              <strong>明日：</strong>
              <span>{scheduleSummary}</span>
            </p>
            <div className="candidate-schedule-summary-actions">
              <button
                type="button"
                className="btn btn-primary candidate-btn-toolbar"
                onClick={() => {
                  setShowCollectionDetails(true);
                  setShowScheduleEditor(true);
                }}
              >
                変更
              </button>
              <button
                type="button"
                className="btn btn-secondary candidate-btn-toolbar"
                onClick={() => setShowCollectionDetails((v) => !v)}
              >
                詳細
              </button>
            </div>
          </div>

          {showCollectionDetails ? (
            <div className="candidate-collection-details">
              <CandidateCollectionDetailsPanel
                daily30={daily30}
                daily30Loading={daily30Loading}
                showScheduleEditor={showScheduleEditor}
                onError={onError}
                onSuccess={onSuccess}
                refreshKey={refreshKey}
              />
            </div>
          ) : null}
        </div>

        <div className="candidate-work-nav">
          <div className="candidate-work-tabs">
            <WorkTabButton
              active={workView === 'results'}
              label="収集結果"
              count={typeof resultsCount === 'number' ? resultsCount : null}
              onClick={() => setWorkView('results')}
            />
            <WorkTabButton
              active={workView === 'lead_approval'}
              label="Lead化・営業文"
              count={typeof leadCount === 'number' ? leadCount : null}
              onClick={() => setWorkView('lead_approval')}
            />
            <WorkTabButton
              active={workView === 'draft_import'}
              label="下書き取り込み"
              count={typeof draftCount === 'number' ? draftCount : null}
              onClick={() => setWorkView('draft_import')}
            />
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setShowExternalReferenceDrawer(true)}
          >
            ＋ 外部参照候補を追加
          </button>
        </div>
      </div>

      <div className="candidate-collection-work">
        {workView === 'results' ? (
          <Daily30CloudResultsPanel
            onError={onError}
            onSuccess={onSuccess}
            refreshKey={refreshKey}
            onChanged={onDataChanged}
            sessionExcludedIds={sessionExcludedIds}
            onMarkExcluded={markExcluded}
            onDisplayModeChange={handleDisplayModeChange}
          />
        ) : null}

        {workView === 'lead_approval' ? (
          <Daily30LeadCandidatesPanel
            onError={onError}
            onSuccess={onSuccess}
            refreshKey={refreshKey}
            onChanged={onDataChanged}
            sessionExcludedIds={sessionExcludedIds}
            onDisplayModeChange={handleDisplayModeChange}
          />
        ) : null}

        {workView === 'draft_import' ? (
          <Daily30DraftImportPanel
            onError={onError}
            onSuccess={onSuccess}
            refreshKey={refreshKey}
            onChanged={onDataChanged}
          />
        ) : null}
      </div>

      {showExternalReferenceDrawer ? (
        <div className="drawer-overlay" role="presentation" onClick={() => setShowExternalReferenceDrawer(false)}>
          <div className="drawer drawer-right" role="dialog" aria-label="外部参照候補を追加" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <h3 className="drawer-title">外部参照候補を追加</h3>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowExternalReferenceDrawer(false)}>
                閉じる
              </button>
            </div>
            <p className="hint">
              掲載元URLは企業発見の記録にのみ使用します。メールは公式サイトからのみ確認します。
            </p>
            <Daily30ManualExternalReferencePanel onError={onError} onSuccess={onSuccess} onChanged={onDataChanged} />
            <DevDetails title="外部参照 adapter 承認状態（開発者向け）">
              <Daily30ExternalReferenceApprovalPanel refreshKey={refreshKey} />
            </DevDetails>
          </div>
        </div>
      ) : null}

      {showDeveloperUi ? (
        <div className="candidate-collection-dev-zone">
          <p className="hint">開発者モード — 運用パネルは設定タブにもあります。</p>
        </div>
      ) : null}
    </div>
  );
}
