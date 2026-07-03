import type { OfferProfile } from './offerProfile.js';

/** ブラウザ/UI bundle 向け — Node fs 非依存 */
export function containsProhibitedClaim(text: string, offer: OfferProfile): boolean {
  return offer.prohibitedClaims.some((claim) => text.includes(claim));
}
