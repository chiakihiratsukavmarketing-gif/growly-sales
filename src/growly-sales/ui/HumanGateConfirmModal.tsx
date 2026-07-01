interface HumanGateConfirmModalProps {
  title: string;
  message: string;
  targetCount: number;
  targetCountLabel?: string;
  safetyNotes: readonly string[];
  confirmLabel: string;
  confirming: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** 人間ゲート操作の確認モーダル（安全ゲートは内部で既存トークンを送信） */
export function HumanGateConfirmModal({
  title,
  message,
  targetCount,
  targetCountLabel = '対象件数',
  safetyNotes,
  confirmLabel,
  confirming,
  onConfirm,
  onCancel,
}: HumanGateConfirmModalProps) {
  return (
    <div className="modal-overlay" role="presentation" onClick={onCancel}>
      <div
        className="modal-dialog human-gate-confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="human-gate-confirm-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="human-gate-confirm-title" className="modal-title">
          {title}
        </h3>
        <p className="modal-lead">{message}</p>

        <dl className="confirm-dl">
          <div className="confirm-row">
            <dt>{targetCountLabel}</dt>
            <dd>{targetCount} 件</dd>
          </div>
        </dl>

        <ul className="human-gate-safety-list hint-list">
          {safetyNotes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>

        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={confirming}>
            キャンセル
          </button>
          <button type="button" className="btn btn-primary" onClick={onConfirm} disabled={confirming}>
            {confirming ? '実行中…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
