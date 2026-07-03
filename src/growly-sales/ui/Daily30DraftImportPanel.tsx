import { useCallback, useEffect, useState } from 'react';
import type { Daily30ReadyForDraftItem, Daily30ReadyForDraftResponse } from './daily30ImportApi.js';
import { SectionCard } from './SectionCard.js';
import { InfoBanner } from './InfoBanner.js';
import {
  IMPORT_DAILY_30_DRAFT_CANDIDATES_GATE_LABEL,
  fetchDaily30ReadyForDraft,
  importDaily30DraftCandidate,
  importDaily30DraftCandidatesBulk,
} from './daily30ImportApi.js';
import type { Daily30DraftPipelineProgress } from '../candidates/buildDaily30DraftPipelineProgress.js';
import { resolveEmailSourceFromCandidate } from '../candidates/resolveEmailSourceDisplay.js';
import { EmailSourceDisplay } from './EmailSourceDisplay.js';
import { SummaryStatCard } from './SummaryStatCard.js';
import { HumanGateConfirmModal } from './HumanGateConfirmModal.js';
import { DevDetails } from './common/DevDetails.js';
import { Daily30ImportDraftGateDev } from './Daily30ImportDraftGateDev.js';

interface Daily30DraftImportPanelProps {
  onError: (message: string) => void;
  onSuccess?: (message: string) => void;
  refreshKey?: number;
  onChanged?: () => void;
}

