import { useEffect } from 'react';
import type { ExternalLeadCandidate } from '../adapters/externalLeadCandidateTypes.js';
import {
  resolveEmailSourceFromCandidate,
  shortenEmailSourceUrl,
} from '../candidates/resolveEmailSourceDisplay.js';
import { buildCollectionProfileDisplayFromCandidate } from '../candidates/resolveCollectionProfileDisplay.js';
import {
  resolveFocusLeadability,
  type ApprovalBlockHints,
} from './daily30CandidateFocusMode.js';

function ExternalLink({ href, label }: { href: string; label?: string }) {
  const text = label ?? href;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="daily30-focus-link" title={href}>
      {text}
    </a>
  );
}

export type Daily30FocusPanelVariant = 'results' | 'lead';

export interface Daily30CandidateFocusViewProps {
  variant: Daily30FocusPanelVariant;
  title: string;
  candidate: ExternalLeadCandidate | null;
  approvalBlockHints: ApprovalBlockHints;
  remainingCount: number;
  processedCount: number;
  focusIndex: number;
  canGoPrev: boolean;
  canGoNext: boolean;
  allDeferred: boolean;
  busy: boolean;
  approving: boolean;
  excluding: boolean;
  showApprove: boolean;
  showExclude: boolean;
  showDefer: boolean;
  primaryAction?: 'approve' | 'generate_copy' | 'view_copy' | 'none';
  onApprove?: () => void;
  onExclude?: () => void;
  onDefer?: () => void;
  onClearDeferred?: () => void;
  onPrev: () => void;
  onNext: () => void;
  onGenerateCopy?: () => void;
  onShowAll?: () => void;
  onShowNotApprovable?: () => void;
  emptyMessage?: string;
}

