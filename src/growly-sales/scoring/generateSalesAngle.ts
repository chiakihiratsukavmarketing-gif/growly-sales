import type { Lead } from '../types/lead.js';
import type { OfferProfile } from '../config/offerProfile.js';
import type { TargetProfile } from '../config/targetProfile.js';
import { pickSalesAngleForIndustry } from '../config/offerProfile.js';
import { generateCompanyAnalysis } from '../generation/generateCompanyAnalysis.js';
import { generateCustomHook } from '../generation/generateCustomHook.js';
import { extractLeadSignals } from '../generation/generationUtils.js';
import { scoreLead } from './scoreLead.js';

export function generateSalesAngle(lead: Lead, offer?: OfferProfile): string {
  const signals = extractLeadSignals(lead);
  const industry = lead.industry.trim();

  if (offer) {
    return pickSalesAngleForIndustry(industry, offer, signals.hasRecruit);
  }

  if (signals.hasRecruit) {
    return 'SNS採用導線の改善 — 採用ページとInstagramの連携';
  }
  if (signals.hasReservationPath) {
    return '来場予約・資料請求につながる施工事例発信';
  }
  if (industry.includes('工務店')) {
    return '子育て世帯に選ばれるInstagram集客診断';
  }
  if (industry.includes('注文住宅') || industry.includes('住宅')) {
    return '来場予約・資料請求につながる施工事例発信';
  }
  if (industry.includes('リフォーム')) {
    return '地域密着型の事例投稿改善';
  }
  return 'Instagram/SNS運用代行の無料診断レポート';
}

/** Day1収集時の軽量スコアリング（メール生成は growly-sales:generate で実施） */
export function applyScoringToLead(
  lead: Lead,
  options?: { offer?: OfferProfile; target?: TargetProfile }
): Lead {
  const salesAngle = generateSalesAngle(lead, options?.offer);
  const companyAnalysis = generateCompanyAnalysis(lead, {
    salesAngle,
    offer: options?.offer,
    target: options?.target,
  });
  const hookResult = generateCustomHook(lead, { offer: options?.offer });
  const customHook = hookResult.customHook;
  const leadScore = scoreLead(
    { ...lead, salesAngle, companyAnalysis, customHook },
    options?.target
  );

  return {
    ...lead,
    salesAngle,
    companyAnalysis,
    customHook,
    hookSourceType: hookResult.hookSourceType,
    hookSourceUrl: hookResult.hookSourceUrl,
    customHookReason: hookResult.customHookReason,
    leadScore,
    updatedAt: new Date().toISOString(),
  };
}
