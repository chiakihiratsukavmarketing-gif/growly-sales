import { useCallback, useEffect, useState } from 'react';
import type { Lead } from '../../types/lead.js';
import { sortLeadsForDisplay } from '../workflow/sortLeadsForDisplay.js';
import { fetchLeads } from './api.js';
import { fetchSalesDashboard, type SalesDashboardResponse } from './salesDashboardApi.js';
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
  const [dashboard, setDashboard] = useState<SalesDashboardResponse | null>(null);
  const [dataVersion, setDataVersion] = useState(0);

  const navigateToTab = useCallback((tab: SalesFlowTab, leadId?: string) => {
    setActiveTab(tab);
    setHighlightLeadId(leadId ?? null);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, dash] = await Promise.all([fetchLeads(), fetchSalesDashboard()]);
      setLeads(sortLeadsForDisplay(data));
      setDashboard(dash);
    } catch (err) {
      setError(err instanceof Error ? err.message : '読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedLead = leads.find((l) => l.id === selectedId) ?? null;
  const activeStep = TAB_ITEMS.find((t) => t.id === activeTab)?.step ?? null;

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
    setActionError(message);
  }

  function handleTabClick(tab: SalesFlowTab): void {
    setHighlightLeadId(null);
    setActiveTab(tab);
  }

  function tabBadge(tab: SalesFlowTab): number | null {
    if (!dashboard) return null;
    const m = dashboard.metrics;
    switch (tab) {
      case 'draft-candidates':
        return m.gmailDraftCandidateCount > 0 ? m.gmailDraftCandidateCount : null;
      case 'reply-management':
        return m.awaitingReplyCount > 0 ? m.awaitingReplyCount : null;
      case 'follow-up':
        return m.followUpTargetCount > 0 ? m.followUpTargetCount : null;
      case 'send-records':
        if (m.pendingGmailSendRecordCount > 0) return m.pendingGmailSendRecordCount;
        return m.initialEmailSentCount + m.manualSentCount > 0
          ? m.initialEmailSentCount + m.manualSentCount
          : null;
      default:
        return null;
    }
  }

  return (
    <div className="dashboard dashboard-with-sidebar">
      <header className="dashboard-header">
        <div>
          <h1>Growly Sales — 営業OS</h1>
          <p className="subtitle">Phase 19 日次営業ループ化・返信確認ルーチン</p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={() => void load()} disabled={loading}>
          再読み込み
        </button>
      </header>

      <div className="dashboard-shell">
        <aside className="dashboard-sidebar" aria-label="営業フローナビゲーション">
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
                  {badge !== null && <span className="tab-badge">{badge}</span>}
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
            </button>
          </nav>
          <p className="sidebar-position">
            {activeStep !== null ? (
              <>
                現在: <strong>{activeStep}/7</strong> — {TAB_ITEMS.find((t) => t.id === activeTab)?.label}
              </>
            ) : (
              <>
                運用: <strong>{UTILITY_TAB.label}</strong>
              </>
            )}
          </p>
        </aside>

        <main className="dashboard-main">
          <PilotModeBanner />

          {error && <div className="alert alert-danger">{error}</div>}
          {actionError && <div className="alert alert-danger">{actionError}</div>}

          {activeTab === 'dashboard' && (
            <SalesDashboardView
              onError={handleViewError}
              refreshKey={dataVersion}
              onNavigate={(tab, leadId) => navigateToTab(tab as SalesFlowTab, leadId ?? undefined)}
            />
          )}

          {activeTab === 'leads' &&
            (loading ? (
              <p className="loading">読み込み中…</p>
            ) : (
              <div className="dashboard-body">
                <section className="list-panel">
                  <LeadListView leads={leads} selectedId={selectedId} onSelect={setSelectedId} />
                </section>
                <LeadDetailPanel
                  lead={selectedLead}
                  onUpdated={handleLeadUpdated}
                  onError={setActionError}
                />
              </div>
            ))}

          {activeTab === 'draft-candidates' && (
            <GmailDraftCandidatesView
              onError={handleViewError}
              onDraftCreated={handleRecordSuccess}
              onNavigateToTab={navigateToTab}
              refreshKey={dataVersion}
            />
          )}

          {activeTab === 'send-records' && (
            <SendRecordsView
              onError={handleViewError}
              onRecordSuccess={handleRecordSuccess}
              refreshKey={dataVersion}
              highlightLeadId={highlightLeadId}
            />
          )}

          {activeTab === 'reply-management' && (
            <ReplyManagementView
              onError={handleViewError}
              onUpdated={handleRecordSuccess}
              refreshKey={dataVersion}
            />
          )}

          {activeTab === 'follow-up' && (
            <FollowUpDashboardView onError={handleViewError} refreshKey={dataVersion} />
          )}

          {activeTab === 'settings' && (
            <SettingsView onError={handleViewError} onDataChanged={() => setDataVersion((v) => v + 1)} />
          )}

          {activeTab === 'candidate-collection' && (
            <CandidateCollectionView
              gmailDraftCandidateCount={dashboard?.metrics.gmailDraftCandidateCount ?? 0}
              onError={handleViewError}
              refreshKey={dataVersion}
              onDataChanged={() => setDataVersion((v) => v + 1)}
            />
          )}
        </main>
      </div>
    </div>
  );
}

export type { RecommendedActionTargetTab };
