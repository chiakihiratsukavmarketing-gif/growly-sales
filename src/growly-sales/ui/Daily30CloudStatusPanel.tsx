import { useCallback, useEffect, useState } from 'react';
import { SectionCard } from './SectionCard.js';
import { InfoBanner } from './InfoBanner.js';
import { DevDetails } from './common/DevDetails.js';
import { isDevApiErrorMessage, toUserFacingApiError } from './displayLabels.js';
import { fetchDaily30CloudStatus, type Daily30CloudStatusResponse } from './daily30CloudApi.js';

interface Daily30CloudStatusPanelProps {
  onError: (message: string) => void;
  refreshKey?: number;
}

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
  } catch {
    return iso;
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec} 秒`;
  return `${Math.floor(sec / 60)} 分 ${sec % 60} 秒`;
}

function automationStatusLabel(status: string): string {
  switch (status) {
    case 'success':
      return '成功';
    case 'failed':
      return '失敗';
    case 'skipped':
      return 'スキップ';
    case 'blocked':
      return 'ブロック';
    case 'not_run':
      return '未実行';
    default:
      return status;
  }
}

function bannerVariantForStatus(
  automationStatus: string
): 'info' | 'warning' | 'error' {
  if (automationStatus === 'failed') return 'error';
  if (automationStatus === 'blocked') return 'warning';
  return 'info';
}

export function Daily30CloudStatusPanel({
  onError,
  refreshKey = 0,
}: Daily30CloudStatusPanelProps) {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<Daily30CloudStatusResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadDevError, setLoadDevError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setLoadDevError(null);
    try {
      const data = await fetchDaily30CloudStatus();
      setStatus(data);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Cloud 自動化状態の読み込みに失敗しました';
      setStatus(null);
      setLoadError(toUserFacingApiError(message));
      if (isDevApiErrorMessage(message)) {
        setLoadDevError(message);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  if (loading) return <p className="loading">Cloud 自動化状態を読み込み中…</p>;
  if (!status) {
    return (
      <SectionCard title="Cloud Scheduler（Daily 30 自動収集）" className="daily30-cloud-status-card">
        {loadError ? <InfoBanner variant="warn">{loadError}</InfoBanner> : null}
        {loadDevError ? (
          <DevDetails title="Cloud 状態の読み込みエラー（開発者向け）">
            <p className="mono-cell">{loadDevError}</p>
          </DevDetails>
        ) : null}
      </SectionCard>
    );
  }

  const last = status.lastRun;

  return (
    <SectionCard title="Cloud Scheduler（Daily 30 自動収集）" className="daily30-cloud-status-card">
      <InfoBanner variant={bannerVariantForStatus(status.automationStatus)}>
        {status.message}
        <br />
        自動収集の状態（本日）: <strong>{automationStatusLabel(status.automationStatus)}</strong>
        — UI から再実行・force ボタンはありません。
      </InfoBanner>

      <dl className="config-dl">
        <div className="config-row">
          <dt>Cloud Run URL</dt>
          <dd>
            {status.cloudRunUrlConfigured && status.cloudRunServiceUrl ? (
              <code>{status.cloudRunServiceUrl}</code>
            ) : (
              '未設定'
            )}
          </dd>
        </div>
        <div className="config-row">
          <dt>Cloud Scheduler</dt>
          <dd>
            {status.schedulerConfigured ? (
              <>
                設定済み — <code>{status.schedulerJobName}</code>
              </>
            ) : (
              '未設定'
            )}
          </dd>
        </div>
        <div className="config-row">
          <dt>次回実行予定</dt>
          <dd>{status.nextScheduledRun}</dd>
        </div>
        <div className="config-row">
          <dt>GCS backend</dt>
          <dd>
            <code>{status.storageBackend}</code>
            {status.gcsBucketConfigured ? ' — バケット設定済み' : ' — バケット未設定'}
          </dd>
        </div>
        {status.storageBackend === 'gcs' && status.gcsBucket ? (
          <div className="config-row">
            <dt>GCS bucket</dt>
            <dd>
              <code>{status.gcsBucket}</code> / <code>{status.gcsPrefix}</code>
            </dd>
          </div>
        ) : null}
        <div className="config-row">
          <dt>DAILY30_CLOUD_RUN_TOKEN</dt>
          <dd>{status.tokenConfigured ? '設定済み（値は表示しません）' : '未設定'}</dd>
        </div>
        <div className="config-row">
          <dt>同日二重実行ガード</dt>
          <dd>
            {status.duplicateGuardActive ? '有効' : '無効'}
            {status.todayCloudRunCompleted ? ' — 本日は成功実行済み' : ' — 本日は未成功'}
          </dd>
        </div>
      </dl>

      <h4 className="subsection-title">最終 Cloud 実行ログ</h4>
      {last ? (
        <dl className="config-dl">
          <div className="config-row">
            <dt>status / mode</dt>
            <dd>
              <code>{last.status}</code> / <code>{last.mode}</code>
            </dd>
          </div>
          <div className="config-row">
            <dt>実行時刻</dt>
            <dd>{formatTimestamp(last.finishedAt)}</dd>
          </div>
          <div className="config-row">
            <dt>所要時間</dt>
            <dd>{formatDuration(last.durationMs)}</dd>
          </div>
          <div className="config-row">
            <dt>runId / batchId</dt>
            <dd>
              <code>{last.runId}</code> / <code>{last.batchId}</code>
            </dd>
          </div>
          <div className="config-row">
            <dt>結果</dt>
            <dd>
              collected {last.collected} / email {last.emailFound} / dup {last.duplicates} / excluded{' '}
              {last.excluded}
            </dd>
          </div>
          {last.nextArea ? (
            <div className="config-row">
              <dt>nextArea</dt>
              <dd>{last.nextArea}</dd>
            </div>
          ) : null}
          {last.errorCode ? (
            <div className="config-row">
              <dt>errorCode</dt>
              <dd>
                <code>{last.errorCode}</code>
              </dd>
            </div>
          ) : null}
          {last.recoveryHint ? (
            <div className="config-row">
              <dt>recoveryHint</dt>
              <dd>{last.recoveryHint}</dd>
            </div>
          ) : null}
          {last.errorMessageSafe && last.status === 'failed' ? (
            <div className="config-row">
              <dt>safeMessage</dt>
              <dd>{last.errorMessageSafe}</dd>
            </div>
          ) : null}
        </dl>
      ) : (
        <p className="hint">実行記録はまだありません（GCS / ローカル state JSON）。</p>
      )}

      {last?.recoverySteps && last.recoverySteps.length > 0 ? (
        <>
          <h4 className="subsection-title">リカバリー手順</h4>
          <ol className="recovery-steps-list">
            {last.recoverySteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </>
      ) : null}

      <h4 className="subsection-title">Cloud Logging</h4>
      <p className="hint">
        GCP Console のログエクスプローラで以下のフィルタを使用（ログ本文・secret は UI に表示しません）:
      </p>
      <pre className="log-filter-box">{status.cloudLoggingFilter}</pre>

      <p className="hint">
        詳細: <code>docs/GROWLY_SALES_CLOUD_SCHEDULER_DEPLOY.md</code> — 同日再実行は Cloud
        Shell の手動手順のみ（候補収集のみ）。
      </p>
    </SectionCard>
  );
}
