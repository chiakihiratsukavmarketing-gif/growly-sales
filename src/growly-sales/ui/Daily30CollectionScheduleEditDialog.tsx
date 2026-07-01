import { useMemo, useState } from 'react';
import type { Daily30CollectionScheduleStore } from '../storage/daily30CollectionScheduleTypes.js';
import type {
  Daily30AreaStrategy,
  Daily30DiscoverySource,
  Daily30DiscoverySourceSite,
} from '../candidates/daily30CollectionProfile.js';
import type { Daily30ScheduleUpdateMode } from '../candidates/updateDaily30CollectionSchedule.js';
import {
  AREA_STRATEGY_DESCRIPTIONS,
  AREA_STRATEGY_LABELS,
  DISCOVERY_SOURCE_LABELS,
  DISCOVERY_SOURCE_SITE_LABELS,
  INDUSTRY_CATEGORY_LABELS,
} from '../candidates/daily30CollectionScheduleLabels.js';
import { saveDaily30CollectionSchedule } from './daily30CollectionScheduleApi.js';

type FormMode = Daily30ScheduleUpdateMode;

const MODE_OPTIONS: { value: FormMode; label: string }[] = [
  { value: 'auto_continue', label: 'おまかせ継続' },
  { value: 'one_day_override', label: '1日だけ指定' },
  { value: 'user_selected', label: '明日から継続' },
  { value: 'reset_to_auto', label: 'おまかせに戻す' },
];

const AREA_OPTIONS: Daily30AreaStrategy[] = [
  'priority_miyagi_fukushima_yamagata',
  'north_kanto',
  'nationwide_excluding_tokyo',
];

const DISCOVERY_OPTIONS: Daily30DiscoverySource[] = [
  'google_places',
  'job_site_reference',
  'rakuten_marketplace_reference',
  'portal_site_reference',
  'industry_directory_reference',
  'manual_url',
];

