export const PILOT_MODE_LABEL = 'ローカル手動MVP / パイロット運用';

export const PILOT_MODE_EXTERNAL_API = '外部API：未使用';
export const PILOT_MODE_GMAIL = 'Gmail：未使用';
export const PILOT_MODE_SEND_DISABLED = '自動送信：なし';
export const PILOT_MODE_STORAGE = '保存先：ローカルJSON';

const MODE_CHIPS = [
  PILOT_MODE_EXTERNAL_API,
  PILOT_MODE_GMAIL,
  PILOT_MODE_SEND_DISABLED,
  PILOT_MODE_STORAGE,
];

export function PilotModeBanner() {
  return (
    <div className="pilot-mode-banner" role="status" aria-label="パイロット運用モード">
      <div className="pilot-mode-main">
        <span className="pilot-mode-label">現在モード</span>
        <span className="pilot-mode-value">{PILOT_MODE_LABEL}</span>
      </div>
      <div className="pilot-mode-chips">
        {MODE_CHIPS.map((chip) => (
          <span key={chip} className="mode-chip">
            {chip}
          </span>
        ))}
      </div>
    </div>
  );
}
