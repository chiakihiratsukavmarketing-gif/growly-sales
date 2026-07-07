import type { MailOperationsTenant } from './tenantTypes.js';
import { buildUnsubscribeUrl } from './publicUrlResolver.js';

export type UnsubscribeScreenState =
  | 'confirm'
  | 'completed'
  | 'already_unsubscribed'
  | 'invalid_or_expired'
  | 'temporary_error';

export interface UnsubscribeScreenStateCopy {
  state: UnsubscribeScreenState;
  title: string;
  message: string;
  confirmButtonLabel?: string;
  privacyNote?: string;
  contactLabel: string;
  contactEmail: string | null;
  privacyPolicyUrl: string | null;
}

export function buildUnsubscribeScreenStateCopy(
  tenant: MailOperationsTenant,
  state: UnsubscribeScreenState
): UnsubscribeScreenStateCopy {
  const displayName = tenant.displayName.trim() || tenant.legalName.trim();
  const contactEmail = tenant.contactEmail.trim() || null;
  const base = {
    contactLabel: 'お問い合わせ',
    contactEmail,
    privacyPolicyUrl: tenant.privacyPolicyUrl?.trim() || null,
  };

  switch (state) {
    case 'confirm':
      return {
        state,
        title: `${displayName}からのメール配信停止`,
        message: `今後、${displayName}からこのメールアドレス宛への営業・ご案内メールを停止します。`,
        confirmButtonLabel: '配信を停止する',
        privacyNote:
          '停止対象のメールアドレスは画面に完全には表示しません。解除リンクは提供しません。',
        ...base,
      };
    case 'completed':
      return {
        state,
        title: '配信を停止しました',
        message: '今後、このアドレス宛に営業・ご案内メールは送信しません。',
        ...base,
      };
    case 'already_unsubscribed':
      return {
        state,
        title: '既に配信停止済みです',
        message: 'このメールアドレスは既に配信停止の対象となっています。',
        ...base,
      };
    case 'invalid_or_expired':
      return {
        state,
        title: 'リンクが無効です',
        message:
          'この配信停止リンクは無効であるか、有効期限が切れています。お手数ですがお問い合わせください。',
        ...base,
      };
    case 'temporary_error':
      return {
        state,
        title: '一時的に処理できません',
        message:
          '現在、配信停止のお手続きを完了できません。しばらくしてから再度お試しいただくか、お問い合わせください。',
        ...base,
      };
  }
}

/** @deprecated Prefer buildUnsubscribeScreenStateCopy for state-specific copy. */
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
  const confirm = buildUnsubscribeScreenStateCopy(tenant, 'confirm');
  const completed = buildUnsubscribeScreenStateCopy(tenant, 'completed');
  return {
    title: confirm.title,
    confirmMessage: confirm.message,
    successMessage: completed.message,
    privacyNote: confirm.privacyNote ?? '',
    contactLabel: confirm.contactLabel,
    contactEmail: confirm.contactEmail,
    privacyPolicyUrl: confirm.privacyPolicyUrl,
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
