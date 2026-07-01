import type { SalesDashboardResponse } from './salesDashboardApi.js';
import type { Lead } from '../../types/lead.js';
import {
  countAwaitingReplyLeads,
  inferNextActionForLead,
  resolveNextActionForLead,
  selectAwaitingReplyLeads,
} from '../workflow/replyManagement.js';

/** 親コンポーネントの leads 状態で返信・フォロー系メトリクスを揃える（サイドバーバッジと一致） */
export function reconcileDashboardFromClientLeads(
  dashboard: SalesDashboardResponse,
  leads: Lead[]
): SalesDashboardResponse {
  if (leads.length === 0) return dashboard;

  const awaitingReplyCount = countAwaitingReplyLeads(leads);
  const followUpTargetCount = leads.filter(
    (l) => resolveNextActionForLead(l) === 'フォローアップ'
  ).length;
  const awaiting = selectAwaitingReplyLeads(leads);

  const dailyChecklist = dashboard.dailyChecklist.map((item) => {
    if (item.id === 'check_replies') {
      return {
        ...item,
        status: awaitingReplyCount > 0 ? ('attention' as const) : ('ok' as const),
        badge: awaitingReplyCount > 0 ? `${awaitingReplyCount}件` : null,
      };
    }
    if (item.id === 'follow_up') {
      return {
        ...item,
        badge: followUpTargetCount > 0 ? `${followUpTargetCount}件` : null,
      };
    }
    return item;
  });

  let topRecommendedAction = dashboard.topRecommendedAction;
  if (topRecommendedAction?.category === 'reply_check') {
    topRecommendedAction = {
      ...topRecommendedAction,
      companyName:
        awaiting.length === 1
          ? awaiting[0].companyName
          : `返信待ち ${awaiting.length}社`,
      leadId: awaiting[0]?.id ?? null,
    };
  }

  const todaySalesQueue = dashboard.todaySalesQueue?.map((item) =>
    item.category === 'reply_waiting'
      ? {
          ...item,
          count: awaiting.length,
          leadPreview: awaiting
            .slice(0, 3)
            .map((l) => ({ leadId: l.id, companyName: l.companyName })),
        }
      : item
  );

  return {
    ...dashboard,
    metrics: {
      ...dashboard.metrics,
      awaitingReplyCount,
      followUpTargetCount,
    },
    dailyChecklist,
    topRecommendedAction,
    todaySalesQueue,
  };
}
