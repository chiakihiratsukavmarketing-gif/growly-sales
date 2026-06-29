import { loadLeadsFromJson } from '../storage/jsonLeadRepository.js';
import { getLeadsJsonPath } from '../config/paths.js';
import { loadOfferProfile } from '../config/offerProfile.js';
import {
  buildEmailOutreachCandidateView,
  getGmailDraftExclusionReason,
  selectTopEmailOutreachCandidates,
} from '../outreach/outreachPolicy.js';

const LIMIT = Number(process.env.EMAIL_OUTREACH_LIMIT ?? '3');

function printCandidate(c: ReturnType<typeof buildEmailOutreachCandidateView>, index: number): void {
  console.log(`--- 候補 ${index} ---`);
  console.log(`会社名: ${c.companyName}`);
  console.log(`公式サイトURL: ${c.websiteUrl}`);
  console.log(`emailCandidates: ${c.emailCandidates.join(', ') || '（なし）'}`);
  if (c.emailCandidateSourceUrls.length > 0) {
    console.log(`メール確認元: ${c.emailCandidateSourceUrls.join(', ')}`);
  }
  console.log(`humanReviewStatus: ${c.humanReviewStatus}`);
  console.log(`sendStatus: ${c.sendStatus}`);
  console.log(`gmailDraftStatus: ${c.gmailDraftStatus}`);
  console.log(`replyStatus: ${c.replyStatus}`);
  console.log(`dealStatus: ${c.dealStatus}`);
  if (c.exclusionReason) {
    console.log(`除外理由: ${c.exclusionReason}`);
  }
  console.log(`推奨アクション: ${c.recommendedAction}`);
  console.log('');
}

async function main(): Promise<void> {
  const leads = await loadLeadsFromJson(getLeadsJsonPath());
  const offer = await loadOfferProfile();
  const candidates = selectTopEmailOutreachCandidates(leads, LIMIT, offer);
  const allViews = leads.map((lead) => buildEmailOutreachCandidateView(lead, offer));
  const withEmail = allViews.filter((v) => v.emailCandidates.length > 0);
  const excluded = allViews.filter((v) => v.exclusionReason !== null);

  console.log('Growly Sales — Email Outreach Candidates');
  console.log('========================================');
  console.log('方針: メール営業優先 / Gmail下書きのみ / 手動送信');
  console.log(`取得Lead数: ${leads.length}`);
  console.log(`メールありLead数: ${withEmail.length}`);
  console.log(`Gmail下書き作成候補: ${candidates.length}件`);
  console.log('');

  if (candidates.length === 0) {
    console.log('現時点で条件を満たすGmail下書き候補はありません。');
    console.log('');
  } else {
    candidates.forEach((c, i) => printCandidate(c, i + 1));
  }

  if (excluded.length > 0) {
    console.log('--- 除外Lead（参考） ---');
    for (const c of excluded) {
      console.log(`- ${c.companyName}: ${c.exclusionReason}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
