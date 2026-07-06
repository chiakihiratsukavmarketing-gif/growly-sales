import { readApiError } from './apiError.js';
import type { OutreachTemplate, OutreachTemplateStore, TemplatePreviewInput } from '../mail-operations/templateTypes.js';

const API_BASE = '';

export interface OutreachTemplatesResponse extends OutreachTemplateStore {
  activeTemplate: OutreachTemplate | null;
  generatedAt: string;
  note: string;
}

export interface TemplatePreviewResponse {
  emailSubject: string;
  emailBody: string;
  templateId: string | null;
  mock: true;
}

export const TEMPLATE_ACTIVATE_CONFIRM_TOKEN = 'TEMPLATE_ACTIVATE';

export async function fetchOutreachTemplates(): Promise<OutreachTemplatesResponse> {
  const res = await fetch(`${API_BASE}/api/outreach-templates`);
  if (!res.ok) {
    throw new Error(await readApiError(res, 'GET /api/outreach-templates', 'テンプレートの取得に失敗しました'));
  }
  return (await res.json()) as OutreachTemplatesResponse;
}

export async function saveOutreachTemplateDraftApi(
  template: Partial<OutreachTemplate> & { name: string }
): Promise<{ template: OutreachTemplate; message: string }> {
  const res = await fetch(`${API_BASE}/api/outreach-templates/draft`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(template),
  });
  if (!res.ok) {
    throw new Error(await readApiError(res, 'POST /api/outreach-templates/draft', '下書き保存に失敗しました'));
  }
  return (await res.json()) as { template: OutreachTemplate; message: string };
}

export async function activateOutreachTemplateApi(
  templateId: string,
  confirmToken: string
): Promise<{ template: OutreachTemplate; message: string }> {
  const res = await fetch(`${API_BASE}/api/outreach-templates/activate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ templateId, confirmToken }),
  });
  if (!res.ok) {
    throw new Error(await readApiError(res, 'POST /api/outreach-templates/activate', '本番適用に失敗しました'));
  }
  return (await res.json()) as { template: OutreachTemplate; message: string };
}

export async function previewOutreachTemplateApi(input: {
  template?: Partial<OutreachTemplate>;
  preview?: TemplatePreviewInput;
}): Promise<TemplatePreviewResponse> {
  const res = await fetch(`${API_BASE}/api/outreach-templates/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error(await readApiError(res, 'POST /api/outreach-templates/preview', 'プレビューに失敗しました'));
  }
  return (await res.json()) as TemplatePreviewResponse;
}

export async function resetOutreachTemplateDefaultsApi(): Promise<{ template: OutreachTemplate; message: string }> {
  const res = await fetch(`${API_BASE}/api/outreach-templates/reset-defaults`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    throw new Error(await readApiError(res, 'POST /api/outreach-templates/reset-defaults', '初期化に失敗しました'));
  }
  return (await res.json()) as { template: OutreachTemplate; message: string };
}
