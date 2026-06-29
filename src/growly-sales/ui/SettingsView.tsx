import { useCallback, useEffect, useState } from 'react';
import { fetchSalesDashboard, type SalesDashboardResponse } from './salesDashboardApi.js';
import { InfoBanner } from './InfoBanner.js';
import { SectionCard } from './SectionCard.js';
import { SignatureRefreshPanel } from './SignatureRefreshPanel.js';
import { Daily30SafetyRulesPanel } from './Daily30OperationsPanel.js';

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

  return (
    <div className="settings-view">
      <InfoBanner variant="info">
        送信元・MIME の表示のみ。APIキー・refresh token・.env の秘密情報は表示しません。
      </InfoBanner>

      <SignatureRefreshPanel
        onError={onError}
        onRefreshed={() => {
          onDataChanged?.();
          void load();
        }}
      />

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
        <p className="hint">
          標準値 c_hiratsuka@wantreach.jp。変更は .env の OUTREACH_* 変数（画面には秘密を出しません）。
        </p>
      </SectionCard>

      <SectionCard title="MIME / Gmail下書き品質">
        <InfoBanner variant="success">{mimeVerification.label}</InfoBanner>
        <p className="hint">{mimeVerification.summary}</p>
        <ul className="mime-check-list">
          {mimeVerification.checks.map((check) => (
            <li key={check.id} className={check.ok ? 'mime-ok' : 'mime-ng'}>
              {check.ok ? '✓' : '✗'} {check.label}
            </li>
          ))}
        </ul>
      </SectionCard>

      <Daily30SafetyRulesPanel />

      <SectionCard title="運用ポリシー">
        <ul className="policy-list">
          <li>Gmail下書き作成は CREATE_DRAFTS 明示時のみ（下書き候補タブ）</li>
          <li>humanReviewStatus=pending は承認後にのみ下書き作成可能</li>
          <li>sendStatus=sent は人手で Gmail 送信後に送信記録タブで記録</li>
          <li>自動送信・一括送信は禁止</li>
          <li>データ保存: leads.json / leads.csv（ローカル）</li>
        </ul>
      </SectionCard>
    </div>
  );
}
