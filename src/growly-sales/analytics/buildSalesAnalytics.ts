import type { Lead, LeadScore, ReplyStatus, DealStatus } from '../types/lead.js';

export interface FollowUpItem {
  leadId: string;
  companyName: string;
  followUpDate: string;
  followUpMemo: string;
  replyStatus: ReplyStatus;
  dealStatus: DealStatus;
  nextAction: string;
}

export interface NextActionItem {
  leadId: string;
  companyName: string;
  priority: number;
  reason: string;
  nextAction: string;
  followUpDate: string | null;
}

export interface BreakdownRow {
  key: string;
  total: number;
  manualSent: number;
  replied: number;
  interested: number;
  meetingScheduled: number;
  won: number;
  lost: number;
}

export interface SalesAnalytics {
  totalLeads: number;
  approvedLeads: number;
  manualSentLeads: number;
  notSentLeads: number;
  blockedLeads: number;
  doNotContactLeads: number;

  noReplyCount: number;
  repliedCount: number;
  interestedCount: number;
  notInterestedCount: number;
  meetingScheduledCount: number;
  followUpNeededCount: number;

  openDeals: number;
  wonDeals: number;
  lostDeals: number;
  pausedDeals: number;

  manualSendRate: number;
  replyRate: number;
  interestedRate: number;
  meetingRate: number;
  wonRate: number;

  leadScoreBreakdown: BreakdownRow[];
  salesAngleBreakdown: BreakdownRow[];

  followUpList: FollowUpItem[];
  nextActionList: NextActionItem[];
}

function safeRate(numerator: number, denominator: number): number {
  if (!denominator) return 0;
  const value = numerator / denominator;
  if (!Number.isFinite(value) || Number.isNaN(value)) return 0;
  return Number(value.toFixed(4));
}

function normalizeKey(key: string): string {
  const trimmed = key.trim();
  return trimmed || '（未設定）';
}

function isManualSent(lead: Lead): boolean {
  return lead.sendStatus === 'manual_sent';
}

function isNotSent(lead: Lead): boolean {
  return lead.sendStatus === 'not_sent';
}

function isBlocked(lead: Lead): boolean {
  return lead.sendStatus === 'blocked' || lead.doNotContact;
}

function hasReply(lead: Lead): boolean {
  return ['replied', 'interested', 'not_interested', 'meeting_scheduled', 'follow_up_needed'].includes(
    lead.replyStatus
  );
}

function isInterested(lead: Lead): boolean {
  return lead.replyStatus === 'interested' || lead.replyStatus === 'meeting_scheduled';
}

function isMeetingScheduled(lead: Lead): boolean {
  return lead.replyStatus === 'meeting_scheduled';
}

function sortByCountDesc(rows: BreakdownRow[]): BreakdownRow[] {
  return [...rows].sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    return a.key.localeCompare(b.key, 'ja');
  });
}

function buildBreakdown(
  leads: Lead[],
  keyFn: (lead: Lead) => string
): BreakdownRow[] {
  const map = new Map<string, BreakdownRow>();

  for (const lead of leads) {
    const key = normalizeKey(keyFn(lead));
    const row = map.get(key) ?? {
      key,
      total: 0,
      manualSent: 0,
      replied: 0,
      interested: 0,
      meetingScheduled: 0,
      won: 0,
      lost: 0,
    };

    row.total += 1;
    if (isManualSent(lead)) row.manualSent += 1;
    if (hasReply(lead)) row.replied += 1;
    if (isInterested(lead)) row.interested += 1;
    if (isMeetingScheduled(lead)) row.meetingScheduled += 1;
    if (lead.dealStatus === 'won') row.won += 1;
    if (lead.dealStatus === 'lost') row.lost += 1;

    map.set(key, row);
  }

  return sortByCountDesc([...map.values()]);
}

