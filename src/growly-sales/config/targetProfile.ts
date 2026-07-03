import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getConfigRoot } from './paths.js';
import { DEFAULT_TARGET_PROFILE_ID } from './targetProfileRules.js';

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

export { DEFAULT_TARGET_PROFILE_ID } from './targetProfileRules.js';

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

export { isTargetIndustry, matchesTargetArea } from './targetProfileRules.js';
