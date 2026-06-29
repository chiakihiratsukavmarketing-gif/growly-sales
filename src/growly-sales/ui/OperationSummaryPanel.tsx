import type { OperationSummary } from '../analytics/buildOperationSummary.js';
import { SectionCard } from './SectionCard.js';
import { InfoBanner } from './InfoBanner.js';

export const OP_SUMMARY_WARNING =
  'この改善提案はローカルJSONの手動記録をもとにしたルールベースの提案です。AI APIは使用していません。';

function renderList(title: string, items: string[]) {
  return (
    <div className="op-block">
      <h4 className="subheading">{title}</h4>
      {items.length === 0 ? (
        <p className="hint">—</p>
      ) : (
        <ul>
          {items.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface OperationSummaryPanelProps {
  summary: OperationSummary;
  generatedAt: string;
}

export function OperationSummaryPanel({ summary, generatedAt }: OperationSummaryPanelProps) {
  return (
    <SectionCard title="運用サマリー / 改善提案">
      <InfoBanner variant="warn">{OP_SUMMARY_WARNING}</InfoBanner>
      <p className="hint">生成時刻: {new Date(generatedAt).toLocaleString('ja-JP')}</p>

      <div className="op-block">
        <h4 className="subheading">現在の状態</h4>
        <p className="text-block">{summary.overallStatus}</p>
      </div>

      {renderList('良い兆候', summary.goodSignals)}
      {renderList('注意点', summary.warningSignals)}
      {renderList('次にやること', summary.nextRecommendedActions)}
      {renderList('フォロー推奨', summary.followUpRecommendations)}
      {renderList('改善アイデア', summary.improvementIdeas)}
      {renderList('データ品質メモ', summary.dataQualityNotes)}
    </SectionCard>
  );
}