function todayIsoDate(): string {
  // ローカル運用のため、JST等ローカル日付で比較できるよう YYYY-MM-DD にする
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function compareDateAsc(a: string, b: string): number {
  // YYYY-MM-DD 文字列比較でOK
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export function buildSalesAnalytics(leads: Lead[]): SalesAnalytics {
  const totalLeads = leads.length;
  const approvedLeads = leads.filter((l) => l.humanReviewStatus === 'approved').length;
  const manualSentLeads = leads.filter(isManualSent).length;
  const notSentLeads = leads.filter(isNotSent).length;
  const blockedLeads = leads.filter((l) => l.sendStatus === 'blocked').length;
  const doNotContactLeads = leads.filter((l) => l.doNotContact).length;

  const noReplyCount = leads.filter((l) => l.replyStatus === 'no_reply').length;
  const repliedCount = leads.filter((l) => l.replyStatus === 'replied').length;
  const interestedCount = leads.filter((l) => l.replyStatus === 'interested').length;
  const notInterestedCount = leads.filter((l) => l.replyStatus === 'not_interested').length;
  const meetingScheduledCount = leads.filter((l) => l.replyStatus === 'meeting_scheduled').length;
  const followUpNeededCount = leads.filter((l) => l.replyStatus === 'follow_up_needed').length;

  const openDeals = leads.filter((l) => l.dealStatus === 'open').length;
  const wonDeals = leads.filter((l) => l.dealStatus === 'won').length;
  const lostDeals = leads.filter((l) => l.dealStatus === 'lost').length;
  const pausedDeals = leads.filter((l) => l.dealStatus === 'paused').length;

  const manualSendRate = safeRate(manualSentLeads, approvedLeads);
  const replyRate = safeRate(leads.filter(hasReply).length, manualSentLeads);
  const interestedRate = safeRate(leads.filter(isInterested).length, manualSentLeads);
  const meetingRate = safeRate(meetingScheduledCount, manualSentLeads);
  const wonRate = safeRate(wonDeals, manualSentLeads);

  const leadScoreBreakdown = buildBreakdown(leads, (l) => l.leadScore as LeadScore);
  const salesAngleBreakdown = buildBreakdown(leads, (l) => l.salesAngle);

  const followUpList: FollowUpItem[] = leads
    .filter((l) => Boolean(l.followUpDate))
    .map((l) => ({
      leadId: l.id,
      companyName: l.companyName,
      followUpDate: l.followUpDate as string,
      followUpMemo: l.followUpMemo ?? '',
      replyStatus: l.replyStatus,
      dealStatus: l.dealStatus,
      nextAction: l.nextAction,
    }))
    .sort((a, b) => compareDateAsc(a.followUpDate, b.followUpDate));

  const today = todayIsoDate();

  function nextPriority(lead: Lead): NextActionItem | null {
    if (lead.followUpDate && lead.followUpDate <= today) {
      return {
        leadId: lead.id,
        companyName: lead.companyName,
        priority: 1,
        reason: 'followUpDate が今日以前',
        nextAction: lead.nextAction,
        followUpDate: lead.followUpDate,
      };
    }
    if (lead.replyStatus === 'follow_up_needed') {
      return {
        leadId: lead.id,
        companyName: lead.companyName,
        priority: 2,
        reason: 'replyStatus=follow_up_needed',
        nextAction: lead.nextAction,
        followUpDate: lead.followUpDate,
      };
    }
    if (lead.replyStatus === 'interested') {
      return {
        leadId: lead.id,
        companyName: lead.companyName,
        priority: 3,
        reason: 'replyStatus=interested',
        nextAction: lead.nextAction,
        followUpDate: lead.followUpDate,
      };
    }
    if (lead.dealStatus === 'open') {
      return {
        leadId: lead.id,
        companyName: lead.companyName,
        priority: 4,
        reason: 'dealStatus=open',
        nextAction: lead.nextAction,
        followUpDate: lead.followUpDate,
      };
    }
    if (lead.humanReviewStatus === 'approved' && lead.sendStatus === 'not_sent' && !isBlocked(lead)) {
      return {
        leadId: lead.id,
        companyName: lead.companyName,
        priority: 5,
        reason: '承認済みかつ未送信',
        nextAction: lead.nextAction,
        followUpDate: lead.followUpDate,
      };
    }
    return null;
  }

  const nextActionList = leads
    .map(nextPriority)
    .filter((x): x is NextActionItem => x !== null)
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      // 同優先ならフォロー日が早い方
      const da = a.followUpDate ?? '9999-12-31';
      const db = b.followUpDate ?? '9999-12-31';
      if (da !== db) return compareDateAsc(da, db);
      return a.companyName.localeCompare(b.companyName, 'ja');
    });

  return {
    totalLeads,
    approvedLeads,
    manualSentLeads,
    notSentLeads,
    blockedLeads,
    doNotContactLeads,

    noReplyCount,
    repliedCount,
    interestedCount,
    notInterestedCount,
    meetingScheduledCount,
    followUpNeededCount,

    openDeals,
    wonDeals,
    lostDeals,
    pausedDeals,

    manualSendRate,
    replyRate,
    interestedRate,
    meetingRate,
    wonRate,

    leadScoreBreakdown,
    salesAngleBreakdown,

    followUpList,
    nextActionList,
  };
}

