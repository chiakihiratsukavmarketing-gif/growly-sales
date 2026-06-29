import { useCallback, useEffect, useState } from 'react';
import { AnalyticsSummaryCards } from './AnalyticsSummaryCards.js';
import { AnalyticsTable } from './AnalyticsTable.js';
import { FollowUpList } from './FollowUpList.js';
import { NextActionList } from './NextActionList.js';
import { fetchSalesAnalytics } from './salesAnalyticsApi.js';
import { fetchOperationSummary } from './operationSummaryApi.js';
import { OperationSummaryPanel } from './OperationSummaryPanel.js';
import { fetchMvpReadiness } from './mvpReadinessApi.js';
import { fetchPilotSummary } from './pilotSummaryApi.js';
import { fetchContactPathAnalytics } from './externalCandidatesApi.js';
import { PilotSummaryPanel } from './PilotSummaryPanel.js';
import { ContactPathAnalyticsPanel } from './ContactPathAnalyticsPanel.js';
import { PilotModeBanner } from './PilotModeBanner.js';
import { InfoBanner } from './InfoBanner.js';
import { SectionCard } from './SectionCard.js';

export const ANALYTICS_WARNING =
  'この分析はローカルJSONに手動記録された結果を集計したものです。Gmail・外部API・自動送信は使用していません。';

interface SalesAnalyticsViewProps {
  onError: (message: string) => void;
}

export function SalesAnalyticsView({ onError }: SalesAnalyticsViewProps) {
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState<Awaited<ReturnType<typeof fetchSalesAnalytics>> | null>(null);
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof fetchOperationSummary>> | null>(null);
  const [mvp, setMvp] = useState<Awaited<ReturnType<typeof fetchMvpReadiness>> | null>(null);
  const [pilot, setPilot] = useState<Awaited<ReturnType<typeof fetchPilotSummary>> | null>(null);
  const [contactPath, setContactPath] = useState<Awaited<ReturnType<typeof fetchContactPathAnalytics>> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, s, m, p, cp] = await Promise.all([
        fetchSalesAnalytics(),
        fetchOperationSummary(),
        fetchMvpReadiness(),
        fetchPilotSummary(),
        fetchContactPathAnalytics(),
      ]);
      setAnalytics(a);
      setSummary(s);
      setMvp(m);
      setPilot(p);
      setContactPath(cp);
    } catch (err) {
      onError(err instanceof Error ? err.message : '営業分析の読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <p className="loading">営業分析を読み込み中…</p>;
  if (!analytics) return null;

  return (
    <div className="analytics-view">
      <PilotModeBanner />
      <InfoBanner variant="info">{ANALYTICS_WARNING}</InfoBanner>
      <p className="hint">
        生成時刻: {new Date(analytics.generatedAt).toLocaleString('ja-JP')}
        {analytics.leadsPath ? ` / leads: ${analytics.leadsPath}` : ''}
      </p>

      {mvp && (
        <SectionCard title="ローカル手動MVPステータス" className="mvp-status-card">
          <InfoBanner variant={mvp.ready ? 'success' : 'danger'}>
            ローカル手動MVP: {mvp.ready ? 'ready ✅' : 'not ready ❌'}
          </InfoBanner>
          {!mvp.ready && mvp.failedChecks.length > 0 && (
            <>
              <h4 className="subheading">未完了チェック</h4>
              <ul>
                {mvp.failedChecks.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </>
          )}
          {mvp.nextSteps.length > 0 && (
            <>
              <h4 className="subheading">次にやること</h4>
              <ul>
                {mvp.nextSteps.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </>
          )}
        </SectionCard>
      )}

      {pilot && <PilotSummaryPanel summary={pilot.summary} />}

      {contactPath && <ContactPathAnalyticsPanel analytics={contactPath.analytics} />}

      <AnalyticsSummaryCards analytics={analytics.analytics} />

      {summary && <OperationSummaryPanel summary={summary.summary} generatedAt={summary.generatedAt} />}

      <AnalyticsTable title="leadScore別集計" rows={analytics.analytics.leadScoreBreakdown} />
      <AnalyticsTable title="salesAngle別集計" rows={analytics.analytics.salesAngleBreakdown} />

      <FollowUpList items={analytics.analytics.followUpList} />
      <NextActionList items={analytics.analytics.nextActionList} />
    </div>
  );
}

