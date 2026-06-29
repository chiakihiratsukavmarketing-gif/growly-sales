import { classifyEmailCandidate } from '../collectors/classifyEmailCandidate.js';
import { isAllowedCorporateEmail } from '../safety/contactPolicy.js';

/** 公開代表・問い合わせメールを優先して選ぶ（個人メールは除外） */
export function pickDaily30TargetEmail(emailCandidates: string[]): string | null {
  for (const raw of emailCandidates) {
    const email = raw.trim().toLowerCase();
    if (!email) continue;
    const classified = classifyEmailCandidate(email, '', 'visible');
    if (!classified.rejected && isAllowedCorporateEmail(email)) {
      return email;
    }
  }
  return null;
}
