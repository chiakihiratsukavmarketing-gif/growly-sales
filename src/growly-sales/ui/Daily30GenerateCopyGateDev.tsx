import { GENERATE_DAILY_30_COPY_GATE_LABEL } from './daily30CopyApi.js';

interface Daily30GenerateCopyGateDevProps {
  gateInput: string;
  generating: boolean;
  copyTargetsCount: number;
  onGateInputChange: (value: string) => void;
  onGenerate: () => void;
}

/** 開発者向け: 手入力ゲートによる営業文生成 */
export function Daily30GenerateCopyGateDev({
  gateInput,
  generating,
  copyTargetsCount,
  onGateInputChange,
  onGenerate,
}: Daily30GenerateCopyGateDevProps) {
  const gateOk = gateInput.trim() === GENERATE_DAILY_30_COPY_GATE_LABEL;

  return (
    <div className="daily30-generate-gate-dev">
      <p className="hint">手入力ゲート（開発者向け）— 対象 {copyTargetsCount} 件</p>
      <div className="daily30-fetch-row">
        <input
          className="input input-sm"
          value={gateInput}
          onChange={(e) => onGateInputChange(e.target.value)}
          placeholder={GENERATE_DAILY_30_COPY_GATE_LABEL}
          disabled={generating || copyTargetsCount === 0}
        />
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={!gateOk || generating || copyTargetsCount === 0}
          onClick={onGenerate}
        >
          {generating ? '生成中…' : 'ゲート入力で実行'}
        </button>
      </div>
    </div>
  );
}
