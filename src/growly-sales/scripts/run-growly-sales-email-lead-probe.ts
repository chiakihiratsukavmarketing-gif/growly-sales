import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { extractWebsiteContacts } from '../collectors/extractWebsiteContacts.js';
import { getGrowlySalesDataDir, getLeadsJsonPath } from '../config/paths.js';
import { loadLeadsFromJson, saveLeadsToJson } from '../storage/jsonLeadRepository.js';

export interface ManualEmailReviewEntry {
  companyName: string;
  websiteUrl: string;
  collectionStatus: 'failed' | 'needs_review';
  manualEmailCandidates: Array<{
    email: string;
    sourceUrl: string;
    note: string;
  }>;
  reason: string;
}

export interface EmailLeadProbeResult {
  companyName: string;
  websiteUrl: string;
  bucket: 'email_confirmed' | 'form_later' | 'failed_manual_review' | 'phone_or_unknown';
  emailCandidates: string[];
  emailCandidateSourceUrls: string[];
  contactFormUrl: string | null;
  collectionStatus: string;
  error?: string;
  note?: string;
}

const MANUAL_REVIEW_OVERRIDES: Array<{
  websiteHost: string;
  manualEmailCandidates: ManualEmailReviewEntry['manualEmailCandidates'];
  note: string;
}> = [
  {
    websiteHost: 'hinoken.co.jp',
    manualEmailCandidates: [
      {
        email: 'sato@hinoken.co.jp',
        sourceUrl: 'https://hinoken.co.jp/contact/',
        note: 'contactページ掲載メモ（サイト取得failed・手動確認候補。自動分類ではpersonal_likeのためemailCandidates未採用）',
      },
    ],
    note: 'サイト取得failed。contactページのメールは手動確認が必要',
  },
];

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

function classifyBucket(
  extraction: Awaited<ReturnType<typeof extractWebsiteContacts>>,
  manualOverride?: (typeof MANUAL_REVIEW_OVERRIDES)[number]
): EmailLeadProbeResult['bucket'] {
  if (manualOverride && extraction.collectionStatus === 'failed') {
    return 'failed_manual_review';
  }
  if (extraction.emailCandidates.length > 0) return 'email_confirmed';
  if (extraction.contactFormUrl) return 'form_later';
  if (extraction.collectionStatus === 'failed') return 'failed_manual_review';
  return 'phone_or_unknown';
}

async function applyHinokenManualReview(leads: Awaited<ReturnType<typeof loadLeadsFromJson>>): Promise<void> {
  const hinoken = leads.find((l) => hostOf(l.websiteUrl) === 'hinoken.co.jp');
  if (!hinoken) return;

  const memoLine =
    '【手動確認候補】sato@hinoken.co.jp（contactページ掲載メモ・サイト取得failed）';
  if (!hinoken.communicationMemo.includes('sato@hinoken.co.jp')) {
    hinoken.communicationMemo = hinoken.communicationMemo
      ? `${hinoken.communicationMemo}\n${memoLine}`
      : memoLine;
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const probeTargets: Array<{ companyName: string; websiteUrl: string }> = args.length > 0
    ? args.map((url) => ({ companyName: url, websiteUrl: url }))
    : [
        { companyName: 'サスティナライフ森の家', websiteUrl: 'https://www.sustainalife.co.jp/' },
        { companyName: '株式会社徳田工務店', websiteUrl: 'https://www.tokuta.jp/' },
        { companyName: '株式会社仙臺屋', websiteUrl: 'https://www.sendaiya1000.com/' },
        { companyName: 'ヒノケン株式会社', websiteUrl: 'https://hinoken.co.jp/' },
      ];

  const results: EmailLeadProbeResult[] = [];
  const manualReview: ManualEmailReviewEntry[] = [];

  for (const target of probeTargets) {
    const extraction = await extractWebsiteContacts(target.websiteUrl);
    const override = MANUAL_REVIEW_OVERRIDES.find(
      (o) => o.websiteHost === hostOf(target.websiteUrl)
    );
    const bucket = classifyBucket(extraction, override);

    const result: EmailLeadProbeResult = {
      companyName: target.companyName,
      websiteUrl: target.websiteUrl,
      bucket,
      emailCandidates: extraction.emailCandidates,
      emailCandidateSourceUrls: extraction.emailCandidateSourceUrls,
      contactFormUrl: extraction.contactFormUrl,
      collectionStatus: extraction.collectionStatus,
      error: extraction.error,
    };

    if (bucket === 'form_later') {
      result.note = 'フォームのみ（form_later）';
    }
    if (bucket === 'failed_manual_review' && override) {
      manualReview.push({
        companyName: target.companyName,
        websiteUrl: target.websiteUrl,
        collectionStatus: 'failed',
        manualEmailCandidates: override.manualEmailCandidates,
        reason: override.note,
      });
      result.note = override.note;
    } else if (bucket === 'failed_manual_review') {
      manualReview.push({
        companyName: target.companyName,
        websiteUrl: target.websiteUrl,
        collectionStatus: extraction.collectionStatus === 'needs_review' ? 'needs_review' : 'failed',
        manualEmailCandidates: [],
        reason: extraction.error ?? 'サイト取得失敗・メール未確認',
      });
    }

    results.push(result);
  }

  const auditPath = join(getGrowlySalesDataDir(), 'email-prospect-audit.json');
  const audit = {
    probedAt: new Date().toISOString(),
    results,
    manualReview,
    summary: {
      email_confirmed: results.filter((r) => r.bucket === 'email_confirmed').length,
      form_later: results.filter((r) => r.bucket === 'form_later').length,
      failed_manual_review: results.filter((r) => r.bucket === 'failed_manual_review').length,
      phone_or_unknown: results.filter((r) => r.bucket === 'phone_or_unknown').length,
    },
  };

  await writeFile(auditPath, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');

  const leads = await loadLeadsFromJson(getLeadsJsonPath());
  await applyHinokenManualReview(leads);
  await saveLeadsToJson(getLeadsJsonPath(), leads);

  console.log('Growly Sales — Email Lead Probe');
  console.log('================================');
  console.log(`監査ファイル: ${auditPath}`);
  console.log(`email_confirmed: ${audit.summary.email_confirmed}`);
  console.log(`form_later: ${audit.summary.form_later}`);
  console.log(`failed_manual_review: ${audit.summary.failed_manual_review}`);
  console.log('');

  for (const r of results) {
    console.log(`[${r.bucket}] ${r.companyName}`);
    if (r.emailCandidates.length > 0) {
      console.log(`  メール: ${r.emailCandidates.join(', ')}`);
      console.log(`  確認元: ${r.emailCandidateSourceUrls.join(', ')}`);
    }
    if (r.note) console.log(`  備考: ${r.note}`);
    if (r.error) console.log(`  エラー: ${r.error}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
