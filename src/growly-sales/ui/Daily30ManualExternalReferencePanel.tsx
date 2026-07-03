import { useCallback, useMemo, useState } from 'react';
import type {
  Daily30DiscoverySource,
  Daily30DiscoverySourceSite,
  Daily30IndustryCategory,
} from '../candidates/daily30CollectionProfile.js';
import { DAILY_30_NATIONWIDE_PREFECTURES_ORDERED } from '../candidates/daily30PrefectureRegistry.js';
import {
  DISCOVERY_SOURCE_LABELS,
  DISCOVERY_SOURCE_SITE_LABELS,
  INDUSTRY_CATEGORY_LABELS,
} from '../candidates/daily30CollectionScheduleLabels.js';
import { MANUAL_EXTERNAL_REFERENCE_ALLOWED_DISCOVERY_SOURCES } from '../candidates/manualExternalReferenceConstants.js';
import { DevDetails } from './common/DevDetails.js';
import { InfoBanner } from './InfoBanner.js';
import { isDevApiErrorMessage, toUserFacingApiError } from './displayLabels.js';
import {
  MANUAL_EXTERNAL_REFERENCE_WARNING_LABELS,
  submitManualExternalReference,
  type ManualExternalReferenceResponse,
} from './daily30ManualExternalReferenceApi.js';
import { SOURCE_COMPLIANCE_LABELS } from '../candidates/resolveCollectionProfileDisplay.js';

const JOB_SITE_SOURCES: Daily30DiscoverySourceSite[] = [
  'wantedly',
  'indeed',
  'kyujinbox',
  'engage',
  'green',
  'doda',
  'mynavi_tenshoku',
  'rikunabi_next',
  'other',
];

interface Daily30ManualExternalReferencePanelProps {
  onError: (message: string) => void;
  onSuccess?: (message: string) => void;
  onChanged?: () => void;
}

