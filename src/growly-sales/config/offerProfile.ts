import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getConfigRoot } from './paths.js';

export interface OfferProfile {
  offerId: string;
  offerName: string;
  entryOffer: string;
  mainValue: string;
  targetGoals: string[];
  salesAngles: string[];
  ctaPattern: string;
  prohibitedClaims: string[];
  emailTone: string;
}

export const OFFER_PROFILE_REQUIRED_FIELDS: (keyof OfferProfile)[] = [
  'offerId',
  'offerName',
  'entryOffer',
  'mainValue',
  'targetGoals',
  'salesAngles',
  'ctaPattern',
  'prohibitedClaims',
  'emailTone',
];

export const DEFAULT_OFFER_PROFILE_ID = 'sns-operation';

export async function loadOfferProfile(offerId = DEFAULT_OFFER_PROFILE_ID): Promise<OfferProfile> {
  const filePath = join(getConfigRoot(), 'offers', `${offerId}.json`);
  const raw = await readFile(filePath, 'utf-8');
  const profile = JSON.parse(raw) as OfferProfile;

  for (const field of OFFER_PROFILE_REQUIRED_FIELDS) {
    if (profile[field] === undefined || profile[field] === null) {
      throw new Error(`Offer profile missing required field: ${field}`);
    }
    if (Array.isArray(profile[field]) && (profile[field] as unknown[]).length === 0) {
      throw new Error(`Offer profile field ${field} must not be empty`);
    }
    if (typeof profile[field] === 'string' && !(profile[field] as string).trim()) {
      throw new Error(`Offer profile field ${field} must not be empty`);
    }
  }

  return profile;
}

export function pickSalesAngleForIndustry(industry: string, offer: OfferProfile, hasRecruit: boolean): string {
  if (hasRecruit) {
    const recruitAngle = offer.salesAngles.find((a) => a.includes('採用'));
    if (recruitAngle) return recruitAngle;
    return 'SNS採用導線の改善';
  }

  if (industry.includes('工務店')) {
    return offer.salesAngles.find((a) => a.includes('子育て')) ?? offer.salesAngles[0];
  }
  if (industry.includes('注文住宅') || industry.includes('住宅')) {
    return offer.salesAngles.find((a) => a.includes('来場') || a.includes('施工事例')) ?? offer.salesAngles[1];
  }
  if (industry.includes('リフォーム')) {
    return offer.salesAngles.find((a) => a.includes('地域密着') || a.includes('事例')) ?? offer.salesAngles[3];
  }

  return offer.salesAngles.find((a) => a.includes('無料診断')) ?? offer.salesAngles[offer.salesAngles.length - 1];
}

export function containsProhibitedClaim(text: string, offer: OfferProfile): boolean {
  return offer.prohibitedClaims.some((claim) => text.includes(claim));
}
