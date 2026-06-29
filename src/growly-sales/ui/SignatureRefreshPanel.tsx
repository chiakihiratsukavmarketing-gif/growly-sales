import { useCallback, useEffect, useState } from 'react';
import { SectionCard } from './SectionCard.js';
import { InfoBanner } from './InfoBanner.js';
import {
  fetchSignatureRefreshPreview,
  refreshUnsentSignaturesApi,
  type SignatureRefreshPreviewItem,
} from './signatureRefreshApi.js';

interface SignatureRefreshPanelProps {
  onError: (message: string) => void;
  onRefreshed?: () => void;
}

export function SignatureRefreshPanel({ onError, onRefreshed }: SignatureRefreshPanelProps) {
  const [targets, setTargets] = useState<SignatureRefreshPreviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [resultMessage, setResultMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setResultMessage(null);
    try {
      const preview = await fetchSignatureRefreshPreview();
      setTargets(preview.targets);
    } catch (err) {
      onError(err instanceof Error ? err.message : '署名プレビューの読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleConfirmRefresh(): Promise<void> {
    setRefreshing(true);
    try {
      const result = await refreshUnsentSignaturesApi();
      setConfirmOpen(false);
      const names = result.refreshed.map((r) => r.companyName).join('、');
      setResultMessage(
        `${result.refreshedCount}件を ${result.expectedSignatureEmail} に更新しました` +
          (names ? `（${names}）` : '') +
          (result.clearedDrafts.length > 0
            ? `。旧下書き無効: ${result.clearedDrafts.join('、')}`
            : '')
      );
      onRefreshed?.();
      await load();
    } catch (err) {
      onError(err instanceof Error ? err.message : '署名の一括更新に失敗しました');
      setConfirmOpen(false);
    } finally {
      setRefreshing(false);
    }
  }

  if (loading) return <p className="loading">署名更新対象を確認中…</p>;

  const expected = targets[0]?.expectedSignatureEmail ?? 'c_hiratsuka@wantreach.jp';

  return (
    <SectionCard title="未送信Lead 署名一括更新" className="signature-refresh-panel">
      <InfoBanner variant="info">
        未送信（sendStatus=not_sent）Lead の emailBody 署名のみ更新します。送信済み10社の本文・履歴は変更しません。Gmail
        API は呼び出しません。
      </InfoBanner>
      <p className="hint">
        標準署名Email: <strong>{expected}</strong>（From / Reply-To / 署名Email と統一）
      </p>

      {resultMessage && <div className="alert alert-success">{resultMessage}</div>}

      {targets.length === 0 ? (
        <p className="hint success-text">更新対象の未送信 Lead はありません（署名は最新です）。</p>
      ) : (
        <>
          <p className="hint warning-text">更新対象 {targets.length}件（送信済み Lead はスキップ）</p>
          <ul className="signature-refresh-list">
            {targets.map((item) => (
              <li key={item.leadId}>
                <strong>{item.companyName}</strong>
                <span className="signature-change">
                  {item.currentSignatureEmail ?? '（署名なし）'} → {item.expectedSignatureEmail}
                </span>
                {item.hadDraft && (
                  <span className="badge badge-warn">旧Gmail下書きは無効化されます</span>
                )}
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="btn btn-primary"
            disabled={refreshing}
            onClick={() => setConfirmOpen(true)}
          >
            署名を一括更新
          </button>
        </>
      )}

      {confirmOpen && (
        <div className="modal-overlay" role="presentation">
          <div className="modal-dialog" role="dialog" aria-labelledby="sig-refresh-title">
            <h3 id="sig-refresh-title">署名一括更新の確認</h3>
            <p>
              未送信 {targets.length}件の emailBody 署名を <strong>{expected}</strong>{' '}
              に更新します。送信済み Lead は変更しません。
            </p>
            <p className="hint">下書き作成済みの Lead は gmailDraftStatus を none に戻し、再作成が必要です。</p>
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-primary"
                disabled={refreshing}
                onClick={() => void handleConfirmRefresh()}
              >
                {refreshing ? '更新中…' : '更新する'}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={refreshing}
                onClick={() => setConfirmOpen(false)}
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}
    </SectionCard>
  );
}
