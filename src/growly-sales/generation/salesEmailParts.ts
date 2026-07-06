import { getOutreachSignatureEmail } from '../config/env.js';

/** 標準テンプレート署名（改行詰め・Email は OUTREACH_SIGNATURE_EMAIL で変更可） */
export function buildSalesEmailSignature(signatureEmail?: string): string {
  const email = signatureEmail ?? getOutreachSignatureEmail();
  return [
    '====================',
    '合同会社Want Reach',
    '平塚千明 / Chiaki Hiratsuka',
    '〒983-0005',
    '宮城県仙台市宮城野区福室7-12-8',
    'TEL：070-9090-7155',
    `Email：${email}`,
    'URL：https://wantreach.jp/',
    '=========================',
  ].join('\n');
}

export const DISCLAIMER_LINE =
  '売上や問い合わせ数を保証するものではなく、公開情報をもとに改善のヒントをお伝えする内容です。';

/** customHook からメール本文用の印象文（「と感じました。」で終わる1文）を抽出 */
export function extractImpressionTailForEmail(customHook: string): string {
  const hook = customHook.trim();
  const browseMatch = hook.match(/^[^。]+を拝見し、(.+)$/);
  if (browseMatch?.[1]) {
    const tail = browseMatch[1].trim();
    if (tail.length >= 10) {
      return tail.endsWith('。') ? tail : `${tail}。`;
    }
  }
  return hook.endsWith('。') ? hook : `${hook}。`;
}

export function buildSalesEmailSubject(companyName: string): string {
  return `${companyName}様向け｜SNS無料診断レポートのご案内`;
}

export function buildCtaLine(companyName: string): string {
  return [
    `もしご興味がございましたら、「希望」とだけご返信いただけましたら、${companyName}様向けに簡単な診断レポートを作成いたします。`,
    '無理なご案内やしつこい営業はいたしませんので、ご安心ください。',
  ].join('\n');
}
