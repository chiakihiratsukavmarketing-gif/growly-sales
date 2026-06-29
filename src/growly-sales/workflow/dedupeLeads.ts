import type { Lead } from '../types/lead.js';

function normalizeCompanyName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '');
}

function normalizeWebsiteUrl(url: string): string {
  try {
    const parsed = new URL(url.trim());
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
    const path = parsed.pathname.replace(/\/$/, '') || '';
    return `${host}${path}`;
  } catch {
    return url.trim().toLowerCase();
  }
}

function normalizeEmailCandidates(emails: string[]): string {
  return [...emails].map((e) => e.trim().toLowerCase()).sort().join(';');
}

export function leadDedupeKey(lead: Lead): string {
  return [
    normalizeCompanyName(lead.companyName),
    normalizeWebsiteUrl(lead.websiteUrl),
    normalizeEmailCandidates(lead.emailCandidates),
  ].join('|');
}

export function dedupeLeads(leads: Lead[]): Lead[] {
  const seen = new Map<string, Lead>();
  for (const lead of leads) {
    const key = leadDedupeKey(lead);
    if (!seen.has(key)) {
      seen.set(key, lead);
    }
  }
  return Array.from(seen.values());
}

export function filterNewLeads(existing: Lead[], incoming: Lead[]): {
  newLeads: Lead[];
  duplicates: Lead[];
} {
  const existingKeys = new Set(existing.map(leadDedupeKey));
  const newLeads: Lead[] = [];
  const duplicates: Lead[] = [];

  for (const lead of incoming) {
    const key = leadDedupeKey(lead);
    if (existingKeys.has(key)) {
      duplicates.push(lead);
    } else {
      existingKeys.add(key);
      newLeads.push(lead);
    }
  }

  return { newLeads, duplicates };
}

export function mergeAndDedupeLeads(existing: Lead[], incoming: Lead[]): Lead[] {
  return dedupeLeads([...existing, ...incoming]);
}
