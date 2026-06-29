import type { Lead } from '../types/lead.js';
import type { OfferProfile } from '../config/offerProfile.js';
import {
  extractLeadSignals,
  extractUrlPath,
  extractAreaLabel,
  containsProhibitedPhrase,
  MECHANICAL_IMPRESSION_PHRASES,
} from './generationUtils.js';

export type HookSourceType =
  | 'case_study'
  | 'instagram'
  | 'recruit'
  | 'company_profile'
  | 'contact_form'
  | 'area_industry'
  | 'website'
  | 'sales_angle';

export interface CustomHookContext {
  offer?: OfferProfile;
}

export interface CustomHookResult {
  customHook: string;
  hookSourceType: HookSourceType;
  hookSourceUrl: string | null;
  customHookReason: string;
}

function hasDetailedCaseStudyPath(caseStudyUrl: string): boolean {
  const path = extractUrlPath(caseStudyUrl);
  return /\/works\/\d+/.test(path) || /\/detail/.test(path) || /\/gallery/.test(path);
}

function isCustomHouseCaseStudy(lead: Lead): boolean {
  const casePath = lead.caseStudyUrl ? extractUrlPath(lead.caseStudyUrl) : '';
  const contactPath = lead.contactFormUrl ? extractUrlPath(lead.contactFormUrl) : '';
  return (
    /custom|example|model/.test(casePath) ||
    /custom|request/.test(contactPath) ||
    /customhouse/.test(lead.websiteUrl.toLowerCase())
  );
}

function buildCaseStudyWithRecruitHook(lead: Lead): string {
  const area = extractAreaLabel(lead.area);
  if (area.includes('石巻')) {
    return `施工事例と採用ページを拝見し、${area}での家づくりと採用広報の両面でSNS活用の余地があると感じました。`;
  }
  return `施工事例と採用情報を拝見し、住まいの魅力と働く環境の双方を発信できる素材をお持ちだと感じました。`;
}

function buildCaseStudyWithProfileHook(lead: Lead): string {
  const area = extractAreaLabel(lead.area);
  if (area.includes('大崎')) {
    return `施工事例と会社概要を拝見し、${area}で地域に根ざした家づくりの姿勢が伝わる内容だと感じました。`;
  }
  return `施工事例と会社概要を拝見し、丁寧な家づくりの実績と理念がWeb上でも確認できると感じました。`;
}

function buildCustomHouseCaseStudyHook(lead: Lead): string {
  return 'カスタムハウスの施工事例ページを拝見し、ご家族ごとに異なる暮らしのイメージが伝わる内容だと感じました。';
}

function buildDetailedCaseStudyHook(lead: Lead): string {
  return '個別の施工事例紹介を拝見し、実際の作品を通じて工房のこだわりが伝わると感じました。';
}

function buildGenericCaseStudyHook(lead: Lead): string {
  const area = extractAreaLabel(lead.area);
  if (lead.salesAngle.includes('採用')) {
    return `施工事例ページを拝見し、${area}での家づくりの魅力が伝わる発信素材をお持ちだと感じました。`;
  }
  return '施工事例ページを拝見し、実際の住まいの雰囲気やこだわりが伝わる発信素材をお持ちだと感じました。';
}

function buildRecruitWithRegionalHook(lead: Lead): string {
  const area = extractAreaLabel(lead.area);
  return `${area}での家づくりへの取り組みや、会社の雰囲気・働く環境の魅力をSNSでも伝えやすい素材をお持ちだと感じました。`;
}

function buildRegionalSocialHook(lead: Lead): string {
  const area = extractAreaLabel(lead.area);
  if (lead.industry.includes('リフォーム')) {
    return `${area}でのリフォーム実績や施工の丁寧さが伝わる内容で、地域のお客様に魅力を届けやすい素材をお持ちだと感じました。`;
  }
  return `${area}での家づくりへの姿勢や、施工の雰囲気が伝わる発信素材をお持ちだと感じました。`;
}

function buildRecruitHook(lead: Lead): string {
  const area = extractAreaLabel(lead.area);
  return `採用情報を拝見し、${area}での家づくりと働く環境の魅力を、集客と採用の両面で伝えられる余地があると感じました。`;
}

function buildCompanyProfileHook(lead: Lead): string {
  const area = extractAreaLabel(lead.area);
  return `会社概要を拝見し、${area}で地域に根ざした家づくりの姿勢をより分かりやすく伝えられる余地があると感じました。`;
}

function buildContactFormHook(lead: Lead): string {
  const contactPath = lead.contactFormUrl ? extractUrlPath(lead.contactFormUrl) : '';
  if (/request|資料|相談/.test(contactPath)) {
    return '公式サイトの資料請求・相談導線を拝見し、SNSから無料相談や資料請求につなげる導線設計に改善余地があると感じました。';
  }
  return '公式サイトの問い合わせ導線を拝見し、SNSから無料相談や資料請求につなげる導線設計に改善余地があると感じました。';
}

function buildAreaIndustryHook(lead: Lead): string {
  const area = extractAreaLabel(lead.area);
  return `${area}で${lead.industry}として活動されている点を拝見し、公開情報をもとにSNS活用のヒントをお伝えできると感じました。`;
}

function buildSalesAngleHook(lead: Lead): string {
  return `${lead.salesAngle}の観点から、公開情報をもとに改善のヒントをお伝えできると感じました。`;
}

