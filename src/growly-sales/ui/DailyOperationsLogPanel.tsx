import { useEffect, useState } from 'react';
import { SectionCard } from './SectionCard.js';

const STORAGE_PREFIX = 'growly-sales-daily-ops-log-';

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function loadLog(): string {
  try {
    return localStorage.getItem(`${STORAGE_PREFIX}${todayKey()}`) ?? '';
  } catch {
    return '';
  }
}

function saveLog(text: string): void {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${todayKey()}`, text);
  } catch {
    // localStorage unavailable — ignore
  }
}

/** ブラウザ localStorage のみ。サーバー・leads.json には保存しません。 */
export function DailyOperationsLogPanel() {
  const [memo, setMemo] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setMemo(loadLog());
  }, []);

  function handleSave(): void {
    saveLog(memo);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2000);
  }

  return (
    <SectionCard title="今日の営業メモ（ローカルのみ）" className="daily-ops-log-panel">
      <p className="hint">
        このブラウザにだけ保存されます（communicationMemo や leads.json には書き込みません）。
        日付: {todayKey()}
      </p>
      <textarea
        className="textarea daily-ops-log-textarea"
        rows={4}
        value={memo}
        onChange={(e) => setMemo(e.target.value)}
        placeholder="例: 返信待ち11社を確認 / 次は候補収集で2社追加"
      />
      <div className="daily-ops-log-actions">
        <button type="button" className="btn btn-secondary" onClick={handleSave}>
          メモを保存
        </button>
        {saved && <span className="hint success-text">保存しました</span>}
      </div>
    </SectionCard>
  );
}
