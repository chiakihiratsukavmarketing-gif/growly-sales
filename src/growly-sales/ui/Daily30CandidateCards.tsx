import type { ReactNode } from 'react';
import type { ExternalLeadCandidate } from '../adapters/externalLeadCandidateTypes.js';
import { resolveDaily30WorkflowStatus } from '../candidates/resolveDaily30WorkflowStatus.js';
import {
  pipelineStatusLabel,
  pipelineStatusVariant,
} from './daily30StatusLabels.js';

function shortenUrl(url: string, maxLen = 28): string {
  const trimmed = url.trim();
  if (!trimmed) return '—';
  try {
    const u = new URL(trimmed);
    const host = u.hostname.replace(/^www\./, '');
    const path = u.pathname === '/' ? '' : u.pathname;
    const short = `${host}${path}`;
    if (short.length <= maxLen) return short;
    return `${short.slice(0, maxLen - 1)}…`;
  } catch {
    if (trimmed.length <= maxLen) return trimmed;
    return `${trimmed.slice(0, maxLen - 1)}…`;
  }
}

function ExternalLink({ href, label }: { href: string; label?: string }) {
  const text = label ?? shortenUrl(href);
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="daily30-link-chip"
      title={href}
    >
      {text}
    </a>
  );
}

function StatusBadge({ label, variant }: { label: string; variant: string }) {
  return <span className={`status-badge status-badge-${variant}`}>{label}</span>;
}

function CandidateStatusBadges({ candidate: c }: { candidate: ExternalLeadCandidate }) {
  const workflow = resolveDaily30WorkflowStatus(c);
  const pipelineLabel = pipelineStatusLabel(c.pipelineStatus);
  const showPipeline =
    c.pipelineStatus === 'email_found' ||
    c.pipelineStatus === 'email_not_found' ||
    c.pipelineStatus === 'excluded' ||
    c.pipelineStatus === 'duplicate';
  const showWorkflow = workflow.label !== '未承認' || c.importStatus === 'approved_for_lead';

  return (
    <div className="daily30-candidate-badges">
      {showPipeline ? (
        <StatusBadge label={pipelineLabel} variant={pipelineStatusVariant(c.pipelineStatus)} />
      ) : null}
      {showWorkflow ? (
        <StatusBadge label={workflow.label} variant={`workflow-${workflow.variant}`} />
      ) : showPipeline ? (
        <StatusBadge label="未承認" variant="status-neutral" />
      ) : null}
    </div>
  );
}

interface Daily30CandidateCardProps {
  candidate: ExternalLeadCandidate;
  showApprove?: boolean;
  approving?: boolean;
  onApprove?: () => void;
  compact?: boolean;
  approvalBlockReason?: string | null;
  duplicateLeadName?: string | null;
}

export function Daily30CandidateCard({
  candidate: c,
  showApprove = false,
  approving = false,
  onApprove,
  compact = true,
  approvalBlockReason = null,
  duplicateLeadName = null,
}: Daily30CandidateCardProps) {
  const siteUrl = c.officialSiteUrl ?? c.websiteUrl ?? '';
  const email = c.emailCandidates?.[0] ?? '';
  const blocked = Boolean(approvalBlockReason);
  const canApprove = showApprove && c.importStatus !== 'approved_for_lead' && !blocked;
  const workflow = resolveDaily30WorkflowStatus(c);

  return (
    <article className={`daily30-candidate-card ${compact ? 'daily30-candidate-card-compact' : ''}`}>
      <div className="daily30-candidate-card-head">
        <div className="daily30-candidate-card-title">
          <h4 className="daily30-candidate-name" title={c.companyName}>
            {c.companyName}
          </h4>
          <CandidateStatusBadges candidate={c} />
        </div>
        {showApprove ? (
          <div className="daily30-candidate-actions">
            {canApprove ? (
              <button
                type="button"
                className="btn btn-primary btn-xs"
                disabled={approving}
                onClick={onApprove}
              >
                {approving ? '承認中…' : 'Lead化承認'}
              </button>
            ) : blocked ? (
              <span className="status-badge status-badge-status-warn">承認不可</span>
            ) : (
              <span className={`status-badge status-badge-workflow-${workflow.variant}`}>
                {workflow.label}
              </span>
            )}
          </div>
        ) : null}
      </div>

      {blocked ? (
        <p className="hint daily30-approval-block-hint">
          既存Leadと重複の可能性
          {duplicateLeadName ? `（${duplicateLeadName}）` : ''}
          {' — '}
          {approvalBlockReason}
        </p>
      ) : null}

      <div className="daily30-candidate-grid daily30-candidate-grid-compact">
        <div className="daily30-candidate-field">
          <span className="daily30-field-label">エリア</span>
          <span className="daily30-field-value daily30-field-ellipsis" title={c.area}>
            {c.area || '—'}
          </span>
        </div>
        <div className="daily30-candidate-field">
          <span className="daily30-field-label">メール</span>
          <span className="daily30-field-value daily30-field-ellipsis" title={email}>
            {email || '—'}
          </span>
        </div>
        <div className="daily30-candidate-field">
          <span className="daily30-field-label">サイト</span>
          <span className="daily30-field-value daily30-field-ellipsis">
            {siteUrl ? <ExternalLink href={siteUrl} /> : '—'}
          </span>
        </div>
        {!compact && c.contactFormUrl ? (
          <div className="daily30-candidate-field">
            <span className="daily30-field-label">フォーム</span>
            <span className="daily30-field-value">
              <ExternalLink href={c.contactFormUrl} label="フォーム" />
            </span>
          </div>
        ) : null}
      </div>
    </article>
  );
}

export function Daily30CandidateList({
  candidates,
  showApprove = false,
  approvingId = null,
  onApprove,
  emptyMessage = '候補がありません。',
  approvalBlockHints = {},
}: {
  candidates: ExternalLeadCandidate[];
  showApprove?: boolean;
  approvingId?: string | null;
  onApprove?: (candidate: ExternalLeadCandidate) => void;
  emptyMessage?: string;
  approvalBlockHints?: Record<string, { blockReason: string; duplicateLeadName?: string }>;
}) {
  if (candidates.length === 0) {
    return <p className="hint daily30-candidate-empty">{emptyMessage}</p>;
  }
  return (
    <div className="daily30-candidate-list daily30-candidate-list-compact">
      {candidates.map((c) => {
        const hint = approvalBlockHints[c.externalCandidateId];
        return (
        <Daily30CandidateCard
          key={c.externalCandidateId}
          candidate={c}
          showApprove={showApprove}
          approving={approvingId === c.externalCandidateId}
          onApprove={onApprove ? () => onApprove(c) : undefined}
          approvalBlockReason={hint?.blockReason ?? null}
          duplicateLeadName={hint?.duplicateLeadName ?? null}
        />
        );
      })}
    </div>
  );
}

export function pipelineCountChips(counts: Record<string, number>): ReactNode {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return null;
  return (
    <div className="daily30-pipeline-chips">
      {entries.map(([k, v]) => (
        <span key={k} className="daily30-pipeline-chip">
          {pipelineStatusLabel(k)}: <strong>{v}</strong>
        </span>
      ))}
    </div>
  );
}
