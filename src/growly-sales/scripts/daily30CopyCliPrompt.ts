import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import {
  GENERATE_DAILY_30_COPY_CONFIRM_TOKEN,
  GENERATE_DAILY_30_COPY_PROMPT,
} from './externalCandidateCliTokens.js';

export async function promptGenerateDaily30CopyConfirmation(): Promise<boolean> {
  const rl = readline.createInterface({ input, output });
  try {
    const answer = await rl.question(`${GENERATE_DAILY_30_COPY_PROMPT}\n> `);
    return answer.trim() === GENERATE_DAILY_30_COPY_CONFIRM_TOKEN;
  } finally {
    rl.close();
  }
}
