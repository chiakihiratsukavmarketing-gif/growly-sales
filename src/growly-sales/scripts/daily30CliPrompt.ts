import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { FETCH_DAILY_30_CONFIRM_TOKEN } from './externalCandidateCliTokens.js';
import { FETCH_DAILY_30_PROMPT } from './externalCandidateCliTokens.js';

export async function promptFetchDaily30Confirmation(): Promise<boolean> {
  const rl = readline.createInterface({ input, output });
  try {
    const answer = await rl.question(`${FETCH_DAILY_30_PROMPT}\n> `);
    return answer.trim() === FETCH_DAILY_30_CONFIRM_TOKEN;
  } finally {
    rl.close();
  }
}
