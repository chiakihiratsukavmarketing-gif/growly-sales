import { useCallback, useEffect, useState } from 'react';
import { fetchSalesDashboard, type SalesDashboardResponse } from './salesDashboardApi.js';
import { SectionCard } from './SectionCard.js';
import { SignatureRefreshPanel } from './SignatureRefreshPanel.js';
import { Daily30SafetyRulesPanel } from './Daily30OperationsPanel.js';
import { PageHeader } from './common/PageHeader.js';
import { DevDetails } from './common/DevDetails.js';

interface SettingsViewProps {
  onError: (message: string) => void;
  onDataChanged?: () => void;
}

export function SettingsView({ onError, onDataChanged }: SettingsViewProps) {
  const [data, setData] = useState<SalesDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchSalesDashboard();
      setData(result);
    } catch (err) {
      onError(err instanceof Error ? err.message : '設定の読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <p className="loading">設定を読み込み中…</p>;
  if (!data) return null;

  const { outreachSender, mimeVerification } = data;
  const senderConfigured = Boolean(outreachSender.fromEmail && outreachSender.signatureEmail);

  return (
    <div className="settings-view">
      <PageHeader title="設定" subtitle="現在の安全状態と送信元設定を確認します。" />

      <SectionCard title="安全状態">
        <ul className="safety-status-list">
          <li><span className="safety-ok">OFF</span> 自動送信</li>
          <li><span className="safety-ok">手動承認後のみ</span> Gmail下書き作成</li>
          <li>
            <span className={senderConfigured ? 'safety-ok' : 'safety-warn'}>
              {senderConfigured ? '設定済み' : '要確認'}
            </span>{' '}
            送信元
          </li>
          <li><span className="safety-ok">保存しない</span> 返信本文全文</li>
          <li><span className="safety-ok">非表示</span> 秘密情報（APIキー等）</li>
          <li><span className="safety-ok">ローカルJSON</span> データ保存先</li>
        </ul>
      </SectionCard>

      <SectionCard title="営業メール送信元">
        <dl className="config-dl">
          <div className="config-row">
            <dt>From（表示名）</dt>
            <dd>{outreachSender.fromDisplayName}</dd>
          </div>
          <div className="config-row">
            <dt>From（メール）</dt>
            <dd>{outreachSender.fromEmail}</dd>
          </div>
          <div className="config-row">
            <dt>Reply-To</dt>
            <dd>{outreachSender.replyToEmail}</dd>
          </div>
          <div className="config-row">
            <dt>署名Email</dt>
            <dd>{outreachSender.signatureEmail}</dd>
          </div>
        </dl>
      </SectionCard>

      <SignatureRefreshPanel
        onError={onError}
        onRefreshed={() => {
          onDataChanged?.();
          void load();
        }}
      />

      <DevDetails title="開発者向け詳細（MIME・安全ルール）">
        <SectionCard title="MIME / Gmail下書き品質">
          <p className="hint">{mimeVerification.label} — {mimeVerification.summary}</p>
          <ul className="mime-check-list">
            {mimeVerification.checks.map((check) => (
              <li key={check.id} className={check.ok ? 'mime-ok' : 'mime-ng'}>
                {check.ok ? '✓' : '✗'} {check.label}
              </li>
            ))}
          </ul>
        </SectionCard>
        <Daily30SafetyRulesPanel />
      </DevDetails>
    </div>
  );
}