export function Daily30ManualExternalReferencePanel({
  onError,
  onSuccess,
  onChanged,
}: Daily30ManualExternalReferencePanelProps) {
  const [discoverySourceUrl, setDiscoverySourceUrl] = useState('');
  const [discoverySource, setDiscoverySource] = useState<Daily30DiscoverySource>('manual_url');
  const [discoverySourceSite, setDiscoverySourceSite] = useState<Daily30DiscoverySourceSite>('other');
  const [companyName, setCompanyName] = useState('');
  const [officialSiteUrl, setOfficialSiteUrl] = useState('');
  const [prefecture, setPrefecture] = useState('宮城県');
  const [industryCategory, setIndustryCategory] = useState<Daily30IndustryCategory>('housing');
  const [manualNote, setManualNote] = useState('');
  const [shouldEnrich, setShouldEnrich] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [devSubmitError, setDevSubmitError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<ManualExternalReferenceResponse | null>(null);

  const prefectureOptions = useMemo(() => DAILY_30_NATIONWIDE_PREFECTURES_ORDERED, []);

  const showJobSiteSelect = discoverySource === 'job_site_reference';

  const disabledReason = useMemo(() => {
    if (submitting) return '保存中です…';
    if (!discoverySourceUrl.trim()) return '掲載元URLを入力してください';
    if (!companyName.trim()) return '会社名を入力してください';
    return null;
  }, [companyName, discoverySourceUrl, submitting]);

  const handleSubmit = useCallback(async () => {
    setSubmitting(true);
    setLastResult(null);
    setSubmitError(null);
    setDevSubmitError(null);
    setSuccessMessage(null);
    try {
      const result = await submitManualExternalReference({
        discoverySourceUrl: discoverySourceUrl.trim(),
        discoverySource,
        discoverySourceSite: showJobSiteSelect ? discoverySourceSite : null,
        companyName: companyName.trim(),
        officialSiteUrl: officialSiteUrl.trim() || null,
        prefecture: prefecture.trim() || null,
        industryCategory,
        manualNote: manualNote.trim() || null,
        shouldEnrichOfficialSiteEmail: shouldEnrich,
      });
      setLastResult(result);
      const message = `${result.candidate.companyName} を候補として追加しました`;
      setSuccessMessage(message);
      onSuccess?.(message);
      onChanged?.();
    } catch (err) {
      const raw = err instanceof Error ? err.message : '手動外部参照候補の保存に失敗しました';
      const userMessage = toUserFacingApiError(raw);
      setSubmitError(userMessage);
      if (isDevApiErrorMessage(raw)) {
        setDevSubmitError(raw);
      }
      onError(userMessage);
    } finally {
      setSubmitting(false);
    }
  }, [
    companyName,
    discoverySource,
    discoverySourceSite,
    discoverySourceUrl,
    industryCategory,
    manualNote,
    officialSiteUrl,
    onChanged,
    onError,
    onSuccess,
    prefecture,
    shouldEnrich,
    showJobSiteSelect,
  ]);

  return (
    <div className="manual-external-reference-panel">
      <p className="hint manual-external-reference-intro">
        掲載元URLは企業発見の記録にのみ使用します。メールは公式サイトからのみ確認します。
      </p>

      {submitError ? <InfoBanner variant="danger">{submitError}</InfoBanner> : null}
      {successMessage ? <InfoBanner variant="success">{successMessage}</InfoBanner> : null}
      {devSubmitError ? (
        <DevDetails title="登録エラー（開発者向け）">
          <p className="mono-cell">{devSubmitError}</p>
        </DevDetails>
      ) : null}

      <div className="manual-external-reference-form">
        <label className="collection-schedule-select">
          <span>掲載元URL *</span>
          <input
            type="url"
            value={discoverySourceUrl}
            onChange={(e) => setDiscoverySourceUrl(e.target.value)}
            placeholder="https://www.wantedly.com/companies/example"
            required
          />
        </label>
        <p className="hint collection-schedule-disabled-hint">
          このURLからメールは取得しません。発見元として記録のみです。
        </p>

        <label className="collection-schedule-select">
          <span>掲載元の種類 *</span>
          <select
            value={discoverySource}
            onChange={(e) => setDiscoverySource(e.target.value as Daily30DiscoverySource)}
          >
            {MANUAL_EXTERNAL_REFERENCE_ALLOWED_DISCOVERY_SOURCES.map((source) => (
              <option key={source} value={source}>
                {DISCOVERY_SOURCE_LABELS[source]}
              </option>
            ))}
          </select>
        </label>

        {showJobSiteSelect ? (
          <label className="collection-schedule-select">
            <span>求人サイト指定</span>
            <select
              value={discoverySourceSite}
              onChange={(e) => setDiscoverySourceSite(e.target.value as Daily30DiscoverySourceSite)}
            >
              {JOB_SITE_SOURCES.map((site) => (
                <option key={site} value={site}>
                  {DISCOVERY_SOURCE_SITE_LABELS[site]}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="collection-schedule-select">
          <span>会社名 *</span>
          <input
            type="text"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            required
          />
        </label>

        <label className="collection-schedule-select">
          <span>公式サイト候補URL</span>
          <input
            type="url"
            value={officialSiteUrl}
            onChange={(e) => setOfficialSiteUrl(e.target.value)}
            placeholder="https://example.co.jp"
          />
        </label>
        <p className="hint collection-schedule-disabled-hint">
          Lead化承認には実質必須。メール確認はこのURLのドメイン内のみ許可されます。
        </p>

        <div className="manual-external-reference-grid-2col">
          <label className="collection-schedule-select">
            <span>都道府県</span>
            <select value={prefecture} onChange={(e) => setPrefecture(e.target.value)}>
              {prefectureOptions.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>

          <label className="collection-schedule-select">
            <span>業種</span>
            <select
              value={industryCategory}
              onChange={(e) => setIndustryCategory(e.target.value as Daily30IndustryCategory)}
            >
              {(Object.keys(INDUSTRY_CATEGORY_LABELS) as Daily30IndustryCategory[]).map((key) => (
                <option key={key} value={key}>
                  {INDUSTRY_CATEGORY_LABELS[key]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="collection-schedule-select">
          <span>メモ</span>
          <textarea
            value={manualNote}
            onChange={(e) => setManualNote(e.target.value)}
            rows={2}
            placeholder="Wantedly掲載企業。公式サイトは人間が確認。"
          />
        </label>

        <label className="collection-schedule-radio">
          <input
            type="checkbox"
            checked={shouldEnrich}
            onChange={(e) => setShouldEnrich(e.target.checked)}
            disabled={!officialSiteUrl.trim()}
          />
          <span>公式サイトから代表メールを確認する（公式サイトURLのみ対象）</span>
        </label>

        <div className="collection-schedule-actions">
          <button
            type="button"
            className="btn btn-primary"
            disabled={Boolean(disabledReason)}
            onClick={() => void handleSubmit()}
          >
            {submitting ? '保存中…' : '候補として登録'}
          </button>
          {disabledReason && !submitting ? (
            <p className="hint collection-schedule-disabled-hint">{disabledReason}</p>
          ) : null}
        </div>

        <DevDetails title="入力フィールド（開発者向け）">
          <ul className="hint-list">
            <li>掲載元URL: discoverySourceUrl</li>
            <li>掲載元の種類: discoverySource / discoverySourceSite</li>
            <li>公式サイト: officialSiteUrl</li>
            <li>公式サイトメール確認: shouldEnrichOfficialSiteEmail</li>
          </ul>
        </DevDetails>
      </div>

      {lastResult ? (
        <div className="manual-external-reference-result">
          <p className="hint">
            <strong>{lastResult.candidate.companyName}</strong> を登録しました（
            {lastResult.candidate.sourceComplianceStatus
              ? SOURCE_COMPLIANCE_LABELS[lastResult.candidate.sourceComplianceStatus]
              : '未判定'}
            ）
          </p>
          {lastResult.warnings.length > 0 ? (
            <ul className="manual-external-reference-warnings">
              {lastResult.warnings.map((w) => (
                <li key={w}>{MANUAL_EXTERNAL_REFERENCE_WARNING_LABELS[w] ?? w}</li>
              ))}
            </ul>
          ) : null}
          {lastResult.duplicateReason ? (
            <p className="hint manual-external-reference-dup">{lastResult.duplicateReason}</p>
          ) : null}
          <DevDetails title="登録結果（開発者向け）">
            <pre className="dev-json">{JSON.stringify(lastResult.candidate, null, 2)}</pre>
          </DevDetails>
        </div>
      ) : null}
    </div>
  );
}
