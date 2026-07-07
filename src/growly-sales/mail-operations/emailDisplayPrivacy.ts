/**
 * Mask an email address for unsubscribe screens and other public-facing UI.
 * Examples: info@example.jp → in***@example.jp / a@example.jp → a***@example.jp
 *
 * Returns null for invalid input so callers can omit the field rather than show a raw address.
 */
export function maskEmailForDisplay(email: string): string | null {
  const trimmed = email.trim();
  if (!trimmed) return null;

  const at = trimmed.indexOf('@');
  if (at <= 0 || at !== trimmed.lastIndexOf('@') || at === trimmed.length - 1) {
    return null;
  }

  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  if (!local || !domain || /\s/.test(local) || /\s/.test(domain)) {
    return null;
  }

  const maskedLocal = local.length <= 1 ? `${local}***` : `${local.slice(0, 2)}***`;
  const masked = `${maskedLocal}@${domain}`;
  if (masked.toLowerCase() === trimmed.toLowerCase()) {
    return null;
  }
  return masked;
}

/** Fixture email for developer screen previews and verify only. */
export const UNSUBSCRIBE_SCREEN_PREVIEW_FIXTURE_EMAIL = 'info@example.jp';

export function maskEmailForDisplayFixture(): string {
  const masked = maskEmailForDisplay(UNSUBSCRIBE_SCREEN_PREVIEW_FIXTURE_EMAIL);
  return masked ?? 'in***@example.jp';
}
