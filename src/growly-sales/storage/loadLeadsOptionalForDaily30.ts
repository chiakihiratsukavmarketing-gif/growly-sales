import type { Lead } from '../types/lead.js';
import { access } from 'node:fs/promises';
import { loadLeadsFromJson } from './jsonLeadRepository.js';
import { getLeadsJsonPath } from '../config/paths.js';

/** Daily 30 API 用 — leads.json が無い場合は空配列（Cloud 候補閲覧のみ） */
export async function loadLeadsOptionalForDaily30(): Promise<Lead[]> {
  const leadsPath = getLeadsJsonPath();
  try {
    await access(leadsPath);
    return loadLeadsFromJson(leadsPath);
  } catch {
    return [];
  }
}
