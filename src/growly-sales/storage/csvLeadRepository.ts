import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Lead, LeadInputRow } from '../types/lead.js';
import { LEAD_CSV_HEADERS } from '../types/lead.js';
import { detectInputFieldMojibake, readCsvFileAsUtf8 } from './csvEncoding.js';

const ARRAY_SEPARATOR = ';';

function escapeCsvField(value: string): string {
  if (value.includes('"') || value.includes(',') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function serializeField(key: keyof Lead, lead: Lead): string {
  const value = lead[key];
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (Array.isArray(value)) return value.join(ARRAY_SEPARATOR);
  return String(value);
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      fields.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}

function parseArrayField(value: string): string[] {
  if (!value.trim()) return [];
  return value.split(ARRAY_SEPARATOR).map((s) => s.trim()).filter(Boolean);
}

function rowToLead(headers: string[], values: string[]): Lead {
  const record: Record<string, string> = {};
  headers.forEach((header, i) => {
    record[header] = values[i] ?? '';
  });

  return {
    id: record.id ?? '',
    companyName: record.companyName ?? '',
    area: record.area ?? '',
    industry: record.industry ?? '',
    websiteUrl: record.websiteUrl ?? '',
    instagramUrl: record.instagramUrl || null,
    emailCandidates: parseArrayField(record.emailCandidates ?? ''),
    emailCandidateSourceUrls: parseArrayField(record.emailCandidateSourceUrls ?? ''),
    emailCandidateConfidence: (record.emailCandidateConfidence || 'low') as Lead['emailCandidateConfidence'],
    emailContactType: (record.emailContactType || 'unknown') as Lead['emailContactType'],
    contactPathType: (record.contactPathType || 'none') as Lead['contactPathType'],
    contactPathConfidence: (record.contactPathConfidence || 'low') as Lead['contactPathConfidence'],
    contactFormUrl: record.contactFormUrl || null,
    recruitUrl: record.recruitUrl || null,
    caseStudyUrl: record.caseStudyUrl || null,
    companyProfileUrl: record.companyProfileUrl || null,
    sourceUrls: parseArrayField(record.sourceUrls ?? ''),
    leadScore: (record.leadScore || 'UNKNOWN') as Lead['leadScore'],
    salesAngle: record.salesAngle ?? '',
    companyAnalysis: record.companyAnalysis ?? '',
    customHook: record.customHook ?? '',
    hookSourceType: record.hookSourceType ?? '',
    hookSourceUrl: record.hookSourceUrl?.trim() ? record.hookSourceUrl.trim() : null,
    customHookReason: record.customHookReason ?? '',
    emailSubject: record.emailSubject ?? '',
    emailBody: record.emailBody ?? '',
    reviewStatus: (record.reviewStatus || 'pending') as Lead['reviewStatus'],
    reviewComment: record.reviewComment ?? '',
    nextAction: record.nextAction ?? '',
    collectionStatus: (record.collectionStatus || 'pending') as Lead['collectionStatus'],
    humanReviewStatus: (record.humanReviewStatus || 'pending') as Lead['humanReviewStatus'],
    sendStatus: (record.sendStatus || 'not_sent') as Lead['sendStatus'],
    replyStatus: (record.replyStatus || 'none') as Lead['replyStatus'],
    manualSentAt: record.manualSentAt || null,
    manualSendMethod: (record.manualSendMethod || null) as Lead['manualSendMethod'],
    replyReceivedAt: record.replyReceivedAt || record.repliedAt || null,
    repliedAt: record.repliedAt || record.replyReceivedAt || null,
    replyMemo: record.replyMemo ?? record.replySummary ?? '',
    replySummary: record.replySummary ?? record.replyMemo ?? '',
    followUpDate: record.followUpDate || record.followUpDueAt || null,
    followUpDueAt: record.followUpDueAt || record.followUpDate || null,
    followUpMemo: record.followUpMemo ?? '',
    dealStatus: (record.dealStatus || 'none') as Lead['dealStatus'],
    outcomeMemo: record.outcomeMemo ?? '',
    communicationMemo: record.communicationMemo ?? '',
    gmailDraftStatus: (record.gmailDraftStatus || 'none') as Lead['gmailDraftStatus'],
    gmailDraftId: record.gmailDraftId || null,
    gmailDraftCreatedAt: record.gmailDraftCreatedAt || null,
    gmailDraftError: record.gmailDraftError ?? '',
    gmailDraftPreviewedAt: record.gmailDraftPreviewedAt || null,
    doNotContact: record.doNotContact === 'true',
    riskLevel: (record.riskLevel || 'medium') as Lead['riskLevel'],
    createdAt: record.createdAt ?? new Date().toISOString(),
    updatedAt: record.updatedAt ?? new Date().toISOString(),
  };
}

export async function loadLeadsFromCsv(filePath: string): Promise<Lead[]> {
  try {
    const raw = await readCsvFileAsUtf8(filePath);
    const trimmed = raw.trim();
    if (!trimmed) return [];

    const lines = trimmed.split(/\r?\n/).filter((line) => line.trim());
    if (lines.length === 0) return [];

    const headers = parseCsvLine(lines[0]).map((h) => h.trim());
    const leads: Lead[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = parseCsvLine(lines[i]);
      if (values.every((v) => !v.trim())) continue;
      leads.push(rowToLead(headers, values));
    }

    return leads;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
}

export async function saveLeadsToCsv(filePath: string, leads: Lead[]): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const headerLine = LEAD_CSV_HEADERS.join(',');
  const rows = leads.map((lead) =>
    LEAD_CSV_HEADERS.map((key) => escapeCsvField(serializeField(key, lead))).join(',')
  );
  const content = [headerLine, ...rows].join('\n') + (rows.length > 0 ? '\n' : '');
  await writeFile(filePath, content, 'utf-8');
}

export interface InputSitesLoadResult {
  rows: LeadInputRow[];
  encodingWarnings: string[];
}

export async function loadInputSitesCsv(filePath: string): Promise<InputSitesLoadResult> {
  try {
    const raw = await readCsvFileAsUtf8(filePath);
    const trimmed = raw.trim();
    if (!trimmed) return { rows: [], encodingWarnings: [] };

    const lines = trimmed.split(/\r?\n/).filter((line) => line.trim());
    if (lines.length <= 1) return { rows: [], encodingWarnings: [] };

    const headers = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
    const idx = {
      companyName: headers.indexOf('companyname'),
      area: headers.indexOf('area'),
      industry: headers.indexOf('industry'),
      websiteUrl: headers.indexOf('websiteurl'),
    };

    const rows: LeadInputRow[] = [];
    const encodingWarnings: string[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = parseCsvLine(lines[i]);
      if (values.every((v) => !v.trim())) continue;

      const row: LeadInputRow = {
        companyName: values[idx.companyName]?.trim() ?? '',
        area: values[idx.area]?.trim() ?? '',
        industry: values[idx.industry]?.trim() ?? '',
        websiteUrl: values[idx.websiteUrl]?.trim() ?? '',
      };

      encodingWarnings.push(...detectInputFieldMojibake(row));
      rows.push(row);
    }

    return { rows, encodingWarnings };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { rows: [], encodingWarnings: [] };
    }
    throw err;
  }
}
