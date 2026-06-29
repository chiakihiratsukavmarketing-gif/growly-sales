import { useCallback, useEffect, useState } from 'react';
import type { Daily30ReadyForDraftItem } from './daily30ImportApi.js';
import { SectionCard } from './SectionCard.js';
import { InfoBanner } from './InfoBanner.js';
import {
  IMPORT_DAILY_30_DRAFT_CANDIDATES_GATE_LABEL,
  fetchDaily30ReadyForDraft,
  importDaily30DraftCandidate,
  importDaily30DraftCandidatesBulk,
} from './daily30ImportApi.js';
import type { Daily30DraftPipelineProgress } from '../candidates/buildDaily30DraftPipelineProgress.js';
import { SummaryStatCard } from './SummaryStatCard.js';

interface Daily30DraftImportPanelProps {
  onError: (message: string) => void;
  onSuccess?: (message: string) => void;
  refreshKey?: number;
  onChanged?: () => void;
}

export function Daily30DraftImportPanel({
  onError,
  onSuccess,
  refreshKey = 0,
  onChanged,
}: Daily30DraftImportPanelProps) {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Daily30ReadyForDraftItem[]>([]);
  const [pipeline, setPipeline] = useState<Daily30DraftPipelineProgress | null>(null);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [bulkGateInput, setBulkGateInput] = useState('');
  const [bulkImporting, setBulkImporting] = useState(false);
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchDaily30ReadyForDraft();
      setItems(data.items);
      setPipeline(data.draftPipeline);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'ready_for_draft 候補の読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  async function handleImport(item: Daily30ReadyForDraftItem): Promise<void> {
    if (item.importBlockReason) return;
    setImportingId(item.candidate.externalCandidateId);
    try {
      const result = await importDaily30DraftCandidate(item.candidate.externalCandidateId);
      onSuccess?.(
        `${result.lead.companyName} を下書き候補として leads.json に取り込みました（Gmail下書きは未作成）`
      );
      onChanged?.();
      await load();
    } catch (err) {
      onError(err instanceof Error ? err.message : '取り込みに失敗しました');
    } finally {
      setImportingId(null);
    }
  }

  async function handleBulkImport(): Promise<void> {
    if (bulkGateInput.trim() !== IMPORT_DAILY_30_DRAFT_CANDIDATES_GATE_LABEL) return;
    setBulkImporting(true);
    setBulkMessage(null);
    try {
      const result = await importDaily30DraftCandidatesBulk(bulkGateInput.trim());
      setBulkMessage(result.message);
      setBulkGateInput('');
      onSuccess?.(`一括取り込み: ${result.imported.length} 件 / スキップ ${result.skipped.length} 件`);
      onChanged?.();
      await load();
    } catch (err) {
      onError(err instanceof Error ? err.message : '一括取り込みに失敗しました');
    } finally {
      setBulkImporting(false);
    }
  }

  const importable = items.filter((i) => !i.importBlockReason);
  const bulkGateOk = bulkGateInput.trim() === IMPORT_DAILY_30_DRAFT_CANDIDATES_GATE_LABEL;

  if (loading) return <p className="loading">Daily 30 下書き候補取り込みを読み込み中…</p>;

  return (
    <SectionCard title="Daily 30 — 下書き候補取り込み" className="daily30-draft-import-card">
      <InfoBanner variant="info">
        <code>ready_for_draft</code> 候補を leads.json に取り込み、既存の下書き候補タブへ接続します。
        取り込みは <strong>leads.json への保存のみ</strong>（Gmail API は使いません）。
        Gmail 下書き作成は下書き候補タブで <code>CREATE_DRAFTS</code> を別途入力してください。
      </InfoBanner>

      {pipeline && (
        <div className="stats-grid">
          <SummaryStatCard value={pipeline.readyForDraftCount} label="ready_for_draft" highlight />
          <SummaryStatCard value={pipeline.leadsImportPendingCount} label="取り込み待ち" highlight />
          <SummaryStatCard value={pipeline.gmailDraftTabVisibleCount} label="下書き候補タブ表示" />
          <SummaryStatCard value={pipeline.humanReviewPendingCount} label="承認待ち" />
          <SummaryStatCard value={pipeline.gmailDraftCreatedCount} label="Gmail下書き作成済" />
          <SummaryStatCard value={pipeline.sendRecordPendingCount} label="送信記録待ち" />
        </div>
      )}
      {pipeline && <p className="hint">{pipeline.todayProgressLabel}</p>}

      <h3 className="subsection-title">取り込み候補（{items.length}件）</h3>
      {items.length === 0 ? (
        <p className="hint">ready_for_draft の取り込み待ち候補はありません。</p>
      ) : (
        <ul className="candidate-list daily30-draft-import-list">
          {items.map((item) => {
            const c = item.candidate;
            const canImport = !item.importBlockReason;
            return (
              <li key={c.externalCandidateId} className="candidate-list-item daily30-draft-import-item">
                <div className="daily30-draft-import-detail">
                  <strong>{c.companyName}</strong>
                  <p className="hint">{c.websiteUrl ?? c.officialSiteUrl}</p>
                  <p className="hint">To: {c.targetEmail}</p>
                  <p className="hint">確認元: {c.emailCandidateSourceUrl}</p>
                  <p className="hint">件名: {c.generatedEmailSubject}</p>
                  <p className="hint">
                    customHook:{' '}
                    {c.generatedCustomHook
                      ? `${c.generatedCustomHook.slice(0, 80)}${c.generatedCustomHook.length > 80 ? '…' : ''}`
                      : '—'}
                  </p>
                  <p className="hint">
                    {c.pipelineStatus} / {c.importStatus} / QC:{' '}
                    {item.qualityCheckPassed ? '通過' : '要確認'}
                  </p>
                  {item.importBlockReason && (
                    <p className="hint warning-text">取り込み不可: {item.importBlockReason}</p>
                  )}
                </div>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={!canImport || importingId === c.externalCandidateId}
                  onClick={() => void handleImport(item)}
                >
                  {importingId === c.externalCandidateId ? '取り込み中…' : '下書き候補として取り込む'}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="daily30-bulk-import-gate">
        <label className="hint">
          一括取り込み（leads.json のみ）— <code>{IMPORT_DAILY_30_DRAFT_CANDIDATES_GATE_LABEL}</code> と入力
        </label>
        <div className="daily30-fetch-row">
          <input
            className="input"
            value={bulkGateInput}
            onChange={(e) => setBulkGateInput(e.target.value)}
            placeholder={IMPORT_DAILY_30_DRAFT_CANDIDATES_GATE_LABEL}
            disabled={bulkImporting || importable.length === 0}
          />
          <button
            type="button"
            className="btn btn-primary"
            disabled={!bulkGateOk || bulkImporting || importable.length === 0}
            onClick={() => void handleBulkImport()}
          >
            {bulkImporting ? '一括取り込み中…' : `一括取り込み（${importable.length}件）`}
          </button>
        </div>
        {bulkMessage && <p className="hint success-text">{bulkMessage}</p>}
      </div>
    </SectionCard>
  );
}
