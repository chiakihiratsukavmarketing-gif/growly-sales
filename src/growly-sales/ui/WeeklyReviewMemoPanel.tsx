import { useEffect, useMemo, useState } from 'react';
import { SectionCard } from './SectionCard.js';

const STORAGE_KEY_PREFIX = 'growly-sales-weekly-review-';

function getIsoWeekKey(d: Date): string {
  // ISO week date algorithm (local date -> week key)
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  // Thursday in current week decides the year.
  const day = (date.getDay() + 6) % 7; // Mon=0..Sun=6
  date.setDate(date.getDate() - day + 3);
  const weekYear = date.getFullYear();
  const firstThursday = new Date(weekYear, 0, 4);
  const firstDay = (firstThursday.getDay() + 6) % 7;
  firstThursday.setDate(firstThursday.getDate() - firstDay + 3);
  const week = 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000));
  return `${weekYear}-W${String(week).padStart(2, '0')}`;
}

function loadMemo(key: string): string {
  try {
    return localStorage.getItem(`${STORAGE_KEY_PREFIX}${key}`) ?? '';
  } catch {
    return '';
  }
}

function saveMemo(key: string, text: string): void {
  try {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${key}`, text);
  } catch {
    // ignore
  }
}

/** ブラウザ localStorage のみ。leads.json / communicationMemo には保存しない。 */
export function WeeklyReviewMemoPanel() {
  const thisWeekKey = useMemo(() => getIsoWeekKey(new Date()), []);
  const lastWeekKey = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return getIsoWeekKey(d);
  }, []);
  const [weekKey, setWeekKey] = useState(thisWeekKey);
  const [customKey, setCustomKey] = useState('');
  const [memo, setMemo] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setMemo(loadMemo(weekKey));
  }, [weekKey]);

  function handleSave(): void {
    saveMemo(weekKey, memo);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2000);
  }

  return (
    <SectionCard title="週次レビュー用メモ（ローカルのみ）" className="weekly-review-memo-panel">
      <p className="hint">
        このブラウザにだけ保存されます（leads.json / communicationMemo には書き込みません）。
      </p>
      <div className="weekly-summary-header">
        <div className="weekly-toggle">
          <button
            type="button"
            className={`btn btn-secondary btn-sm ${weekKey === thisWeekKey ? 'active' : ''}`}
            onClick={() => setWeekKey(thisWeekKey)}
          >
            今週（{thisWeekKey}）
          </button>
          <button
            type="button"
            className={`btn btn-secondary btn-sm ${weekKey === lastWeekKey ? 'active' : ''}`}
            onClick={() => setWeekKey(lastWeekKey)}
          >
            先週（{lastWeekKey}）
          </button>
        </div>
        <div className="weekly-toggle">
          <input
            className="input"
            style={{ width: 140 }}
            value={customKey}
            onChange={(e) => setCustomKey(e.target.value)}
            placeholder="YYYY-Wxx"
          />
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => customKey.trim() && setWeekKey(customKey.trim())}
          >
            週キーを開く
          </button>
        </div>
      </div>
      <p className="hint">表示中の週キー: <strong>{weekKey}</strong></p>
      <textarea
        className="textarea"
        rows={8}
        value={memo}
        onChange={(e) => setMemo(e.target.value)}
        placeholder={[
          '今週よかったこと',
          '返信が来た理由の仮説',
          '断られた理由の仮説',
          '来週増やすLeadの方向性',
          '文面改善メモ',
        ].join('\n')}
      />
      <div className="daily-ops-log-actions">
        <button type="button" className="btn btn-secondary" onClick={handleSave}>
          週次メモを保存
        </button>
        {saved && <span className="hint success-text">保存しました</span>}
      </div>
    </SectionCard>
  );
}

