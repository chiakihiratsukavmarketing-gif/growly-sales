import type { TargetProfile } from './targetProfile.js';

export const DEFAULT_TARGET_PROFILE_ID = 'housing';

/** ブラウザ/UI bundle 向け — Node fs 非依存 */
export function isTargetIndustry(industry: string, profile: TargetProfile): boolean {
  const normalized = industry.trim();
  if (!normalized) return false;
  return profile.industries.some((kw) => normalized.includes(kw) || kw.includes(normalized));
}

export function matchesTargetArea(area: string, profile: TargetProfile): boolean {
  const normalized = area.trim();
  if (!normalized) return false;
  return profile.defaultAreas.some((a) => normalized.includes(a) || a.includes(normalized));
}
