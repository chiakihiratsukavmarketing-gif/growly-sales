/**
 * 営業メール送信元設定と Gmail sendAs の確認（下書き作成なし）。
 */
import { ensureProjectEnvLoaded } from '../config/env.js';
import { GmailAuthNotConfiguredError, isGmailConfigured } from '../integrations/gmail/gmailAuth.js';
import { validateOutreachEmailConfig } from '../integrations/gmail/validateOutreachEmailConfig.js';
import { GmailFetchDiagnosticError } from '../integrations/gmail/gmailFetchDiagnostics.js';

async function main(): Promise<void> {
  ensureProjectEnvLoaded();

  if (!(await isGmailConfigured())) {
    throw new GmailAuthNotConfiguredError();
  }

  try {
    const report = await validateOutreachEmailConfig();

    console.log('Growly Sales — Outreach Email Config Check');
    console.log('==========================================');
    console.log(`OUTREACH_FROM_EMAIL:     ${report.fromEmail}`);
    console.log(`OUTREACH_REPLY_TO_EMAIL: ${report.replyToEmail}`);
    console.log(`OUTREACH_SIGNATURE_EMAIL:${report.signatureEmail}`);
    console.log('');
    console.log(
      `Gmail sendAs (${report.fromEmail}): ${report.sendAsAvailable ? '利用可能' : '利用不可'}`
    );
    console.log('');
    console.log('利用可能な sendAs 一覧:');
    if (report.availableSendAs.length === 0) {
      console.log('  (なし — settings.sendAs の取得結果が空)');
    } else {
      for (const alias of report.availableSendAs) {
        const usable = alias.isPrimary || alias.verificationStatus === 'accepted' ? 'OK' : 'pending';
        console.log(
          `  - ${alias.sendAsEmail} [${usable}] primary=${alias.isPrimary} verification=${alias.verificationStatus}`
        );
      }
    }

    if (!report.sendAsAvailable) {
      console.log('');
      console.log('下書き作成は停止状態です。sendAs に OUTREACH_FROM_EMAIL を追加するか、.env を修正してください。');
      process.exit(1);
    }
  } catch (err) {
    if (err instanceof GmailFetchDiagnosticError) {
      console.error('Gmail API エラー:', err.message);
      console.error('');
      console.error(
        'settings.sendAs にアクセスできません。gmail.settings.basic スコープで OAuth 再認証が必要な場合があります:'
      );
      console.error('  npm run growly-sales:gmail-oauth-helper');
      process.exit(1);
    }
    throw err;
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
