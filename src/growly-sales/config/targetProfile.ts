import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getConfigRoot } from './paths.js';

export interface TargetProfile {
  targetId: string;
  targetName: string;
  industries: string[];
  defaultAreas: string[];
  searchKeywords: string[];
  highPrioritySignals: string[];
  mediumPrioritySignals: string[];
  lowPrioritySignals: string[];
  avoidTargets: string[];
  preferredContactMethods: string[];
  scoringNotes: string;
}

export const TARGET_PROFILE_REQUIRED_FIELDS: (keyof TargetProfile)[] = [
  'targetId',
  'targetName',
  'industries',
  'defaultAreas',
  'searchKeywords',
  'highPrioritySignals',
  'mediumPrioritySignals',
  'lowPrioritySignals',
  'avoidTargets',
  'preferredContactMethods',
  'scoringNotes',
];

export const DEFAULT_TARGET_PROFILE_ID = 'housing';

export async function loadTargetProfile(profileId = DEFAULT_TARGET_PROFILE_ID): Promise<TargetProfile> {
  const filePath = join(getConfigRoot(), 'targets', `${profileId}.json`);
  const raw = await readFile(filePath, 'utf-8');
  const profile = JSON.parse(raw) as TargetProfile;

  for (const field of TARGET_PROFILE_REQUIRED_FIELDS) {
    if (profile[field] === undefined || profile[field] === null) {
      throw new Error(`Target profile missing required field: ${field}`);
    }
    if (Array.isArray(profile[field]) && (profile[field] as unknown[]).length === 0) {
      throw new Error(`Target profile field ${field} must not be empty`);
    }
    if (typeof profile[field] === 'string' && !(profile[field] as string).trim()) {
      throw new Error(`Target profile field ${field} must not be empty`);
    }
  }

  return profile;
}

export function isTargetIndustry(industry: string, profile: TargetProfile): boolean {
  const normalized = industry.trim();
  if (!normalized) return false;
  return profile.industries.some((kw) => normalized.includes(kw) || kw.includes(normalized));
}

export function matchesTargetArea(area: string, profile: TargetProfile): boolean {
  const normalized = area.trim();
  if (!normalized) return false;
  return profile.defaultAreas.some((kw) => normalized.includes(kw) || kw.includes(normalized));
}
