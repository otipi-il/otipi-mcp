// @ts-check
// The npm package's side: the key comes from the environment, and each stdin line is one message.
import { readFileSync } from 'node:fs';
import { api, getKey } from './client.js';
import { createTools, STDIO_SIGNUP_HELP } from './tools.js';
import { createHandler, rpcError } from './protocol.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
export const VERSION = pkg.version;

const handle = createHandler({
  tools: createTools({ api, hasKey: () => Boolean(getKey()) }),
  name: 'otipi-mcp',
  version: VERSION,
  signupHelp: STDIO_SIGNUP_HELP,
});

/**
 * Handle one raw JSON line. Returns a response object, or null when no response is due.
 * @param {string} line
 * @returns {Promise<object|null>}
 */
export async function handleMessage(line) {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return rpcError(null, -32700, 'Parse error');
  }
  return handle(msg);
}