export function Daily30CandidateFocusView({
  title,
  candidate,
  approvalBlockHints,
  remainingCount,
  processedCount,
  focusIndex,
  canGoPrev,
  canGoNext,
  allDeferred,
  busy,
  approving,
  excluding,
  showApprove,
  showExclude,
  showDefer,
  primaryAction = 'approve',
  onApprove,
  onExclude,
  onDefer,
  onClearDeferred,
  onPrev,
  onNext,
  onGenerateCopy,
  onShowAll,
  onShowNotApprovable,
  emptyMessage = '作業可能な候補はありません。',
}: Daily30CandidateFocusViewProps) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (busy || !candidate) return;
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (e.key === 'ArrowRight' && canGoNext) {
        e.preventDefault();
        onNext();
      } else if (e.key === 'ArrowLeft' && canGoPrev) {
        e.preventDefault();
        onPrev();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [busy, candidate, canGoNext, canGoPrev, onNext, onPrev]);

  if (remainingCount === 0) {
    return (
      <div className="daily30-focus-empty">
        <p className="hint">{emptyMessage}</p>
        <div className="daily30-focus-empty-actions">
          {onShowAll ? (
            <button type="button" className="btn btn-secondary btn-sm" onClick={onShowAll}>
              すべて表示
            </button>
          ) : null}
          {onShowNotApprovable ? (
            <button type="button" className="btn btn-secondary btn-sm" onClick={onShowNotApprovable}>
              承認不可候補を見る
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  if (allDeferred) {
    return (
      <div className="daily30-focus-empty">
        <p className="hint">すべての候補を「あとで確認」に移しました。</p>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onClearDeferred}>
          あとで確認をリセット
        </button>
      </div>
    );
  }

  if (!candidate) {
    return <p className="hint daily30-focus-empty">{emptyMessage}</p>;
  }

  const siteUrl = candidate.officialSiteUrl ?? candidate.websiteUrl ?? '';
  const email = candidate.emailCandidates?.[0] ?? candidate.targetEmail ?? '';
  const emailSource = resolveEmailSourceFromCandidate(candidate);
  const profile = buildCollectionProfileDisplayFromCandidate(candidate);
  const collectionSourceLabel = profile.discoverySourceLabel || '—';
  const discoveryDetail =
    profile.discoverySourceSiteLabel && profile.discoverySourceSiteLabel !== '—'
      ? profile.discoverySourceSiteLabel
      : collectionSourceLabel;
  const discoveryUrl = profile.discoverySourceUrl;
  const leadability = resolveFocusLeadability(candidate, approvalBlockHints);
  const industryLabel = candidate.industryCategory ?? candidate.industry ?? '—';
  const prefecture = candidate.prefecture ?? candidate.area ?? '—';

  const canApprove =
    showApprove &&
    primaryAction === 'approve' &&
    leadability.kind === 'approvable' &&
    candidate.importStatus !== 'approved_for_lead';

  const emailSourceDetail = email
    ? emailSource.emailSourceLabel || emailSource.emailSourceCompactLabel || '—'
    : '—';
  const emailSourceUrl = emailSource.emailSourceUrl?.trim() || '';

  return (
    <div className="daily30-focus-panel daily30-focus-approval-screen">
      <header className="daily30-focus-topbar">
        <div className="daily30-focus-topbar-title">
          <h3 className="daily30-focus-queue-title">{title}</h3>
          <span className="daily30-focus-counts">
            残り <strong>{remainingCount}</strong>件
            {processedCount > 0 ? (
              <>
                {' '}
                ｜ 今日処理済み <strong>{processedCount}</strong>件
              </>
            ) : null}
          </span>
        </div>
        <nav className="daily30-focus-topbar-nav" aria-label="候補ナビゲーション">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={!canGoPrev || busy}
            onClick={onPrev}
          >
            前へ
          </button>
          <span className="hint daily30-focus-position">
            {focusIndex + 1} / {remainingCount}
          </span>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={!canGoNext || busy}
            onClick={onNext}
          >
            次へ
          </button>
        </nav>
      </header>

      <article className="daily30-focus-card daily30-focus-card-grid">
        <div className="daily30-focus-identity">
          <h4 className="daily30-focus-company">{candidate.companyName}</h4>
          <p className="daily30-focus-subline">
            <span>{prefecture}</span>
            <span className="daily30-focus-subline-sep">｜</span>
            <span>{industryLabel}</span>
            <span className="daily30-focus-subline-sep">｜</span>
            <span>{collectionSourceLabel}</span>
          </p>
        </div>

        <div className="daily30-focus-grid">
          <section className="daily30-focus-cell">
            <span className="daily30-focus-label">公式サイト</span>
            <span className="daily30-focus-value daily30-field-ellipsis">
              {siteUrl ? <ExternalLink href={siteUrl} label={shortenEmailSourceUrl(siteUrl, 42)} /> : '—'}
            </span>
          </section>
          <section className="daily30-focus-cell">
            <span className="daily30-focus-label">代表メール</span>
            <span className="daily30-focus-value daily30-field-ellipsis" title={email}>
              {email || '—'}
            </span>
          </section>
          <section className="daily30-focus-cell">
            <span className="daily30-focus-label">メール取得元</span>
            <span className="daily30-focus-value daily30-focus-email-source-detail">{emailSourceDetail}</span>
            {email && emailSourceUrl ? (
              <ExternalLink href={emailSourceUrl} label={shortenEmailSourceUrl(emailSourceUrl, 42)} />
            ) : email ? (
              <span className="hint daily30-focus-missing-url">メール取得元URL未確認</span>
            ) : null}
          </section>
          <section className="daily30-focus-cell">
            <span className="daily30-focus-label">発見元</span>
            <span className="daily30-focus-value">{discoveryDetail}</span>
            {discoveryUrl ? (
              <ExternalLink href={discoveryUrl} label={shortenEmailSourceUrl(discoveryUrl, 42)} />
            ) : null}
          </section>
        </div>

        <div className="daily30-focus-judgment-bar">
          <span className="daily30-focus-label">判定</span>
          <p className="daily30-focus-judgment-text">
            <span>{leadability.representativeEmailLabel}</span>
            <span className="daily30-focus-judgment-sep">｜</span>
            <span>{leadability.blockReasonJa ? leadability.blockReasonJa : 'ブロック理由なし'}</span>
            <span className="daily30-focus-judgment-sep">｜</span>
            <strong className={`daily30-focus-status daily30-focus-status-${leadability.kind}`}>
              {leadability.label}
            </strong>
          </p>
        </div>

        <footer className="daily30-focus-actions">
          {showExclude && onExclude ? (
            <button
              type="button"
              className="btn btn-exclude candidate-btn-focus"
              disabled={busy}
              onClick={onExclude}
            >
              {excluding ? '除外中…' : '候補から除外'}
            </button>
          ) : null}
          {showDefer && onDefer ? (
            <button
              type="button"
              className="btn btn-secondary candidate-btn-focus"
              disabled={busy}
              onClick={onDefer}
            >
              あとで確認
            </button>
          ) : null}
          {primaryAction === 'generate_copy' && onGenerateCopy ? (
            <button
              type="button"
              className="btn btn-primary candidate-btn-focus"
              disabled={busy}
              onClick={onGenerateCopy}
            >
              営業文を生成
            </button>
          ) : null}
          {primaryAction === 'view_copy' ? (
            <span className="hint daily30-focus-view-copy-hint">
              営業文生成済み — 下書き取り込みタブで内容を確認してください。
            </span>
          ) : null}
          {canApprove && onApprove ? (
            <button
              type="button"
              className="btn btn-primary candidate-btn-focus"
              disabled={busy}
              onClick={onApprove}
            >
              {approving ? '承認中…' : 'Lead化承認'}
            </button>
          ) : null}
        </footer>
      </article>
    </div>
  );
}
