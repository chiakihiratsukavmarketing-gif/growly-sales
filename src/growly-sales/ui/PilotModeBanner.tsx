import { useEffect, useState } from 'react';
import { fetchGrowlyStorageStatus, type GrowlyStorageStatusResponse } from './daily30Api.js';

export const PILOT_MODE_LABEL = 'ローカル手動MVP / パイロット運用';
export const PILOT_MODE_EXTERNAL_API = '外部API：Cloud Scheduler 連携可';
export const PILOT_MODE_GMAIL = 'Gmail：手動のみ';
export const PILOT_MODE_SEND_DISABLED = '自動送信：なし';
export const PILOT_MODE_STORAGE = '保存先：ローカルJSON';

const MODE_CHIPS_BASE = [
  PILOT_MODE_EXTERNAL_API,
  PILOT_MODE_GMAIL,
  PILOT_MODE_SEND_DISABLED,
] as const;

export function PilotModeBanner({ compact = false }: { compact?: boolean }) {
  const [status, setStatus] = useState<GrowlyStorageStatusResponse | null>(null);

  useEffect(() => {
    void fetchGrowlyStorageStatus()
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  const pilotLabel = status?.pilotModeLabel ?? 'ローカル手動MVP / パイロット運用';
  const storageLabel = status?.storageLabel ?? '保存先：ローカルJSON';

  if (compact) {
    return (
      <div className="pilot-mode-banner pilot-mode-banner-compact" role="status" aria-label="パイロット運用モード">
        <span className="pilot-mode-label">現在モード</span>
        <span className="pilot-mode-value pilot-mode-value-compact">{pilotLabel}</span>
        <div className="pilot-mode-chips pilot-mode-chips-compact">
          {MODE_CHIPS_BASE.map((chip) => (
            <span key={chip} className="mode-chip mode-chip-compact">
              {chip}
            </span>
          ))}
          <span className="mode-chip mode-chip-compact">{storageLabel}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="pilot-mode-banner" role="status" aria-label="パイロット運用モード">
      <div className="pilot-mode-main">
        <span className="pilot-mode-label">現在モード</span>
        <span className="pilot-mode-value">{pilotLabel}</span>
      </div>
      <div className="pilot-mode-chips">
        {MODE_CHIPS_BASE.map((chip) => (
          <span key={chip} className="mode-chip">
            {chip}
          </span>
        ))}
        <span className="mode-chip">{storageLabel}</span>
      </div>
    </div>
  );
}
