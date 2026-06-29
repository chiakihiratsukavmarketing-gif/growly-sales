import { useCallback, useEffect, useState } from 'react';
import type { Daily30ChecklistItem, Daily30OperationsSummary } from '../candidates/buildDaily30OperationsSummary.js';
import {
  DAILY_30_AREA_EXPANSION_LABEL,
  DAILY_30_GATES,
  DAILY_30_SAFETY_RULES,
} from '../candidates/daily30OperationsConfig.js';
import { SectionCard } from './SectionCard.js';
import { InfoBanner } from './InfoBanner.js';
import { SummaryStatCard } from './SummaryStatCard.js';
import { fetchDaily30Dashboard, type Daily30DashboardResponse } from './daily30Api.js';

interface Daily30OperationsPanelProps {
  onError: (message: string) => void;
  refreshKey?: number;
}

function checklistStatusLabel(status: Daily30ChecklistItem['status']): string {
  if (status === 'complete') return '完了';
  if (status === 'current') return '今ここ';
  return '未着手';
}

export function Daily30OperationsPanel({ onError, refreshKey = 0 }: Daily30OperationsPanelProps) {
  const [loading, setLoading] = useState(true);
  const [operations, setOperations] = useState<Daily30OperationsSummary | null>(null);
  const [areaExpansion, setAreaExpansion] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result: Daily30DashboardResponse = await fetchDaily30Dashboard();
      setOperations(result.operations ?? null);
      setAreaExpansion(result.areaExpansion);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Daily 30 運用サマリーの読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  if (loading) return <p className="loading">Daily 30 運用サマリーを読み込み中…</p>;
  if (!operations) return null;

  return (
    <SectionCard title="Daily 30 運用統合（完成版）" className="daily30-operations-card">
      <InfoBanner variant="success">
        収集 → Lead化承認 → 営業文生成 → 品質チェック → 取り込み → Gmail下書き → 手動送信 → 記録まで、
        このタブで一連の流れを確認できます。自動送信は<strong>行いません</strong>。
      </InfoBanner>

      <p className="hint">
        バッチ: {operations.batchId} / エリア拡大順: {areaExpansion || DAILY_30_AREA_EXPANSION_LABEL}
      </p>

      <InfoBanner variant="info">
        <strong>次にやること:</strong> {operations.nextAction}
      </InfoBanner>

      <h3 className="subsection-title">今日の進捗サマリー</h3>
      <div className="stats-grid">
        <SummaryStatCard value={operations.target} label="今日の目標" highlight />
        <SummaryStatCard value={operations.collectedCount} label="収集済み" highlight />
        <SummaryStatCard value={operations.emailFoundCount} label="email_found" />
        <SummaryStatCard value={operations.leadApprovalPendingCount} label="Lead化承認待ち" />
        <SummaryStatCard value={operations.copyPendingCount} label="copy生成待ち" />
        <SummaryStatCard value={operations.readyForDraftCount} label="ready_for_draft" highlight />
        <SummaryStatCard value={operations.leadsImportPendingCount} label="取り込み待ち" />
        <SummaryStatCard value={operations.gmailDraftTabVisibleCount} label="下書き候補タブ" />
        <SummaryStatCard value={operations.gmailDraftCreatedCount} label="Gmail下書き作成済" />
        <SummaryStatCard value={operations.sendRecordPendingCount} label="送信記録待ち" />
        <SummaryStatCard value={operations.sentTodayCount} label="送信済み（本日batch）" />
        <SummaryStatCard value={operations.shortfall} label="今日の未達" />
      </div>

      <h3 className="subsection-title">エンドツーエンドチェックリスト</h3>
      <ol className="daily30-checklist workflow-steps-numbered">
        {operations.checklist.map((item) => (
          <li
            key={item.id}
            className={`daily30-checklist-item daily30-checklist-${item.status}`}
          >
            <span className={`daily30-checklist-badge daily30-checklist-badge-${item.status}`}>
              {checklistStatusLabel(item.status)}
            </span>
            <span>{item.label}</span>
            {item.gate && (
              <code className="daily30-checklist-gate">{item.gate}</code>
            )}
            {item.hint && <span className="hint"> — {item.hint}</span>}
          </li>
        ))}
      </ol>

      <h3 className="subsection-title">ゲートの役割（混同しないこと）</h3>
      <ul className="policy-list daily30-gates-list">
        {operations.gates.map((gate) => (
          <li key={gate.token}>
            <code>{gate.token}</code> — {gate.purpose}
            <span className="hint">
              {gate.callsGmailApi ? '（Gmail API使用）' : '（Gmail API不使用）'} — {gate.note}
            </span>
          </li>
        ))}
      </ul>

      <h3 className="subsection-title">毎日の運用手順</h3>
      <ol className="workflow-steps workflow-steps-numbered daily30-daily-procedure">
        {operations.dailyProcedure.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>

      <h3 className="subsection-title">Daily 30 安全ルール</h3>
      <ul className="policy-list daily30-safety-rules">
        {operations.safetyRules.map((rule) => (
          <li key={rule}>{rule}</li>
        ))}
      </ul>
    </SectionCard>
  );
}

export function Daily30SafetyRulesPanel() {
  return (
    <SectionCard title="Daily 30 安全ルール">
      <InfoBanner variant="info">
        送信済み11社を含む既存 Lead の送信・返信履歴は上書きしません。
      </InfoBanner>
      <ul className="policy-list daily30-safety-rules">
        {DAILY_30_SAFETY_RULES.map((rule) => (
          <li key={rule}>{rule}</li>
        ))}
      </ul>
      <h3 className="subsection-title">ゲートの分離</h3>
      <ul className="policy-list">
        {DAILY_30_GATES.map((gate) => (
          <li key={gate.token}>
            <code>{gate.token}</code> — {gate.purpose}
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}
