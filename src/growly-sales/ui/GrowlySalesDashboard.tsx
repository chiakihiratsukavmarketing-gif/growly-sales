import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Lead } from '../../types/lead.js';
import { sortLeadsForDisplay } from '../workflow/sortLeadsForDisplay.js';
import { isAwaitingReplyLead } from '../workflow/replyManagement.js';
import { fetchLeads } from './api.js';
import { fetchSalesDashboard, type SalesDashboardResponse } from './salesDashboardApi.js';
import { fetchDaily30Dashboard, type Daily30DashboardResponse } from './daily30Api.js';
import { summarizeLeadListOps, countFollowUpUrgent } from './leadDisplayUtils.js';
import {
  collectUniqueAreas,
  filterByCompanyName,
  LEAD_LIST_FILTER_OPTIONS,
  matchesLeadAreaFilter,
  matchesLeadListFilterWithContext,
} from './leadFilterUtils.js';
import { SearchAndFilterBar } from './common/SearchAndFilterBar.js';
import { FilterEmptyState } from './common/FilterEmptyState.js';
import { LeadListView } from './LeadListView.js';
import { LeadDetailPanel } from './LeadDetailPanel.js';
import { SalesDashboardView } from './SalesDashboardView.js';
import { GmailDraftCandidatesView } from './GmailDraftCandidatesView.js';
import { SendRecordsView } from './SendRecordsView.js';
import { ReplyManagementView } from './ReplyManagementView.js';
import { FollowUpDashboardView } from './FollowUpDashboardView.js';
import { SettingsView } from './SettingsView.js';
import { CandidateCollectionView } from './CandidateCollectionView.js';
import { PilotModeBanner } from './PilotModeBanner.js';
import { DevDetails } from './common/DevDetails.js';
import { isDevApiErrorMessage } from './displayLabels.js';
import type { RecommendedActionTargetTab } from '../analytics/buildSalesDashboard.js';

/** 営業フロー順（左サイドバー） */
export type SalesFlowTab =
  | 'dashboard'
  | 'leads'
  | 'draft-candidates'
  | 'send-records'
  | 'reply-management'
  | 'follow-up'
  | 'settings'
  | 'candidate-collection';

const TAB_ITEMS: { id: SalesFlowTab; label: string; step: number | null }[] = [
  { id: 'dashboard', label: 'ダッシュボード', step: 1 },
  { id: 'leads', label: 'Lead一覧', step: 2 },
  { id: 'draft-candidates', label: '下書き候補', step: 3 },
  { id: 'send-records', label: '送信記録', step: 4 },
  { id: 'reply-management', label: '返信管理', step: 5 },
  { id: 'follow-up', label: 'フォローアップ', step: 6 },
  { id: 'settings', label: '設定', step: 7 },
];

const UTILITY_TAB: { id: SalesFlowTab; label: string } = {
  id: 'candidate-collection',
  label: '候補収集',
};

