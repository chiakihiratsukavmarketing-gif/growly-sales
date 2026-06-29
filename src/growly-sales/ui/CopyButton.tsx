import { useState } from 'react';

interface CopyButtonProps {
  label: string;
  text: string;
  onError: (message: string) => void;
  onSuccess?: () => void;
  variant?: 'primary' | 'secondary';
}

export function CopyButton({
  label,
  text,
  onError,
  onSuccess,
  variant = 'secondary',
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy(): Promise<void> {
    if (!text.trim()) {
      onError('コピーする内容が空です');
      return;
    }

    try {
      if (!navigator.clipboard?.writeText) {
        onError('このブラウザではクリップボードAPIが利用できません');
        return;
      }
      await navigator.clipboard.writeText(text);
      setCopied(true);
      onSuccess?.();
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      onError(
        err instanceof Error
          ? `コピーに失敗しました: ${err.message}`
          : 'コピーに失敗しました。ブラウザの権限を確認してください。'
      );
    }
  }

  const className = variant === 'primary' ? 'btn btn-primary btn-copy' : 'btn btn-secondary btn-copy';

  return (
    <button type="button" className={className} onClick={() => void handleCopy()}>
      {copied ? 'コピー済み' : label}
    </button>
  );
}

/** sendStatus を変更しない — クリップボードへのテキストコピーのみ */
export function formatSubjectBodyCopy(
  emailSubject: string,
  emailBody: string,
  contactFormUrl: string | null,
  emailCandidates: string[]
): string {
  const contactUrl =
    contactFormUrl?.trim() || (emailCandidates.length > 0 ? emailCandidates.join('; ') : '');

  return [
    `件名：\n${emailSubject}`,
    '',
    `本文：\n${emailBody}`,
    '',
    `問い合わせURL：\n${contactUrl}`,
  ].join('\n');
}
