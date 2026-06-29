import { getLeadsJsonPath } from '../config/paths.js';
import { loadOfferProfile } from '../config/offerProfile.js';
import { buildSalesEmailSignature } from '../generation/generateSalesEmail.js';
import { MECHANICAL_IMPRESSION_PHRASES } from '../generation/generationUtils.js';
import { buildGmailDraftMessage, pickGmailToAddress } from '../integrations/gmail/buildGmailDraftMessage.js';
import { getGmailDraftExclusionReason } from '../outreach/outreachPolicy.js';
import { loadLeadsFromJson } from '../storage/jsonLeadRepository.js';
import type { Lead } from '../types/lead.js';

const TARGET_COMPANIES = [
  '株式会社菅誠建設工業',
  '株式会社徳田工務店',
  '株式会社仙臺屋',
] as const;

const RESERVE_COMPANY = 'サスティナライフ森の家';

const BANNED_BODY_PHRASES = [
  'メールアドレスが掲載',
  'プライバシーポリシー',
  '確認元',
  'メール確認',
  '掲載されていた',
  'Instagram公式プロフィールが公開',
] as const;

function summarizeBody(body: string): string {
  const lines = body.split('\n').map((l) => l.trim()).filter(Boolean);
  const skipSignature = lines.findIndex((l) => l.startsWith('===='));
  const main = skipSignature >= 0 ? lines.slice(0, skipSignature) : lines;
  return main.slice(0, 8).join(' / ');
}

