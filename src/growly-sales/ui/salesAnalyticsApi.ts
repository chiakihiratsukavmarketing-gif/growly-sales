import { readApiError } from './apiError.js';
import type { SalesAnalytics } from '../analytics/buildSalesAnalytics.js';

export interface SalesAnalyticsResponse {
  analytics: SalesAnalytics;
  generatedAt: string;
  leadsPath?: string;
  note?: string;
}

const API_BASE = '';

export async function fetchSalesAnalytics(): Promise<SalesAnalyticsResponse> {
  const res = await fetch(`${API_BASE}/api/sales-analytics`);
  if (!res.ok) {
    throw new Error(await readApiError(res, 'GET /api/sales-analytics', '営業分析の取得に失敗しました'));
  }
  return (await res.json()) as SalesAnalyticsResponse;
}