function resolveBulkImportDisabledReason(importableCount: number): string | null {
  if (importableCount === 0) {
    return '取り込み可能な ready_for_draft 候補がありません（未取り込み・非除外のみ対象）。';
  }
  return null;
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
  const [counts, setCounts] = useState<Daily30ReadyForDraftResponse['counts'] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [bulkGateInput, setBulkGateInput] = useState('');
  const [bulkImporting, setBulkImporting] = useState(false);
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);
  const [showBulkModal, setShowBulkModal] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchDaily30ReadyForDraft();
      setItems(data.items);
      setPipeline(data.draftPipeline);
      setCounts(data.counts);
      setWarnings(data.warnings ?? []);
    } catch (err) {
      const message = err instanceof Error ? err.message : '取り込み候補の読み込みに失敗しました';
      setItems([]);
      setPipeline(null);
      setCounts(null);
      setWarnings([]);
      if (!message.includes('Not found') || !message.includes('/api/')) {
        onError(message);
      }
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

  async function executeBulkImport(): Promise<void> {
    setBulkImporting(true);
    setBulkMessage(null);
    try {
      const result = await importDaily30DraftCandidatesBulk(
        IMPORT_DAILY_30_DRAFT_CANDIDATES_GATE_LABEL
      );
      setBulkMessage(result.message);
      setBulkGateInput('');
      setShowBulkModal(false);
      onSuccess?.(`一括取り込み: ${result.imported.length} 件 / スキップ ${result.skipped.length} 件`);
      onChanged?.();
      await load();
    } catch (err) {
      onError(err instanceof Error ? err.message : '一括取り込みに失敗しました');
    } finally {
      setBulkImporting(false);
    }
  }

  async function handleBulkImportDev(): Promise<void> {
    if (bulkGateInput.trim() !== IMPORT_DAILY_30_DRAFT_CANDIDATES_GATE_LABEL) return;
    await executeBulkImport();
  }

  const importable = items.filter((i) => !i.importBlockReason);
  const bulkDisabledReason = resolveBulkImportDisabledReason(importable.length);
  const canBulkImport = bulkDisabledReason === null;

  if (loading) return <p className="loading">Daily 30 下書き候補取り込みを読み込み中…</p>;

  if (items.length === 0) {
    return (
      <SectionCard title="下書き候補取り込み" className="daily30-draft-import-card">
        <p className="hint">
          <strong>下書き候補取り込み 0件</strong>
        </p>
        <p className="hint">現在、取り込み可能な候補はありません。</p>
        <DevDetails title="詳細操作（開発者向け）">
          <Daily30ImportDraftGateDev
            gateInput={bulkGateInput}
            bulkImporting={bulkImporting}
            importableCount={importable.length}
            onGateInputChange={setBulkGateInput}
            onBulkImport={() => void handleBulkImportDev()}
          />
        </DevDetails>
      </SectionCard>
    );
  }

  return (
    <SectionCard title="下書き候補取り込み" className="daily30-draft-import-card">
      <InfoBanner variant="info">
        品質チェック通過候補を leads.json に取り込みます。Gmail下書きは別途下書き候補タブで作成します。
      </InfoBanner>

      {counts && (
        <div className="stats-grid daily30-workflow-stats">
          <SummaryStatCard value={counts.approvedLead} label="Lead化承認済み" />
          <SummaryStatCard value={counts.generatedCopy} label="営業文生成済み" />
          <SummaryStatCard value={counts.readyForDraft} label="下書き待ち" highlight />
          <SummaryStatCard value={counts.importPending} label="取り込み可能" highlight />
        </div>
      )}

      {warnings.length > 0 && (
        <InfoBanner variant="warning">
          <strong>確認事項（{warnings.length}件）</strong>
          <ul className="hint-list daily30-warnings-list">
            {warnings.slice(0, 5).map((w) => (
              <li key={w}>{w}</li>
            ))}
            {warnings.length > 5 ? <li>…他 {warnings.length - 5} 件</li> : null}
          </ul>
        </InfoBanner>
      )}

      {pipeline ? (
        <div className="stats-grid">
          <SummaryStatCard value={pipeline.readyForDraftCount} label="ready_for_draft" highlight />
          <SummaryStatCard value={pipeline.leadsImportPendingCount} label="取り込み待ち" highlight />
          <SummaryStatCard value={pipeline.gmailDraftCreatedCount} label="Gmail下書き作成済" />
          <SummaryStatCard value={pipeline.sendRecordPendingCount} label="送信記録待ち" />
        </div>
      ) : null}
      {pipeline?.todayProgressLabel ? <p className="hint">{pipeline.todayProgressLabel}</p> : null}

      <h3 className="subsection-title">取り込み候補（{items.length}件）</h3>
      {items.length === 0 ? (
        <p className="hint">ready_for_draft の取り込み待ちはありません。</p>
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
                  <EmailSourceDisplay
                    info={resolveEmailSourceFromCandidate(c)}
                    variant="compact"
                    showOfficialSite
                    className="daily30-draft-import-email-source"
                  />
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
                  className="btn btn-primary btn-xs"
                  disabled={!canImport || importingId === c.externalCandidateId}
                  onClick={() => void handleImport(item)}
                >
                  {importingId === c.externalCandidateId ? '取り込み中…' : '取り込む'}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="daily30-bulk-import-gate human-gate-action-block">
        <p className="hint human-gate-action-hint">
          営業文生成済み候補を下書き候補へ取り込みます。Gmail下書き・送信は行いません。
        </p>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!canBulkImport || bulkImporting}
          onClick={() => setShowBulkModal(true)}
        >
          {bulkImporting ? '取り込み中…' : '下書き候補へ取り込む'}
        </button>
        {bulkDisabledReason && (
          <p className="hint warning-text human-gate-disabled-reason">{bulkDisabledReason}</p>
        )}
        {bulkMessage && <p className="hint success-text">{bulkMessage}</p>}

        <DevDetails title="詳細操作（開発者向け）">
          <Daily30ImportDraftGateDev
            gateInput={bulkGateInput}
            bulkImporting={bulkImporting}
            importableCount={importable.length}
            onGateInputChange={setBulkGateInput}
            onBulkImport={() => void handleBulkImportDev()}
          />
        </DevDetails>
      </div>

      {showBulkModal && (
        <HumanGateConfirmModal
          title="下書き候補へ取り込む"
          message="ready_for_draft の候補を leads.json に取り込みます。Gmail下書き作成・送信は行いません。実行しますか？"
          targetCount={importable.length}
          safetyNotes={[
            'leads.json に候補を追加します',
            'Gmail下書きは作成しません',
            'Gmail送信は行いません',
          ]}
          confirmLabel="下書き候補へ取り込む"
          confirming={bulkImporting}
          onConfirm={() => void executeBulkImport()}
          onCancel={() => !bulkImporting && setShowBulkModal(false)}
        />
      )}
    </SectionCard>
  );
}