const JOB_SITE_OPTIONS: (Daily30DiscoverySourceSite | 'none')[] = [
  'none',
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

const REFERENCE_ONLY_SOURCES = new Set<Daily30DiscoverySource>([
  'job_site_reference',
  'rakuten_marketplace_reference',
  'portal_site_reference',
]);

interface Daily30CollectionScheduleEditDialogProps {
  schedule: Daily30CollectionScheduleStore;
  nextEffectiveBatchId: string;
  saving: boolean;
  onCancel: () => void;
  onSaved: () => void | Promise<void>;
  onSaveStart: () => void;
  onSaveEnd: () => void;
  onError: (message: string) => void;
}

export function Daily30CollectionScheduleEditDialog({
  schedule,
  nextEffectiveBatchId,
  saving,
  onCancel,
  onSaved,
  onSaveStart,
  onSaveEnd,
  onError,
}: Daily30CollectionScheduleEditDialogProps) {
  const seed = schedule.oneDayOverride?.profile ??
    schedule.nextProfileOverride?.profile ??
    schedule.activeProfile;

  const [mode, setMode] = useState<FormMode>('user_selected');
  const [areaStrategy, setAreaStrategy] = useState<Daily30AreaStrategy>(seed.areaStrategy);
  const [discoverySource, setDiscoverySource] = useState<Daily30DiscoverySource>(seed.discoverySource);
  const [discoverySourceSite, setDiscoverySourceSite] = useState<Daily30DiscoverySourceSite | 'none'>(
    seed.discoverySourceSite ?? 'none'
  );

  const needsProfileFields = mode === 'one_day_override' || mode === 'user_selected';
  const showJobSite = needsProfileFields && discoverySource === 'job_site_reference';
  const referenceOnlyWarning = needsProfileFields && REFERENCE_ONLY_SOURCES.has(discoverySource);

  const effectiveBatchId = useMemo(() => {
    if (mode === 'reset_to_auto' || mode === 'auto_continue') return nextEffectiveBatchId;
    return nextEffectiveBatchId;
  }, [mode, nextEffectiveBatchId]);

  const handleSubmit = async () => {
    onSaveStart();
    try {
      const payload =
        mode === 'reset_to_auto' || mode === 'auto_continue'
          ? { mode }
          : {
              mode,
              effectiveFromBatchId: effectiveBatchId,
              profile: {
                industryCategory: 'housing' as const,
                areaStrategy,
                discoverySource,
                discoverySourceSite:
                  discoverySource === 'job_site_reference' ? discoverySourceSite : 'none',
              },
            };
      await saveDaily30CollectionSchedule(payload);
      await onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : '収集設定の保存に失敗しました');
    } finally {
      onSaveEnd();
    }
  };

  return (
    <div className="modal-overlay" role="presentation" onClick={onCancel}>
      <div
        className="modal-dialog collection-schedule-edit-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="collection-schedule-edit-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="collection-schedule-edit-title" className="modal-title">
          明日の収集設定を変更
        </h3>
        <p className="modal-lead hint">
          次回反映日（JST）: <strong>{effectiveBatchId}</strong> — 毎朝9時の自動収集向け予約です。
        </p>

        <fieldset className="collection-schedule-fieldset">
          <legend>収集モード</legend>
          {MODE_OPTIONS.map((opt) => (
            <label key={opt.value} className="collection-schedule-radio">
              <input
                type="radio"
                name="collectionMode"
                value={opt.value}
                checked={mode === opt.value}
                onChange={() => setMode(opt.value)}
              />
              {opt.label}
            </label>
          ))}
        </fieldset>

        {needsProfileFields && (
          <>
            <fieldset className="collection-schedule-fieldset">
              <legend>業種</legend>
              <label className="collection-schedule-radio">
                <input type="radio" name="industry" checked readOnly />
                {INDUSTRY_CATEGORY_LABELS.housing}
              </label>
              <p className="hint collection-schedule-disabled-hint">
                不動産・EC・教育・美容・飲食は将来拡張予定（今回は住宅系のみ）
              </p>
            </fieldset>

            <fieldset className="collection-schedule-fieldset">
              <legend>エリア戦略</legend>
              {AREA_OPTIONS.map((value) => (
                <label key={value} className="collection-schedule-radio">
                  <input
                    type="radio"
                    name="areaStrategy"
                    value={value}
                    checked={areaStrategy === value}
                    onChange={() => setAreaStrategy(value)}
                  />
                  <span>
                    {AREA_STRATEGY_LABELS[value]}
                    <span className="hint collection-schedule-option-desc">
                      {AREA_STRATEGY_DESCRIPTIONS[value]}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>

            <fieldset className="collection-schedule-fieldset">
              <legend>収集元</legend>
              {DISCOVERY_OPTIONS.map((value) => (
                <label key={value} className="collection-schedule-radio">
                  <input
                    type="radio"
                    name="discoverySource"
                    value={value}
                    checked={discoverySource === value}
                    onChange={() => setDiscoverySource(value)}
                  />
                  {DISCOVERY_SOURCE_LABELS[value]}
                </label>
              ))}
            </fieldset>

            {showJobSite && (
              <fieldset className="collection-schedule-fieldset">
                <legend>求人サイト指定</legend>
                <select
                  className="collection-schedule-select"
                  value={discoverySourceSite}
                  onChange={(e) =>
                    setDiscoverySourceSite(e.target.value as Daily30DiscoverySourceSite | 'none')
                  }
                >
                  {JOB_SITE_OPTIONS.map((site) => (
                    <option key={site} value={site}>
                      {site === 'none' ? '指定なし' : DISCOVERY_SOURCE_SITE_LABELS[site]}
                    </option>
                  ))}
                </select>
                <p className="hint">
                  求人サイトは企業候補の発見元としてのみ使います。メール取得は公式サイト上の代表メールのみ使用します。
                </p>
              </fieldset>
            )}

            {referenceOnlyWarning && (
              <p className="hint collection-schedule-phase-hint">
                {discoverySource === 'job_site_reference'
                  ? '求人サイト参考は設定に記録されます。外部掲載サイト探索は Phase 40.6 で実装予定です（実行は Google Places / 公式サイト検索）。'
                  : discoverySource === 'rakuten_marketplace_reference'
                    ? '楽天市場参考も設定に記録されます。外部探索は Phase 40.6 で実装予定です。'
                    : 'この収集元は設定に記録されます。外部探索は Phase 40.6 で実装予定です。'}
              </p>
            )}
          </>
        )}

        <ul className="hint-list human-gate-safety-list">
          <li>外部掲載サイト上のメールは使用しません</li>
          <li>メール取得元は公式サイトURLのみです</li>
          <li>実行時は schedule を解決して Daily 30 に反映します（外部掲載サイト探索は Phase 40.6）</li>
        </ul>

        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>
            キャンセル
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void handleSubmit()} disabled={saving}>
            {saving ? '保存中…' : '保存する'}
          </button>
        </div>
      </div>
    </div>
  );
}
