import { useCallback, useEffect, useState } from 'react';
import { InfoBanner } from './InfoBanner.js';
import { DevDetails } from './common/DevDetails.js';
import { isDevApiErrorMessage, toUserFacingApiError } from './displayLabels.js';
import {
  APPROVAL_STATUS_LABELS,
  EXECUTION_MODE_LABELS,
  fetchExternalReferenceApprovalStatus,
  type ExternalReferenceApprovalSummaryItem,
} from './daily30ExternalReferenceApprovalApi.js';

interface Daily30ExternalReferenceApprovalPanelProps {
  refreshKey?: number;
}

export function Daily30ExternalReferenceApprovalPanel({
  refreshKey = 0,
}: Daily30ExternalReferenceApprovalPanelProps) {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<ExternalReferenceApprovalSummaryItem[]>([]);
  const [note, setNote] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [devError, setDevError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setDevError(null);
    try {
      const data = await fetchExternalReferenceApprovalStatus();
      setItems(data.items);
      setNote(data.note);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : '外部参照承認状態の読み込みに失敗しました';
      setItems([]);
      setNote('');
      setLoadError(toUserFacingApiError(message));
      if (isDevApiErrorMessage(message)) setDevError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const dryRunReady = items.filter((i) => i.canRunDryRun).length;
  const liveReady = items.filter((i) => i.canRun).length;

  return (
    <div className="external-reference-approval-panel">
      <p className="hint external-reference-approval-intro">
        外部参照 adapter の承認状態（Phase 41.3）。<strong>実サイト巡回は行いません。</strong>
        低頻度実行はサイト別人間承認 + robots/規約確認後のみ。Daily 30 接続は Phase 41.4。
      </p>

      {loading ? <p className="hint">承認 config を読み込み中…</p> : null}
      {loadError ? <InfoBanner variant="warn">{loadError}</InfoBanner> : null}
      {devError ? (
        <DevDetails title="承認状態 API エラー（開発者向け）">
          <p className="mono-cell">{devError}</p>
        </DevDetails>
      ) : null}

      {!loading && items.length > 0 ? (
        <>
          <InfoBanner variant="info">
            dry-run 可能: <strong>{dryRunReady}</strong> 件 / 本番 low_frequency 可能:{' '}
            <strong>{liveReady}</strong> 件（Phase 41.3 ではいずれもネットワークアクセスなし）
          </InfoBanner>
          {note ? <p className="hint">{note}</p> : null}
          <div className="external-reference-approval-table-wrap">
            <table className="external-reference-approval-table">
              <thead>
                <tr>
                  <th>サイト</th>
                  <th>承認状態</th>
                  <th>実行モード</th>
                  <th>dry-run</th>
                  <th>上限（req/候補）</th>
                  <th>備考</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.configId}>
                    <td>{item.displayName}</td>
                    <td>{APPROVAL_STATUS_LABELS[item.approvalStatus] ?? item.approvalStatus}</td>
                    <td>{EXECUTION_MODE_LABELS[item.mode] ?? item.mode}</td>
                    <td>{item.canRunDryRun ? '可' : '不可'}</td>
                    <td>
                      {item.maxRequestsPerRun}/{item.maxCandidatesPerRun}
                    </td>
                    <td className="external-reference-approval-notes">{item.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}
