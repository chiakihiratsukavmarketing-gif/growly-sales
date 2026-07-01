import type { ExternalLeadCandidate } from '../adapters/externalLeadCandidateTypes.js';
import { DAILY_30_EXCLUDE_DEFAULT_REASON } from '../candidates/daily30ExcludeReasons.js';

/** 候補除外の confirm + 理由 prompt。キャンセル時は null */
export function confirmDaily30CandidateExclude(candidate: ExternalLeadCandidate): string | null {
  const ok = window.confirm(
    [
      'この候補をDaily 30候補から除外します。',
      '送信済み履歴や既存Leadは削除されません。',
      'よろしいですか？',
      '',
      `会社名: ${candidate.companyName}`,
    ].join('\n')
  );
  if (!ok) return null;

  const reason = window.prompt(
    '除外理由を入力してください（例: 既存Lead重複 / メール不正 / 対象外業種）',
    DAILY_30_EXCLUDE_DEFAULT_REASON
  );
  const trimmed = reason?.trim() ?? '';
  return trimmed || null;
}
