import { IMPORT_DAILY_30_DRAFT_CANDIDATES_GATE_LABEL } from './daily30ImportApi.js';

interface Daily30ImportDraftGateDevProps {
  gateInput: string;
  bulkImporting: boolean;
  importableCount: number;
  onGateInputChange: (value: string) => void;
  onBulkImport: () => void;
}

/** 開発者向け: 手入力ゲートによる一括取り込み */
export function Daily30ImportDraftGateDev({
  gateInput,
  bulkImporting,
  importableCount,
  onGateInputChange,
  onBulkImport,
}: Daily30ImportDraftGateDevProps) {
  const gateOk = gateInput.trim() === IMPORT_DAILY_30_DRAFT_CANDIDATES_GATE_LABEL;

  return (
    <div className="daily30-bulk-import-gate-dev">
      <p className="hint">手入力ゲート（開発者向け）— 取り込み可能 {importableCount} 件</p>
      <div className="daily30-fetch-row">
        <input
          className="input input-sm"
          value={gateInput}
          onChange={(e) => onGateInputChange(e.target.value)}
          placeholder={IMPORT_DAILY_30_DRAFT_CANDIDATES_GATE_LABEL}
          disabled={bulkImporting || importableCount === 0}
        />
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={!gateOk || bulkImporting || importableCount === 0}
          onClick={onBulkImport}
        >
          {bulkImporting ? '取り込み中…' : 'ゲート入力で一括取り込み'}
        </button>
      </div>
    </div>
  );
}