function buildWebsiteHook(lead: Lead): string {
  const area = extractAreaLabel(lead.area);
  return `公式サイトを拝見し、${area}での${lead.industry}としての取り組みをSNSでも伝えられる余地があると感じました。`;
}

interface HookCandidate {
  priority: number;
  sourceType: HookSourceType;
  sourceUrl: string | null;
  reason: string;
  build: () => string;
}

function collectHookCandidates(lead: Lead, signals: ReturnType<typeof extractLeadSignals>): HookCandidate[] {
  const candidates: HookCandidate[] = [];

  if (signals.hasCaseStudy && signals.hasRecruit) {
    candidates.push({
      priority: 1,
      sourceType: 'case_study',
      sourceUrl: lead.caseStudyUrl,
      reason: '施工事例と採用ページの両方が公開されている',
      build: () => buildCaseStudyWithRecruitHook(lead),
    });
  } else if (signals.hasCaseStudy && hasDetailedCaseStudyPath(lead.caseStudyUrl!)) {
    candidates.push({
      priority: 1,
      sourceType: 'case_study',
      sourceUrl: lead.caseStudyUrl,
      reason: '個別施工事例の詳細ページURLを検出',
      build: () => buildDetailedCaseStudyHook(lead),
    });
  } else if (signals.hasCaseStudy && isCustomHouseCaseStudy(lead)) {
    candidates.push({
      priority: 1,
      sourceType: 'case_study',
      sourceUrl: lead.caseStudyUrl,
      reason: 'カスタムハウス系の施工事例URLを検出',
      build: () => buildCustomHouseCaseStudyHook(lead),
    });
  } else if (signals.hasCaseStudy && lead.companyProfileUrl) {
    candidates.push({
      priority: 1,
      sourceType: 'company_profile',
      sourceUrl: lead.companyProfileUrl,
      reason: '施工事例と会社概要の両方が公開されている',
      build: () => buildCaseStudyWithProfileHook(lead),
    });
  } else if (signals.hasCaseStudy) {
    candidates.push({
      priority: 1,
      sourceType: 'case_study',
      sourceUrl: lead.caseStudyUrl,
      reason: '施工事例ページが公開されている',
      build: () => buildGenericCaseStudyHook(lead),
    });
  }

  if (signals.hasInstagram && signals.hasRecruit && !signals.hasCaseStudy) {
    candidates.push({
      priority: 2,
      sourceType: 'recruit',
      sourceUrl: lead.recruitUrl,
      reason: '採用情報と地域での家づくり姿勢を確認',
      build: () => buildRecruitWithRegionalHook(lead),
    });
  } else if (signals.hasInstagram) {
    candidates.push({
      priority: 2,
      sourceType: 'instagram',
      sourceUrl: lead.instagramUrl,
      reason: '地域・家づくりの発信素材を確認',
      build: () => buildRegionalSocialHook(lead),
    });
  }

  if (signals.hasRecruit) {
    candidates.push({
      priority: 3,
      sourceType: 'recruit',
      sourceUrl: lead.recruitUrl,
      reason: '採用ページが公開されている',
      build: () => buildRecruitHook(lead),
    });
  }

  if (lead.companyProfileUrl) {
    candidates.push({
      priority: 4,
      sourceType: 'company_profile',
      sourceUrl: lead.companyProfileUrl,
      reason: '会社概要ページが公開されている',
      build: () => buildCompanyProfileHook(lead),
    });
  }

  if (signals.hasContact) {
    candidates.push({
      priority: 5,
      sourceType: 'contact_form',
      sourceUrl: lead.contactFormUrl,
      reason: '問い合わせフォームまたは公開メール導線がある',
      build: () => buildContactFormHook(lead),
    });
  }

  candidates.push({
    priority: 6,
    sourceType: 'area_industry',
    sourceUrl: lead.websiteUrl,
    reason: '地域・業種情報をもとにフックを生成',
    build: () => buildAreaIndustryHook(lead),
  });

  if (lead.salesAngle.trim()) {
    candidates.push({
      priority: 9,
      sourceType: 'sales_angle',
      sourceUrl: null,
      reason: `営業切り口「${lead.salesAngle}」を参照`,
      build: () => buildSalesAngleHook(lead),
    });
  }

  if (signals.hasWebsite) {
    candidates.push({
      priority: 10,
      sourceType: 'website',
      sourceUrl: lead.websiteUrl,
      reason: '公式サイトURLを参照',
      build: () => buildWebsiteHook(lead),
    });
  }

  return candidates.sort((a, b) => a.priority - b.priority);
}

export function generateCustomHook(lead: Lead, _context?: CustomHookContext): CustomHookResult {
  const signals = extractLeadSignals(lead);
  const candidates = collectHookCandidates(lead, signals);
  const selected = candidates[0];

  const customHook = selected.build().trim();

  if (containsProhibitedPhrase(customHook, [...MECHANICAL_IMPRESSION_PHRASES])) {
    const fallback = buildAreaIndustryHook(lead);
    return {
      customHook: fallback,
      hookSourceType: 'area_industry',
      hookSourceUrl: lead.websiteUrl,
      customHookReason: '禁止表現回避のため地域・業種ベースにフォールバック',
    };
  }

  return {
    customHook,
    hookSourceType: selected.sourceType,
    hookSourceUrl: selected.sourceUrl,
    customHookReason: selected.reason,
  };
}
