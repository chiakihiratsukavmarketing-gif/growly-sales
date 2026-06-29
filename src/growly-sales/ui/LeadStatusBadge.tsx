import type { Lead } from '../../types/lead.js';

type BadgeKind = 'review' | 'human' | 'send' | 'risk' | 'score';

interface LeadStatusBadgeProps {
  kind: BadgeKind;
  value: string;
}

const LABELS: Record<string, string> = {
  pending: '未レビュー',
  approve: '校閲OK',
  revise: '要修正',
  reject: '校閲NG',
  approved: '承認済',
  rejected: '却下',
  needs_revision: '修正依頼',
  not_sent: '未送信',
  manual_sent: '手動送信済',
  draft: '下書き',
  sent: '送信済',
  blocked: 'ブロック',
  none: '—',
  no_reply: '返信なし',
  replied: '返信あり',
  interested: '興味あり',
  not_interested: '興味なし',
  meeting_scheduled: '商談化',
  follow_up_needed: 'フォロー必要',
  declined: '辞退',
  bounced: 'バウンス',
  requested_report: '診断希望',
  open: '対応中',
  won: '受注',
  lost: '失注',
  paused: '一時停止',
  low: '低',
  medium: '中',
  high: '高',
  A: 'A',
  B: 'B',
  C: 'C',
  UNKNOWN: '—',
};

const COLORS: Record<string, string> = {
  pending: 'badge-neutral',
  approve: 'badge-success',
  revise: 'badge-warn',
  reject: 'badge-danger',
  approved: 'badge-success',
  rejected: 'badge-danger',
  needs_revision: 'badge-warn',
  not_sent: 'badge-neutral',
  manual_sent: 'badge-teal',
  draft: 'badge-teal',
  sent: 'badge-teal',
  blocked: 'badge-danger',
  none: 'badge-neutral',
  no_reply: 'badge-neutral',
  replied: 'badge-teal',
  interested: 'badge-teal',
  not_interested: 'badge-danger',
  meeting_scheduled: 'badge-teal',
  follow_up_needed: 'badge-warn',
  declined: 'badge-danger',
  bounced: 'badge-danger',
  requested_report: 'badge-warn',
  open: 'badge-teal',
  won: 'badge-success',
  lost: 'badge-danger',
  paused: 'badge-warn',
  low: 'badge-success',
  medium: 'badge-warn',
  high: 'badge-danger',
  A: 'badge-score-a',
  B: 'badge-score-b',
  C: 'badge-score-c',
  UNKNOWN: 'badge-neutral',
};

export function LeadStatusBadge({ kind, value }: LeadStatusBadgeProps) {
  const label = LABELS[value] ?? value;
  const colorClass = COLORS[value] ?? 'badge-neutral';

  return (
    <span className={`badge ${colorClass}`} data-kind={kind}>
      {label}
    </span>
  );
}

export function hasInstagram(lead: Lead): boolean {
  return Boolean(lead.instagramUrl);
}

export function hasContactForm(lead: Lead): boolean {
  return Boolean(lead.contactFormUrl);
}

export function hasCaseStudy(lead: Lead): boolean {
  return Boolean(lead.caseStudyUrl);
}

export function yesNoLabel(value: boolean): string {
  return value ? 'あり' : 'なし';
}
