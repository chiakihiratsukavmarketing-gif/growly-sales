import { useCallback, useEffect, useMemo, useState } from 'react';
import type { MailSuppression, MailSuppressionStatus } from '../mail-operations/suppressionTypes.js';
import { SectionCard } from './SectionCard.js';
import {
  SuppressionListRowSummary,
  SuppressionBlockBanner,
} from './SuppressionBlockBanner.js';
import {
  addManualSuppressionApi,
  fetchMailSuppressions,
  reactivateSuppressionApi,
  SUPPRESSION_MANUAL_CONFIRM_TOKEN,
  SUPPRESSION_REACTIVATE_CONFIRM_TOKEN,
  previewMockUnsubscribe,
  confirmMockUnsubscribeApi,
} from './mailSuppressionsApi.js';

const STATUS_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'すべて' },
  { value: 'unsubscribed', label: '配信停止' },
  { value: 'manually_blocked', label: '手動停止' },
  { value: 'invalid_address', label: '無効アドレス' },
  { value: 'complaint', label: '苦情' },
  { value: 'legal_block', label: '法的ブロック' },
  { value: 'reactivated', label: '解除済み' },
];

interface MailSuppressionListPanelProps {
  onError: (message: string) => void;
  refreshKey?: number;
}

export function MailSuppressionListPanel({ onError, refreshKey = 0 }: MailSuppressionListPanelProps) {
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<MailSuppression[]>([]);
  const [mode, setMode] = useState<'mock' | 'live'>('mock');
  const [companySearch, setCompanySearch] = useState('');
  const [emailSearch, setEmailSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selected, setSelected] = useState<MailSuppression | null>(null);
  const [manualEmail, setManualEmail] = useState('');
  const [manualReason, setManualReason] = useState('');
  const [manualConfirm, setManualConfirm] = useState('');
  const [reactivateMemo, setReactivateMemo] = useState('');
  const [reactivateConfirm, setReactivateConfirm] = useState('');
  const [reactivateStep, setReactivateStep] = useState<'idle' | 'confirm'>('idle');
  const [mockTokenInput, setMockTokenInput] = useState('');
  const [mockPreview, setMockPreview] = useState<string | null>(null);
  const [mockResult, setMockResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchMailSuppressions();
      setRecords(data.records);
      setMode(data.mode);
    } catch (err) {
      onError(err instanceof Error ? err.message : '配信禁止リストの読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const filtered = useMemo(() => {
    let items = records;
    if (statusFilter === 'reactivated') {
      items = items.filter((r) => Boolean(r.reactivatedAt));
    } else if (statusFilter !== 'all') {
      items = items.filter((r) => !r.reactivatedAt && r.status === statusFilter);
    }
    const companyQ = companySearch.trim().toLowerCase();
    const emailQ = emailSearch.trim().toLowerCase();
    if (companyQ) {
      items = items.filter(
        (r) =>
          (r.leadId ?? '').toLowerCase().includes(companyQ) ||
          (r.companyId ?? '').toLowerCase().includes(companyQ)
      );
    }
    if (emailQ) {
      items = items.filter(
        (r) =>
          r.emailAddress.toLowerCase().includes(emailQ) ||
          r.normalizedEmail.includes(emailQ)
      );
    }
    return items;
  }, [records, companySearch, emailSearch, statusFilter]);

  async function handleManualAdd() {
    if (manualConfirm.trim() !== SUPPRESSION_MANUAL_CONFIRM_TOKEN) {
      onError(`確認トークン「${SUPPRESSION_MANUAL_CONFIRM_TOKEN}」を入力してください`);
      return;
    }
    if (!manualEmail.trim() || !manualReason.trim()) {
      onError('メールアドレスと理由は必須です');
      return;
    }
    try {
      await addManualSuppressionApi({
        emailAddress: manualEmail.trim(),
        reason: manualReason.trim(),
        confirmToken: manualConfirm.trim(),
      });
      setManualEmail('');
      setManualReason('');
      setManualConfirm('');
      await load();
    } catch (err) {
      onError(err instanceof Error ? err.message : '手動登録に失敗しました');
    }
  }

  async function handleReactivate() {
    if (!selected) return;
    if (reactivateStep === 'idle') {
      setReactivateStep('confirm');
      return;
    }
    if (reactivateConfirm.trim() !== SUPPRESSION_REACTIVATE_CONFIRM_TOKEN) {
      onError(`解除には確認トークン「${SUPPRESSION_REACTIVATE_CONFIRM_TOKEN}」が必要です`);
      return;
    }
    if (!reactivateMemo.trim()) {
      onError('解除理由を入力してください');
      return;
    }
    try {
      await reactivateSuppressionApi({
        suppressionId: selected.suppressionId,
        reactivationMemo: reactivateMemo.trim(),
        confirmToken: reactivateConfirm.trim(),
      });
      setReactivateStep('idle');
      setReactivateMemo('');
      setReactivateConfirm('');
      setSelected(null);
      await load();
    } catch (err) {
      onError(err instanceof Error ? err.message : '解除に失敗しました');
    }
  }

  async function handleMockPreview() {
    setMockResult(null);
    try {
      const preview = await previewMockUnsubscribe(mockTokenInput.trim());
      setMockPreview(preview.message);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'mockプレビューに失敗しました');
    }
  }

  async function handleMockConfirm() {
    try {
      const result = await confirmMockUnsubscribeApi(mockTokenInput.trim());
      setMockResult(result.message);
      await load();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'mock配信停止に失敗しました');
    }
  }

  if (loading) return <p className="loading">配信禁止リストを読み込み中…</p>;

  return (
    <>
      <SectionCard title="配信禁止リスト">
        <p className="hint">
          モード: <strong>{mode}</strong>（mock）— 公開URL・GCS live書き込みは未接続です。
        </p>
        <div className="suppression-filters">
          <label>
            会社名 / Lead ID
            <input
              type="search"
              value={companySearch}
              onChange={(e) => setCompanySearch(e.target.value)}
              placeholder="検索"
            />
          </label>
          <label>
            メール
            <input
              type="search"
              value={emailSearch}
              onChange={(e) => setEmailSearch(e.target.value)}
              placeholder="検索"
            />
          </label>
          <label>
            状態
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              {STATUS_FILTER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="suppression-table-wrap">
          <table className="suppression-table">
            <thead>
              <tr>
                <th>会社 / Lead</th>
                <th>メール</th>
                <th>状態</th>
                <th>理由</th>
                <th>経路</th>
                <th>停止日時</th>
                <th>最終ブロック</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7}>該当なし（初期状態は空です）</td>
                </tr>
              ) : (
                filtered.map((record) => (
                  <SuppressionListRowSummary key={record.suppressionId} record={record} />
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="suppression-detail-actions">
          <label>
            詳細（suppressionId）
            <select
              value={selected?.suppressionId ?? ''}
              onChange={(e) => {
                const id = e.target.value;
                setSelected(records.find((r) => r.suppressionId === id) ?? null);
                setReactivateStep('idle');
              }}
            >
              <option value="">選択…</option>
              {records.map((r) => (
                <option key={r.suppressionId} value={r.suppressionId}>
                  {r.emailAddress} — {r.status}
                </option>
              ))}
            </select>
          </label>
          {selected && !selected.reactivatedAt ? (
            <div className="suppression-reactivate-panel">
              {reactivateStep === 'idle' ? (
                <button type="button" className="btn btn-warn" onClick={() => setReactivateStep('confirm')}>
                  解除（Human Approval）
                </button>
              ) : (
                <>
                  <p className="hint warning-text">解除は Human Approval 必須です。理由を記録してください。</p>
                  <label>
                    解除理由
                    <textarea
                      value={reactivateMemo}
                      onChange={(e) => setReactivateMemo(e.target.value)}
                      rows={2}
                    />
                  </label>
                  <label>
                    確認トークン
                    <input
                      type="text"
                      value={reactivateConfirm}
                      onChange={(e) => setReactivateConfirm(e.target.value)}
                      placeholder={SUPPRESSION_REACTIVATE_CONFIRM_TOKEN}
                    />
                  </label>
                  <button type="button" className="btn btn-primary" onClick={() => void handleReactivate()}>
                    解除を確定
                  </button>
                  <button type="button" className="btn" onClick={() => setReactivateStep('idle')}>
                    キャンセル
                  </button>
                </>
              )}
            </div>
          ) : null}
        </div>
      </SectionCard>

      <SectionCard title="手動で配信禁止を追加">
        <p className="hint">Human Approval: 確認トークン「{SUPPRESSION_MANUAL_CONFIRM_TOKEN}」が必要です。</p>
        <label>
          メールアドレス
          <input type="email" value={manualEmail} onChange={(e) => setManualEmail(e.target.value)} />
        </label>
        <label>
          理由
          <input type="text" value={manualReason} onChange={(e) => setManualReason(e.target.value)} />
        </label>
        <label>
          確認トークン
          <input type="text" value={manualConfirm} onChange={(e) => setManualConfirm(e.target.value)} />
        </label>
        <button type="button" className="btn btn-warn" onClick={() => void handleManualAdd()}>
          手動登録
        </button>
      </SectionCard>

      {(
        <SectionCard title="配信停止案内（mockプレビュー）">
          <pre className="suppression-mock-preview">{`今後のご案内が不要な場合は、こちらから配信停止できます。
[配信停止リンク] http://localhost:3847/api/mock/unsubscribe/{token}
（mockプレビュー — Gmail下書きには自動挿入されません）`}</pre>
          <p className="hint">Gmail下書きには自動挿入されません（MAIL_OPS_MODE=mock）。</p>
        </SectionCard>
      )}

      <SectionCard title="mock配信停止リンク（開発用）">
        <p className="hint">公開endpointは未作成。ローカルAPIのみ。生トークンは保存しません。</p>
        <label>
          mockトークン
          <input type="text" value={mockTokenInput} onChange={(e) => setMockTokenInput(e.target.value)} />
        </label>
        <div className="btn-row">
          <button type="button" className="btn" onClick={() => void handleMockPreview()}>
            プレビュー
          </button>
          <button type="button" className="btn btn-warn" onClick={() => void handleMockConfirm()}>
            配信停止を確定（mock）
          </button>
        </div>
        {mockPreview ? <p className="hint">{mockPreview}</p> : null}
        {mockResult ? <SuppressionBlockBanner blockReason={mockResult} title="処理結果" /> : null}
      </SectionCard>
    </>
  );
}
