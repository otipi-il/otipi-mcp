// @ts-check
// JSON-RPC 2.0 request handling for the MCP stdio transport.
import { readFileSync } from 'node:fs';
import { tools, explainError } from './tools.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
export const VERSION = pkg.version;

const SUPPORTED = ['2025-06-18', '2025-03-26', '2024-11-05'];

const INSTRUCTIONS =
  'Otipi sends SMS, email and OTP codes to Israeli numbers. Use a free test key (sk_test_, https://otipi.co.il/signup). ' +
  'Test mode only really delivers to numbers the account owner confirmed: add_test_recipient, ask the human for the 6-digit code, ' +
  'confirm_test_recipient, then send_test_otp and verify_otp. Unconfirmed numbers are sandbox only (nothing arrives). ' +
  'Phone format: +9725XXXXXXXX. get_integration_snippet returns Next.js, Supabase and Express code and needs no key.';

/** @param {any} id @param {number} code @param {string} message */
const rpcError = (id, code, message) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

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
  if (!msg || typeof msg !== 'object' || Array.isArray(msg) || typeof msg.method !== 'string') {
    return rpcError(msg && msg.id, -32600, 'Invalid Request');
  }
  const isNotification = msg.id === undefined || msg.id === null;
  const { id, method, params } = msg;

  switch (method) {
    case 'initialize': {
      const asked = params && params.protocolVersion;
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: SUPPORTED.includes(asked) ? asked : '2025-06-18',
          capabilities: { tools: {} },
          serverInfo: { name: 'otipi-mcp', version: VERSION },
          instructions: INSTRUCTIONS,
        },
      };
    }
    case 'ping':
      return isNotification ? null : { jsonrpc: '2.0', id, result: {} };
    case 'tools/list':
      return {
        jsonrpc: '2.0',
        id,
        result: { tools: tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) },
      };
    case 'tools/call': {
      const name = params && params.name;
      const tool = tools.find((t) => t.name === name);
      if (!tool) return rpcError(id, -32602, `Unknown tool: ${name}`);
      try {
        const text = await tool.run((params && params.arguments) || {});
        return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }] } };
      } catch (err) {
        return { jsonrpc: '2.0', id, result: { isError: true, content: [{ type: 'text', text: explainError(err) }] } };
      }
    }
    default:
      if (isNotification) return null; // notifications/initialized and other notifications
      return rpcError(id, -32601, `Method not found: ${method}`);
  }
}
