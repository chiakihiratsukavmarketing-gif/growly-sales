/** 旧Gmail下書き照合（読取のみ） */
import { ensureProjectEnvLoaded } from '../config/env.js';
import { fetchGmailDraftRaw } from '../integrations/gmail/gmailDraftVerify.js';
import {
  bodyHasHeaderLeak,
  decodeMimeBody,
  decodeMimeEncodedWords,
  extractEmailAddress,
  parseMimeHeaders,
  splitMimeRaw,
} from '../integrations/gmail/gmailMimeUtils.js';

const draftId = process.argv[2];
if (!draftId) {
  console.error('Usage: npx tsx ... <draftId>');
  process.exit(1);
}

async function main(): Promise<void> {
  ensureProjectEnvLoaded();
  try {
    const raw = await fetchGmailDraftRaw(draftId);
    const { headersText, bodyText } = splitMimeRaw(raw);
    const h = parseMimeHeaders(headersText);
    const body = decodeMimeBody(bodyText, h).trim();
    console.log(`draftId: ${draftId}`);
    console.log(`From: ${decodeMimeEncodedWords(h.get('from') ?? '')}`);
    console.log(`Reply-To: ${extractEmailAddress(h.get('reply-to') ?? '')}`);
    console.log(`To: ${extractEmailAddress(h.get('to') ?? '')}`);
    console.log(`Subject: ${decodeMimeEncodedWords(h.get('subject') ?? '')}`);
    console.log(`Body start: ${body.slice(0, 80)}`);
    console.log(`Header leak: ${bodyHasHeaderLeak(body) ? 'yes' : 'no'}`);
  } catch (err) {
    console.log(`fetch failed: ${err instanceof Error ? err.message : err}`);
  }
}

main();
