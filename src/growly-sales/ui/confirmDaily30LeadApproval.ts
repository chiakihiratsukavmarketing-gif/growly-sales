import type { ExternalLeadCandidate } from '../adapters/externalLeadCandidateTypes.js';

/** Lead化承認前の人間確認（ブラウザ confirm） */
export function confirmDaily30LeadApproval(candidate: ExternalLeadCandidate): boolean {
  const email = candidate.emailCandidates?.[0] ?? '（メール未設定）';
  return window.confirm(
    [
      `「${candidate.companyName}」を Lead 化候補として承認しますか？`,
      '',
      `代表メール: ${email}`,
      '',
      '・この時点では leads.json に取り込みません',
      '・Gmail 下書き作成・送信は行いません',
      '・承認後はセクション2で GENERATE_DAILY_30_COPY を入力して営業文生成してください',
    ].join('\n')
  );
}
