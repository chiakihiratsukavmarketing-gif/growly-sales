import { access } from 'node:fs/promises';
import type { Lead } from '../types/lead.js';
import { loadLeadsFromJson } from '../storage/jsonLeadRepository.js';
import { getLeadsJsonPath } from '../config/paths.js';

export class LeadsFileNotFoundError extends Error {
  readonly api: string;
  readonly path: string;

  constructor(api: string, path: string) {
    super(`leads.json が見つかりません: ${path}`);
    this.name = 'LeadsFileNotFoundError';
    this.api = api;
    this.path = path;
  }
}

/** UI/API用 — leads.json が無い場合は空配列にせずエラー */
export async function loadLeadsForApi(apiName: string): Promise<Lead[]> {
  const leadsPath = getLeadsJsonPath();
  try {
    await access(leadsPath);
  } catch {
    throw new LeadsFileNotFoundError(apiName, leadsPath);
  }
  return loadLeadsFromJson(leadsPath);
}