export function GrowlySalesDashboard() {
  const [activeTab, setActiveTab] = useState<SalesFlowTab>('dashboard');
  const [highlightLeadId, setHighlightLeadId] = useState<string | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [devError, setDevError] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<SalesDashboardResponse | null>(null);
  const [daily30, setDaily30] = useState<Daily30DashboardResponse | null>(null);
  const [daily30Loading, setDaily30Loading] = useState(true);
  const [dataVersion, setDataVersion] = useState(0);
  const [leadSearch, setLeadSearch] = useState('');
  const [leadStatusFilter, setLeadStatusFilter] = useState('all');
  const [leadAreaFilter, setLeadAreaFilter] = useState('all');

  const navigateToTab = useCallback((tab: SalesFlowTab, leadId?: string) => {
    setActiveTab(tab);
    setHighlightLeadId(leadId ?? null);
  }, []);

  const loadDaily30 = useCallback(async () => {
    setDaily30Loading(true);
    try {
      const d30 = await fetchDaily30Dashboard();
      setDaily30(d30);
      setDevError(null);
    } catch (err) {
      setDaily30(null);
      const raw = err instanceof Error ? err.message : '';
      if (raw && isDevApiErrorMessage(raw)) {
        setDevError(raw);
      }
    } finally {
      setDaily30Loading(false);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, dash] = await Promise.all([fetchLeads(), fetchSalesDashboard()]);
      setLeads(sortLeadsForDisplay(data));
      setDashboard(dash);
      await loadDaily30();
    } catch (err) {
      const raw = err instanceof Error ? err.message : '読み込みに失敗しました';
      if (isDevApiErrorMessage(raw)) {
        setDevError(raw);
        setError(null);
      } else {
        setError(raw);
      }
    } finally {
      setLoading(false);
    }
  }, [loadDaily30]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (dataVersion === 0) return;
    void loadDaily30();
  }, [dataVersion, loadDaily30]);

  const selectedLead = leads.find((l) => l.id === selectedId) ?? null;
  const activeStep = TAB_ITEMS.find((t) => t.id === activeTab)?.step ?? null;

  const leadAreaOptions = useMemo(
    () => collectUniqueAreas(leads).map((area) => ({ value: area, label: area })),
    [leads]
  );

  const filteredLeads = useMemo(() => {
    let items = leads;
    items = items.filter((l) => matchesLeadListFilterWithContext(l, leadStatusFilter, leads));
    items = items.filter((l) => matchesLeadAreaFilter(l, leadAreaFilter));
    items = filterByCompanyName(items, leadSearch, (l) => l.companyName);
    return items;
  }, [leads, leadStatusFilter, leadAreaFilter, leadSearch]);

  const clearLeadFilters = useCallback(() => {
    setLeadSearch('');
    setLeadStatusFilter('all');
    setLeadAreaFilter('all');
  }, []);

  function handleLeadUpdated(updated: Lead): void {
    setLeads((prev) => sortLeadsForDisplay(prev.map((l) => (l.id === updated.id ? updated : l))));
    setActionError(null);
    setDataVersion((v) => v + 1);
    void fetchSalesDashboard()
      .then(setDashboard)
      .catch(() => {});
  }

  function handleRecordSuccess(lead: Lead): void {
    handleLeadUpdated(lead);
  }

  function handleViewError(message: string): void {
    if (isDevApiErrorMessage(message)) {
      setDevError(message);
      return;
    }
    setActionError(message);
  }

  function handleViewSuccess(_message: string): void {
    setActionError(null);
    setDevError(null);
    setDataVersion((v) => v + 1);
  }

  function handleTabClick(tab: SalesFlowTab): void {
    setHighlightLeadId(null);
    setActiveTab(tab);
  }

  function handleLeadSelect(leadId: string): void {
    setSelectedId(leadId);
  }

  function tabBadge(tab: SalesFlowTab): number | null {
    if (!dashboard) return null;
    const m = dashboard.metrics;
    switch (tab) {
      case 'draft-candidates':
        if (m.gmailDraftPendingReviewCount > 0) return m.gmailDraftPendingReviewCount;
        return m.gmailDraftCandidateCount > 0 ? m.gmailDraftCandidateCount : null;
      case 'reply-management': {
        const awaiting = leads.length > 0 ? leads.filter(isAwaitingReplyLead).length : m.awaitingReplyCount;
        return awaiting > 0 ? awaiting : null;
      }
      case 'follow-up': {
        const urgent = countFollowUpUrgent(leads);
        return urgent > 0 ? urgent : m.followUpTargetCount > 0 ? m.followUpTargetCount : null;
      }
      case 'send-records':
        return m.pendingGmailSendRecordCount > 0 ? m.pendingGmailSendRecordCount : null;
      case 'candidate-collection': {
        const pending = daily30?.dashboard.leadApprovalPendingCount ?? 0;
        return pending > 0 ? pending : null;
      }
      default:
        return null;
    }
  }

  return (
    <div className="dashboard dashboard-with-sidebar dashboard-shell-compact dashboard-shell-readable">
      <header className="dashboard-header dashboard-header-compact">
        <div>
          <h1>Growly Sales — 営業OS</h1>
          <p className="subtitle subtitle-compact">メール取得から返信管理まで</p>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => void load()} disabled={loading}>
          再読み込み
        </button>
      </header>

      <div className="dashboard-shell">
        <aside className="dashboard-sidebar dashboard-sidebar-compact" aria-label="営業フローナビゲーション">
          <p className="sidebar-flow-label">営業フロー</p>
          <nav className="sidebar-nav">
            {TAB_ITEMS.map((tab) => {
              const badge = tabBadge(tab.id);
              return (
                <button
                  key={tab.id}
                  type="button"
                  className={`sidebar-tab ${activeTab === tab.id ? 'active' : ''}`}
                  onClick={() => handleTabClick(tab.id)}
                  aria-current={activeTab === tab.id ? 'page' : undefined}
                >
                  <span className="sidebar-tab-step">{tab.step}</span>
                  <span className="sidebar-tab-label">{tab.label}</span>
                  {badge !== null && badge > 0 && <span className="tab-badge">{badge}</span>}
                </button>
              );
            })}
          </nav>
          <nav className="sidebar-nav sidebar-nav-utility" aria-label="運用ユーティリティ">
            <button
              type="button"
              className={`sidebar-tab sidebar-tab-utility ${activeTab === UTILITY_TAB.id ? 'active' : ''}`}
              onClick={() => handleTabClick(UTILITY_TAB.id)}
              aria-current={activeTab === UTILITY_TAB.id ? 'page' : undefined}
            >
              <span className="sidebar-tab-step">＋</span>
              <span className="sidebar-tab-label">{UTILITY_TAB.label}</span>
              {tabBadge('candidate-collection') !== null && (
                <span className="tab-badge">{tabBadge('candidate-collection')}</span>
              )}
            </button>
          </nav>
          <p className="sidebar-position sidebar-position-compact">
            {activeStep !== null ? (
              <>
                現在: {activeStep}/7 — {TAB_ITEMS.find((t) => t.id === activeTab)?.label}
              </>
            ) : (
              <>運用: {UTILITY_TAB.label}</>
            )}
          </p>
        </aside>

        <main className="dashboard-main">
          {activeTab !== 'dashboard' && <PilotModeBanner />}

          {error && <div className="alert alert-danger">{error}</div>}
          {actionError && <div className="alert alert-danger">{actionError}</div>}
          {devError && (
            <DevDetails title="開発者向け詳細（APIエラー）">
              <p className="mono-cell">{devError}</p>
            </DevDetails>
          )}

          {activeTab === 'dashboard' && (
            <div className="tab-scroll tab-scroll-dashboard">
              <SalesDashboardView
                onError={handleViewError}
                refreshKey={dataVersion}
                daily30={daily30}
                daily30Loading={daily30Loading}
                leads={leads}
                onNavigate={(tab, leadId) => navigateToTab(tab as SalesFlowTab, leadId ?? undefined)}
              />
            </div>
          )}

          {activeTab === 'leads' &&
            (loading ? (
              <p className="loading">読み込み中…</p>
            ) : (
              <div className="tab-workspace leads-workspace">
                <div className="leads-tab-header">
                  <h2 className="page-header-title">Lead一覧</h2>
                  <p className="page-header-subtitle">会社を選んで内容を確認し、承認または修正を行います。</p>
                  {(() => {
                    const s = summarizeLeadListOps(leads);
                    return (
                      <p className="leads-ops-summary">
                        棚卸し: Gmail営業 {s.gmailOutreach} 件 / フォーム営業 {s.formOutreach} 件
                        {s.exclusionCandidates > 0 && ` / 除外候補 ${s.exclusionCandidates} 件`}
                        {s.duplicateCandidates > 0 && ` / 重複候補 ${s.duplicateCandidates} 件`}
                        {' · '}
                        承認待ち {s.humanReviewPending} 件
                        {s.emailDraftEligible > 0 && `（メール下書き可 ${s.emailDraftEligible} 件）`}
                        {s.formOnlyPending > 0 && `（フォームのみ ${s.formOnlyPending} 件）`}
                        {s.emailDraftEligible === 0 && s.humanReviewPending > 0 && (
                          <span className="hint"> — 新規Gmail下書きは未送信かつメールありのLeadが対象です</span>
                        )}
                      </p>
                    );
                  })()}
                </div>
                <div className="two-pane-layout leads-two-pane">
                  <section className="two-pane-left" aria-label="Lead一覧">
                    <div className="pane-inner pane-inner-list">
                      <SearchAndFilterBar
                        searchValue={leadSearch}
                        onSearchChange={setLeadSearch}
                        filterValue={leadStatusFilter}
                        onFilterChange={setLeadStatusFilter}
                        filterOptions={LEAD_LIST_FILTER_OPTIONS}
                        resultCount={filteredLeads.length}
                        totalCount={leads.length}
                        onClear={clearLeadFilters}
                        areaFilterValue={leadAreaFilter}
                        onAreaFilterChange={setLeadAreaFilter}
                        areaFilterOptions={leadAreaOptions}
                      />
                      {leads.length === 0 ? (
                        <div className="pane-inner-empty">
                          <p className="hint">Lead がありません。候補収集タブで候補を集めて Lead 化してください。</p>
                        </div>
                      ) : filteredLeads.length === 0 ? (
                        <div className="pane-inner-empty">
                          <FilterEmptyState onClear={clearLeadFilters} />
                        </div>
                      ) : (
                        <LeadListView
                          leads={filteredLeads}
                          selectedId={selectedId}
                          onSelect={handleLeadSelect}
                        />
                      )}
                    </div>
                  </section>
                  <section className="two-pane-right" aria-label="Lead詳細">
                    <LeadDetailPanel
                      lead={selectedLead}
                      onUpdated={handleLeadUpdated}
                      onError={handleViewError}
                    />
                  </section>
                </div>
              </div>
            ))}

          {activeTab === 'draft-candidates' && (
            <div className="tab-scroll">
              <GmailDraftCandidatesView
                onError={handleViewError}
                onDraftCreated={handleRecordSuccess}
                onNavigateToTab={navigateToTab}
                refreshKey={dataVersion}
              />
            </div>
          )}

          {activeTab === 'send-records' && (
            <div className="tab-scroll">
              <SendRecordsView
                onError={handleViewError}
                onRecordSuccess={handleRecordSuccess}
                refreshKey={dataVersion}
                highlightLeadId={highlightLeadId}
                onNavigateToTab={navigateToTab}
              />
            </div>
          )}

          {activeTab === 'reply-management' && (
            <ReplyManagementView
              onError={handleViewError}
              onUpdated={handleRecordSuccess}
              refreshKey={dataVersion}
            />
          )}

          {activeTab === 'follow-up' && (
            <div className="tab-scroll">
              <FollowUpDashboardView
                onError={handleViewError}
                refreshKey={dataVersion}
                onNavigateToTab={navigateToTab}
              />
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="tab-scroll">
              <SettingsView onError={handleViewError} onDataChanged={() => setDataVersion((v) => v + 1)} />
            </div>
          )}

          {activeTab === 'candidate-collection' && (
            <div className="tab-scroll">
              <CandidateCollectionView
                daily30={daily30}
                daily30Loading={daily30Loading}
                onError={handleViewError}
                onSuccess={handleViewSuccess}
                refreshKey={dataVersion}
                onDataChanged={() => {
                  setDataVersion((v) => v + 1);
                  void load();
                }}
              />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export type { RecommendedActionTargetTab };
