import { loadLeadsFromJson } from '../storage/jsonLeadRepository.js';
import { loadExternalCandidatesFromJson } from '../storage/externalCandidatesRepository.js';
import { getLeadsJsonPath } from '../config/paths.js';
import {
  auditCandidateCollection,
  formatCollectionProgress,
} from '../candidates/auditCandidateCollection.js';
import { CANDIDATE_COLLECTION_TARGET } from '../candidates/candidateCollectionConfig.js';

async function main(): Promise<void> {
  console.log('Growly Sales — Candidates Audit (Phase 21)');
  console.log('==========================================');

  const leads = await loadLeadsFromJson(getLeadsJsonPath());
  const external = await loadExternalCandidatesFromJson();
  const audit = auditCandidateCollection(leads, external);

  console.log('');
  for (const line of formatCollectionProgress(audit)) {
    console.log(line);
  }
  console.log('');
  console.log(`公式URLなし外部候補: ${audit.externalWithoutWebsite}`);
  console.log(`Lead重複キー: ${audit.duplicateKeysAmongLeads.length ? audit.duplicateKeysAmongLeads.join('; ') : 'なし'}`);
  console.log('');

  console.log('--- Lead一覧（連絡導線） ---');
  for (const row of audit.leadRows) {
    const email = row.emailCandidates.length ? row.emailCandidates.join(', ') : '—';
    console.log(`${row.companyName}`);
    console.log(`  officialSite: ${row.officialSiteUrl}`);
    console.log(`  sourceUrls: ${row.sourceUrls.join(', ') || '—'}`);
    console.log(`  contactForm: ${row.contactFormUrl ?? '—'}`);
    console.log(`  emailCandidates: ${email}`);
    console.log(`  contactPathType: ${row.contactPathType}`);
    console.log(`  duplicateKey: ${row.duplicateKey}`);
    console.log(`  review: ${row.humanReviewStatus} / gmail: ${row.gmailDraftStatus}`);
    console.log('');
  }

  if (audit.externalRows.length > 0) {
    console.log('--- 外部候補 ---');
    for (const row of audit.externalRows) {
      console.log(`${row.companyName} [${row.importStatus}]`);
      console.log(`  officialSite: ${row.officialSiteUrl ?? '—（要確認）'}`);
      console.log(`  sourceUrl: ${row.sourceUrl ?? '—'}`);
      console.log(`  duplicateKey: ${row.duplicateKey}`);
      if (row.duplicateReason) console.log(`  reason: ${row.duplicateReason}`);
      console.log('');
    }
  } else {
    console.log('外部候補プール: 0件（実fetch未実行または external-candidates.json なし）');
    console.log('');
  }

  const gap = CANDIDATE_COLLECTION_TARGET - audit.leadCount;
  if (gap > 0) {
    console.log(`→ ${gap}件不足。preview後、FETCH_CANDIDATES で fetch-candidates を実行してください。`);
  } else {
    console.log('→ Lead件数は目標30件に到達しています。');
  }

  console.log('');
  for (const note of audit.notes) {
    console.log(`※ ${note}`);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