function checkCompanyNameConsistency(lead: Lead, body: string, allNames: string[]): string[] {
  const issues: string[] = [];
  for (const other of allNames) {
    if (other !== lead.companyName && body.includes(other)) {
      issues.push(`他社名が本文に含まれる: ${other}`);
    }
  }
  const count = (body.match(new RegExp(lead.companyName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) ?? []).length;
  if (count < 2) {
    issues.push(`会社名の出現回数が少ない（${count}回）`);
  }
  return issues;
}

function checkUrlsInBody(lead: Lead, body: string): string[] {
  const issues: string[] = [];
  const urlPattern = /https?:\/\/[^\s]+/gi;
  const urls = body.match(urlPattern) ?? [];
  for (const url of urls) {
    if (!url.includes('wantreach.jp')) {
      issues.push(`本文に外部URL: ${url}`);
    }
  }
  if (lead.contactFormUrl && body.includes(lead.contactFormUrl)) {
    issues.push(`問い合わせフォームURLが本文に含まれる: ${lead.contactFormUrl}`);
  }
  for (const src of lead.emailCandidateSourceUrls) {
    if (body.includes(src)) {
      issues.push(`メール確認元URLが本文に含まれる: ${src}`);
    }
  }
  return issues;
}

function printLeadPreview(lead: Lead, offer: Awaited<ReturnType<typeof loadOfferProfile>>, allNames: string[]): void {
  const message = buildGmailDraftMessage(lead);
  const exclusion = getGmailDraftExclusionReason(lead, offer);
  const to = pickGmailToAddress(lead) ?? '（なし）';

  const checks: Array<{ label: string; ok: boolean; detail?: string }> = [];
  checks.push({ label: 'Gmail下書き除外条件', ok: exclusion === null, detail: exclusion ?? '該当なし' });
  checks.push({
    label: '件名フォーマット',
    ok: message.subject === `${lead.companyName}様向け｜SNS無料診断レポートのご案内`,
    detail: message.subject,
  });
  checks.push({
    label: 'Want Reach正式署名',
    ok: message.body.trimEnd().endsWith(buildSalesEmailSignature().trim()),
  });
  checks.push({
    label: 'CTA「希望」返信',
    ok: message.body.includes('「希望」とだけご返信'),
  });
  checks.push({
    label: '機械的印象表現なし',
    ok: !MECHANICAL_IMPRESSION_PHRASES.some((p) => message.body.includes(p)),
  });
  checks.push({
    label: '禁止フレーズなし',
    ok: !BANNED_BODY_PHRASES.some((p) => message.body.includes(p)),
  });

  const nameIssues = checkCompanyNameConsistency(lead, message.body, allNames);
  checks.push({ label: '会社名混在なし', ok: nameIssues.length === 0, detail: nameIssues.join('; ') || undefined });

  const urlIssues = checkUrlsInBody(lead, message.body);
  checks.push({ label: 'フォームURL・確認元URLなし', ok: urlIssues.length === 0, detail: urlIssues.join('; ') || undefined });

  const impressionInBody = message.body.includes(lead.customHook.replace(/^[^。]+を拝見し、/, '').replace(/。$/, ''))
    || message.body.includes(lead.customHook.split('、').slice(1).join('、').replace(/。$/, ''));

  console.log('─'.repeat(60));
  console.log(`【${lead.companyName}】`);
  console.log(`Lead ID: ${lead.id}`);
  console.log(`地域: ${lead.area}`);
  console.log(`公式サイトURL: ${lead.websiteUrl}`);
  console.log(`宛先メール: ${to}`);
  console.log(`メール確認元URL: ${lead.emailCandidateSourceUrls.join(', ') || '（なし）'}`);
  console.log(`件名: ${message.subject}`);
  console.log(`customHook: ${lead.customHook}`);
  console.log(`customHookReason: ${lead.customHookReason}`);
  console.log(`本文要約: ${summarizeBody(message.body)}`);
  console.log(`humanReviewStatus: ${lead.humanReviewStatus}`);
  console.log(`sendStatus: ${lead.sendStatus}`);
  console.log(`gmailDraftStatus: ${lead.gmailDraftStatus}`);
  console.log(`replyStatus: ${lead.replyStatus}`);
  console.log(`dealStatus: ${lead.dealStatus}`);
  console.log(`reviewStatus: ${lead.reviewStatus}`);
  console.log('');
  console.log('公開情報（Lead保持）:');
  console.log(`  Instagram: ${lead.instagramUrl ?? 'なし'}`);
  console.log(`  施工事例: ${lead.caseStudyUrl ?? 'なし'}`);
  console.log(`  会社概要: ${lead.companyProfileUrl ?? 'なし'}`);
  console.log(`  採用: ${lead.recruitUrl ?? 'なし'}`);
  console.log(`  問合フォーム: ${lead.contactFormUrl ?? 'なし'}（本文には含めない）`);
  console.log('');
  console.log('品質チェック:');
  for (const c of checks) {
    console.log(`  ${c.ok ? '✓' : '✗'} ${c.label}${c.detail ? ` — ${c.detail}` : ''}`);
  }
  if (!impressionInBody) {
    console.log('  ※ customHookの印象内容が本文印象行に反映されているか要目視');
  }
  console.log('');
  console.log('--- 本文全文 ---');
  console.log(message.body);
  console.log('');
}

async function main(): Promise<void> {
  console.log('Growly Sales — Gmail Draft Preview (3社指定・dry-run)');
  console.log('====================================================');
  console.log('※ Gmail API未接続 / 下書き未作成 / 送信なし / sendStatus・gmailDraftStatusは変更しません');
  console.log(`予備候補（今回対象外）: ${RESERVE_COMPANY}`);
  console.log('');

  const leads = await loadLeadsFromJson(getLeadsJsonPath());
  const offer = await loadOfferProfile();
  const allNames = leads.map((l) => l.companyName);

  let allOk = true;
  for (const companyName of TARGET_COMPANIES) {
    const lead = leads.find((l) => l.companyName === companyName);
    if (!lead) {
      console.log(`ERROR: Lead not found: ${companyName}`);
      allOk = false;
      continue;
    }
    printLeadPreview(lead, offer, allNames);
    const exclusion = getGmailDraftExclusionReason(lead, offer);
    if (exclusion !== null) allOk = false;
  }

  console.log('─'.repeat(60));
  if (allOk) {
    console.log('総合: 3社とも Gmail下書き作成候補として除外条件に該当しません。');
    console.log('preview確認後、問題なければ CREATE_DRAFTS を入力して下書き作成してください。');
  } else {
    console.log('総合: 除外またはチェック不合格あり。CREATE_DRAFTS前に修正が必要です。');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
