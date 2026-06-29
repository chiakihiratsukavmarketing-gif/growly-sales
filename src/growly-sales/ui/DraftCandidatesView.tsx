import { useCallback, useEffect, useState } from 'react';
import { DraftCandidateCard } from './DraftCandidateCard.js';
import {
  fetchDraftCandidates,
  runExportDrafts,
  type DraftCandidatesResponse,
} from './draftCandidatesApi.js';

export const DRAFT_UI_WARNING =
  'これはGmail下書きではありません。人間が確認して手動でコピーするための画面です。自動送信は行いません。';

interface DraftCandidatesViewProps {
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
}

export function DraftCandidatesView({ onError, onSuccess }: DraftCandidatesViewProps) {
  const [data, setData] = useState<DraftCandidatesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [exportResult, setExportResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchDraftCandidates();
      setData(result);
    } catch (err) {
      onError(err instanceof Error ? err.message : '下書き候補の読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleExport(): Promise<void> {
    setExporting(true);
    setExportResult(null);
    try {
      const result = await runExportDrafts();
      setData({
        candidates: result.candidates,
        excludedCount: result.excludedCount,
        generatedAt: result.generatedAt,
      });
      const files = result.outputFiles.map((f) => f.split(/[/\\]/).pop()).join(', ');
      setExportResult(`更新完了: ${files}`);
      onSuccess(result.message);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'エクスポートに失敗しました');
    } finally {
      setExporting(false);
    }
  }

  if (loading) {
    return <p className="loading">下書き候補を読み込み中…</p>;
  }

  const candidates = data?.candidates ?? [];

  return (
    <div className="draft-candidates-view">
      <div className="draft-warning alert alert-warn">{DRAFT_UI_WARNING}</div>
      <p className="draft-copy-notice">
        コピーしても送信済みにはなりません。実際に送信した場合のみ、手動送信済みとして記録してください。
      </p>
      <p className="draft-gmail-notice">
        Gmail下書きを作成しても sendStatus は not_sent のままです。emailCandidates がないLeadはGmail下書き対象外（問い合わせフォーム用コピー運用）です。
      </p>

      <div className="draft-toolbar">
        <div className="draft-summary">
          <span>下書き候補: <strong>{candidates.length}</strong> 件</span>
          {data && (
            <span className="draft-excluded">
              （除外: {data.excludedCount} 件 / 取得: {new Date(data.generatedAt).toLocaleString('ja-JP')}）
            </span>
          )}
        </div>
        <div className="draft-toolbar-actions">
          <button type="button" className="btn btn-secondary" onClick={() => void load()} disabled={loading}>
            再読み込み
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void handleExport()}
            disabled={exporting}
          >
            {exporting ? 'エクスポート中…' : '下書きファイルを再生成'}
          </button>
        </div>
      </div>

      {exportResult && <div className="alert alert-success">{exportResult}</div>}

      {candidates.length === 0 ? (
        <div className="list-empty">
          <p>下書き候補はありません。</p>
          <p>営業リストタブで humanReviewStatus=approved にしてから再度ご確認ください。</p>
          <p className="hint">CLI: npm run growly-sales:export-drafts</p>
        </div>
      ) : (
        <div className="draft-card-list">
          {candidates.map((candidate) => (
            <DraftCandidateCard
              key={candidate.leadId}
              candidate={candidate}
              onCopyError={onError}
            />
          ))}
        </div>
      )}
    </div>
  );
}
