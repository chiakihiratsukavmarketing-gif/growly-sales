import type { Lead } from '../types/lead.js';

export interface WeeklySalesSummary {
  /** 週の開始日（local timezone / YYYY-MM-DD） */
  weekStart: string;
  /** 週の終了日（local timezone / YYYY-MM-DD） */
  weekEnd: string;
  sentCount: number;
  replyCount: number;
  requestedReportCount: number;
  declinedCount: number;
  bouncedCount: number;
  newLeadCount: number;
  gmailDraftCreatedCount: number;
  currentAwaitingReplyCount: number;
  currentFollowUpTargetCount: number;
}

function startOfWeekMondayLocal(d: Date): Date {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  // JS: 0=Sun..6=Sat. Monday-start week.
  const day = date.getDay();
  const diff = (day + 6) % 7; // Mon=0, Sun=6
  date.setDate(date.getDate() - diff);
  return date;
}

function endOfWeekSundayLocal(d: Date): Date {
  const start = startOfWeekMondayLocal(d);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

function toYmdLocal(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function inRange(iso: string | null | undefined, start: Date, end: Date): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return false;
  return t >= start.getTime() && t <= end.getTime();
}

export function buildWeeklySalesSummary(
  leads: Lead[],
  now: Date,
  options: {
    currentAwaitingReplyCount: number;
    currentFollowUpTargetCount: number;
  }
): WeeklySalesSummary {
  const start = startOfWeekMondayLocal(now);
  const end = endOfWeekSundayLocal(now);

  const sentCount = leads.filter((l) => inRange(l.manualSentAt, start, end)).length;
  const replyCount = leads.filter((l) => l.replyStatus !== 'none' && inRange(l.replyReceivedAt, start, end)).length;
  const requestedReportCount = leads.filter(
    (l) => l.replyStatus === 'requested_report' && inRange(l.replyReceivedAt, start, end)
  ).length;
  const declinedCount = leads.filter((l) => l.replyStatus === 'declined' && inRange(l.replyReceivedAt, start, end)).length;
  const bouncedCount = leads.filter((l) => l.replyStatus === 'bounced' && inRange(l.replyReceivedAt, start, end)).length;
  const newLeadCount = leads.filter((l) => inRange(l.createdAt, start, end)).length;
  const gmailDraftCreatedCount = leads.filter((l) => inRange(l.gmailDraftCreatedAt, start, end)).length;

  return {
    weekStart: toYmdLocal(start),
    weekEnd: toYmdLocal(end),
    sentCount,
    replyCount,
    requestedReportCount,
    declinedCount,
    bouncedCount,
    newLeadCount,
    gmailDraftCreatedCount,
    currentAwaitingReplyCount: options.currentAwaitingReplyCount,
    currentFollowUpTargetCount: options.currentFollowUpTargetCount,
  };
}

