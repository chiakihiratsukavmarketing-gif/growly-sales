import type { MailOperationsTenant } from './tenantTypes.js';
import { buildUnsubscribeUrl } from './publicUrlResolver.js';

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

export interface UnsubscribeEmailFooterCopy {
  introLine: string;
  bodyParagraph: string;
  unsubscribeLabel: string;
  unsubscribeUrl: string;
  senderLine: string;
  contactLine: string | null;
  fullText: string;
}

const DEFAULT_TOKEN_PLACEHOLDER = '{token}';

export function buildUnsubscribeEmailFooterCopy(
  tenant: MailOperationsTenant,
  input: { tokenPlaceholder?: string } = {}
): UnsubscribeEmailFooterCopy {
  const displayName = tenant.displayName.trim() || tenant.legalName.trim();
  const senderName = tenant.legalName.trim() || displayName;
  const contactEmail = tenant.contactEmail.trim() || null;
  const tokenPlaceholder = input.tokenPlaceholder?.trim() || DEFAULT_TOKEN_PLACEHOLDER;
  const unsubscribeUrl = buildUnsubscribeUrl({ tenantId: tenant.tenantId, token: tokenPlaceholder });

  const introLine = `${displayName}からのご案内です。`;
  const bodyParagraph =
    '今後、弊社からの営業・ご案内メールが不要な場合は、\n以下のリンクから配信停止のお手続きをお願いいたします。';
  const unsubscribeLabel = '配信停止：';
  const senderLine = `送信者：${senderName}`;
  const contactLine = contactEmail ? `お問い合わせ：${contactEmail}` : null;

  const lines = [
    introLine,
    '',
    bodyParagraph,
    '',
    unsubscribeLabel,
    unsubscribeUrl,
    '',
    senderLine,
    contactLine,
  ].filter((line): line is string => line !== null);

  return {
    introLine,
    bodyParagraph,
    unsubscribeLabel,
    unsubscribeUrl,
    senderLine,
    contactLine,
    fullText: lines.join('\n'),
  };
}
