import { useCallback, useEffect, useRef, useState } from 'react';
import type { Lead } from '../../types/lead.js';
import type { ManualGmailSendPreview } from '../workflow/recordManualGmailSent.js';
import { fetchLeads } from './api.js';
import {
  fetchSendRecordPending,
  recordManualGmailSentApi,
} from './sendRecordApi.js';
import { LeadStatusBadge } from './LeadStatusBadge.js';
import { SectionCard } from './SectionCard.js';
import { InfoBanner } from './InfoBanner.js';
import { ManualSendRecordDialog } from './ManualSendRecordDialog.js';

interface SendRecordsViewProps {
  onError: (message: string) => void;
  onRecordSuccess?: (lead: Lead) => void;
  refreshKey?: number;
  highlightLeadId?: string | null;
}

function isSentLead(lead: Lead): boolean {
  return lead.sendStatus === 'sent' || lead.sendStatus === 'manual_sent';
}

function formatSentAt(lead: Lead): string {
  if (lead.manualSentAt) {
    return new Date(lead.manualSentAt).toLocaleString('ja-JP');
  }
  return '—';
}

export function SendRecordsView({
  onError,
  onRecordSuccess,
  refreshKey = 0,
  highlightLeadId = null,
}: SendRecordsViewProps) {
  const [pending, setPending] = useState<ManualGmailSendPreview[]>([]);
  const [sentLeads, setSentLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogPreview, setDialogPreview] = useState<ManualGmailSendPreview | null>(null);
  const [recording, setRecording] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const highlightRef = useRef<HTMLElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setSuccessMessage(null);
    try {
      const [pendingRes, allLeads] = await Promise.all([fetchSendRecordPending(), fetchLeads()]);
      setPending(pendingRes.pending);
      setSentLeads(
        allLeads
          .filter(isSentLead)
          .sort((a, b) => {
            const ta = a.manualSentAt ?? a.updatedAt;
            const tb = b.manualSentAt ?? b.updatedAt;
            return tb.localeCompare(ta);
          })
      );
    } catch (err) {
      onError(err instanceof Error ? err.message : '送信記録の読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  useEffect(() => {
    if (!highlightLeadId || loading) return;
    const el = highlightRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlightLeadId, loading, pending]);

  async function handleConfirmRecord(): Promise<void> {
    if (!dialogPreview) return;
    setRecording(true);
    try {
      const result = await recordManualGmailSentApi(dialogPreview.leadId, {
        draftId: dialogPreview.draftId,
      });
      setDialogPreview(null);
      setSuccessMessage(`${result.preview.companyName} を手動送信済みに記録しました`);
      onRecordSuccess?.(result.lead);
      await load();
    } catch (err) {
      onError(err instanceof Error ? err.message : '手動送信の記録に失敗しました');
      setDialogPreview(null);
    } finally {
      setRecording(false);
    }
  }

  if (loading) return <p className="loading">送信記録を読み込み中…</p>;

  return (
    <div className="send-records-view">
      <InfoBanner variant="info">
        <strong>Gmail で人間が手動送信した後</strong>に記録する画面です。Growly Sales からメール送信・自動送信は行いません。
      </InfoBanner>
      {highlightLeadId && pending.some((p) => p.leadId === highlightLeadId) && (
        <InfoBanner variant="success">
          下書き作成した Lead を強調表示しています。Gmail で送信後、「手動送信済みに記録」を押してください。
        </InfoBanner>
      )}
      {successMessage && <div className="alert alert-success">{successMessage}</div>}

      <SectionCard title={`未送信・下書きあり（${pending.length}件）`} className="send-pending-section">
        {pending.length === 0 ? (
          <p className="hint">Gmail 下書き作成済みで未記録の Lead はありません。</p>
        ) : (
          <div className="pending-record-list">
            {pending.map((item) => {
              const highlighted = highlightLeadId === item.leadId;
              return (
              <article
                key={item.leadId}
                ref={highlighted ? highlightRef : undefined}
                className={`pending-record-card ${highlighted ? 'pending-record-highlight' : ''}`}
              >
                <div className="pending-record-main">
                  <h4 className="pending-company">{item.companyName}</h4>
                  <p className="pending-meta">
                    To: {item.to} / draftId: <span className="mono-cell">{item.draftId}</span>
                  </p>
                  <p className="pending-subject">件名: {item.subject}</p>
                </div>
                <div className="pending-record-actions">
                  <p className="pending-hint">Gmailで送信後に押してください</p>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => setDialogPreview(item)}
                  >
                    手動送信済みに記録
                  </button>
                </div>
              </article>
              );
            })}
          </div>
        )}
      </SectionCard>

      <SectionCard title={`送信済み（${sentLeads.length}件）`}>
        {sentLeads.length === 0 ? (
          <p className="hint">送信記録はありません。</p>
        ) : (
          <div className="lead-table-wrap">
            <table className="lead-table">
              <thead>
                <tr>
                  <th>会社名</th>
                  <th>送信状態</th>
                  <th>送信方法</th>
                  <th>送信日時</th>
                  <th>返信</th>
                  <th>下書きID</th>
                  <th>宛先</th>
                </tr>
              </thead>
              <tbody>
                {sentLeads.map((lead) => (
                  <tr key={lead.id}>
                    <td className="company-name">{lead.companyName}</td>
                    <td>
                      <LeadStatusBadge kind="send" value={lead.sendStatus} />
                    </td>
                    <td>{lead.manualSendMethod ?? '—'}</td>
                    <td>{formatSentAt(lead)}</td>
                    <td>
                      <LeadStatusBadge kind="send" value={lead.replyStatus} />
                    </td>
                    <td className="mono-cell">{lead.gmailDraftId ?? '—'}</td>
                    <td>{lead.emailCandidates[0] ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {dialogPreview && (
        <ManualSendRecordDialog
          preview={dialogPreview}
          recording={recording}
          onConfirm={() => void handleConfirmRecord()}
          onCancel={() => !recording && setDialogPreview(null)}
        />
      )}
    </div>
  );
}
