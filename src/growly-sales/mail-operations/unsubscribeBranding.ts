import type { MailOperationsTenant } from './tenantTypes.js';

export interface UnsubscribeScreenCopy {
  title: string;
  confirmMessage: string;
  successMessage: string;
  privacyNote: string;
  contactLabel: string;
  contactEmail: string | null;
  privacyPolicyUrl: string | null;
}

export function buildUnsubscribeScreenCopy(tenant: MailOperationsTenant): UnsubscribeScreenCopy {
  const displayName = tenant.displayName.trim() || tenant.legalName.trim();
  const contactEmail = tenant.contactEmail.trim() || null;
  return {
    title: `${displayName}からのメール配信停止`,
    confirmMessage: `今後、${displayName}からこのメールアドレス宛への営業・ご案内メールを停止します。`,
    successMessage: '配信を停止しました。今後、このアドレス宛に営業・ご案内メールは送信しません。',
    privacyNote:
      '停止対象のメールアドレスは画面に完全には表示しません。解除リンクは提供しません。',
    contactLabel: 'お問い合わせ',
    contactEmail,
    privacyPolicyUrl: tenant.privacyPolicyUrl?.trim() || null,
  };
}
