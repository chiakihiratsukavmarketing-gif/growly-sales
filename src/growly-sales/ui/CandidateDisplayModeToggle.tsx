import type { CandidateDisplayMode } from './daily30CandidateFocusMode.js';

export function CandidateDisplayModeToggle({
  mode,
  onChange,
  disabled = false,
}: {
  mode: CandidateDisplayMode;
  onChange: (mode: CandidateDisplayMode) => void;
  disabled?: boolean;
}) {
  return (
    <div className="candidate-display-mode-toggle" role="group" aria-label="表示モード">
      <button
        type="button"
        className={`btn btn-sm ${mode === 'focus' ? 'btn-primary' : 'btn-secondary'}`}
        disabled={disabled}
        aria-pressed={mode === 'focus'}
        onClick={() => onChange('focus')}
      >
        1件ずつ
      </button>
      <button
        type="button"
        className={`btn btn-sm ${mode === 'list' ? 'btn-primary' : 'btn-secondary'}`}
        disabled={disabled}
        aria-pressed={mode === 'list'}
        onClick={() => onChange('list')}
      >
        一覧
      </button>
    </div>
  );
}
