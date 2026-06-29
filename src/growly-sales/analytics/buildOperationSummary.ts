import type { SalesAnalytics } from './buildSalesAnalytics.js';

export interface OperationSummary {
  overallStatus: string;
  goodSignals: string[];
  warningSignals: string[];
  nextRecommendedActions: string[];
  followUpRecommendations: string[];
  improvementIdeas: string[];
  dataQualityNotes: string[];
}

function uniq(items: string[]): string[] {
  return [...new Set(items)].filter(Boolean);
}

export function buildOperationSummary(analytics: SalesAnalytics): OperationSummary {
  const goodSignals: string[] = [];
  const warningSignals: string[] = [];
  const nextRecommendedActions: string[] = [];
  const followUpRecommendations: string[] = [];
  const improvementIdeas: string[] = [];
  const dataQualityNotes: string[] = [];

  // データ量
  if (analytics.manualSentLeads === 0) {
    warningSignals.push('手動送信の記録がまだありません');
    nextRecommendedActions.push('承認済みLeadを1件ずつ手動送信し、手動送信済み（記録）に更新してください');
  } else {
    goodSignals.push(`手動送信済みが ${analytics.manualSentLeads} 件あります`);
  }

  if (analytics.approvedLeads > 0 && analytics.notSentLeads > 0) {
    warningSignals.push('承認済みLeadがあるが未送信のままです');
    nextRecommendedActions.push('承認済みかつ未送信のLeadから順に送信（手動）してください');
  }

  // 返信・興味
  if (analytics.replyRate > 0) {
    goodSignals.push(`返信率が ${Math.round(analytics.replyRate * 100)}% です`);
    improvementIdeas.push('返信があった切り口（salesAngle）のLeadを増やしてください');
  } else if (analytics.manualSentLeads > 0) {
    warningSignals.push('手動送信済みだが返信記録がありません');
    nextRecommendedActions.push('返信が来たLeadの replyStatus / メモを更新してください');
  }

  if (analytics.interestedCount > 0) {
    goodSignals.push('興味ありの返信があります');
    nextRecommendedActions.push('興味ありLeadを商談化（meeting_scheduled）に進めてください');
  }

  if (analytics.meetingScheduledCount > 0) {
    goodSignals.push('商談化（meeting_scheduled）Leadがあります');
  }

  if (analytics.wonDeals > 0) {
    goodSignals.push('受注（won）データがあります');
    improvementIdeas.push('受注したLeadと類似条件（leadScore/salesAngle/業種/地域）のLeadを増やしてください');
  }

  // フォロー
  if (analytics.followUpList.length > 0) {
    followUpRecommendations.push(`フォロー予定が ${analytics.followUpList.length} 件あります。期限の近い順に対応してください`);
  }
  if (analytics.nextActionList.some((x) => x.priority === 1)) {
    warningSignals.push('followUpDate が今日以前のLeadがあります');
    nextRecommendedActions.push('期限切れフォローを最優先で対応してください');
  }

  // データ品質
  if (analytics.totalLeads === 0) {
    dataQualityNotes.push('leads.json が空です。day1 → generate を実行してください');
  }
  if (analytics.doNotContactLeads > 0) {
    dataQualityNotes.push('doNotContact=true のLeadがあります。除外運用を確認してください');
  }
  if (analytics.blockedLeads > 0) {
    dataQualityNotes.push('sendStatus=blocked のLeadがあります。送信対象外として管理してください');
  }

  // overallStatus（優先順で決める）
  let overallStatus = '運用状況を確認してください';
  if (analytics.totalLeads === 0) {
    overallStatus = 'Leadがまだありません。input-sites.csv を追加して day1 → generate を実行してください';
  } else if (analytics.manualSentLeads === 0 && analytics.approvedLeads > 0) {
    overallStatus = 'まだ送信データが少ないため、まずは承認済みLeadを手動送信してください';
  } else if (analytics.nextActionList.some((x) => x.priority === 1)) {
    overallStatus = 'フォロー予定があります。期限の近いLeadから対応してください';
  } else if (analytics.interestedCount > 0 || analytics.meetingScheduledCount > 0) {
    overallStatus = '返信が出始めています。反応のある切り口を増やしてください';
  } else if (analytics.wonDeals > 0) {
    overallStatus = '受注データが出ています。似た条件のLeadを増やしてください';
  }

  // 最低限の項目は空にしない（UIで見やすく）
  if (nextRecommendedActions.length === 0) {
    nextRecommendedActions.push('次アクション一覧を確認し、優先度の高いLeadから対応してください');
  }
  if (warningSignals.length === 0) {
    warningSignals.push('重大な警告はありません');
  }
  if (goodSignals.length === 0) {
    goodSignals.push('良い兆候はまだ少ないため、データを蓄積してください');
  }

  return {
    overallStatus,
    goodSignals: uniq(goodSignals),
    warningSignals: uniq(warningSignals),
    nextRecommendedActions: uniq(nextRecommendedActions),
    followUpRecommendations: uniq(followUpRecommendations),
    improvementIdeas: uniq(improvementIdeas),
    dataQualityNotes: uniq(dataQualityNotes),
  };
}

