import type { SalesDashboard } from '../analytics/buildSalesDashboard.js';
import { readApiError } from './apiError.js';

const API_BASE = '';

export interface SalesDashboardResponse extends SalesDashboard {
  generatedAt: string;
  leadsPath: string;
  note: string;
}

export async function fetchSalesDashboard(): Promise<SalesDashboardResponse> {
  const res = await fetch(`${API_BASE}/api/sales-dashboard`);
  if (!res.ok) {
    throw new Error(await readApiError(res, 'GET /api/sales-dashboard', 'ダッシュボードの取得に失敗しました'));
  }
  return (await res.json()) as SalesDashboardResponse;
}
