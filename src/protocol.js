// @ts-check
// JSON-RPC 2.0 handling of the Model Context Protocol, for any transport.
// Shared as is by the npm package (stdio) and the Otipi service (/mcp over HTTP): keep the copies the same.
import { explainError } from './errors.js';

export const SUPPORTED_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];

export const INSTRUCTIONS =
  'Otipi sends SMS, email and OTP codes to Israeli numbers. Use a free test key (sk_test_, https://otipi.co.il/signup). ' +
  'Test mode only really delivers to numbers the account owner confirmed: add_test_recipient, ask the human for the 6-digit code, ' +
  'confirm_test_recipient, then send_test_otp and verify_otp. Unconfirmed numbers are sandbox only (nothing arrives). ' +
  'Phone format: +9725XXXXXXXX. get_integration_snippet returns Next.js, Supabase and Express code and needs no key.';

/** @param {any} id @param {number} code @param {string} message */
export const rpcError = (id, code, message) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

/**
 * @param {{ tools: Array<{ name: string, description: string, inputSchema: object, run: (args: any) => Promise<string> }>, name: string, version: string, signupHelp?: string }} options
 * @returns {(msg: any) => Promise<object|null>} handles one parsed message; null when no response is due
 */
export function createHandler({ tools, name, version, signupHelp = '' }) {
  return async function handle(msg) {
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
            protocolVersion: SUPPORTED_VERSIONS.includes(asked) ? asked : SUPPORTED_VERSIONS[0],
            capabilities: { tools: {} },
            serverInfo: { name, version },
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
          result: { tools: tools.map(({ name: toolName, description, inputSchema }) => ({ name: toolName, description, inputSchema })) },
        };
      case 'tools/call': {
        const toolName = params && params.name;
        const tool = tools.find((t) => t.name === toolName);
        if (!tool) return rpcError(id, -32602, `Unknown tool: ${toolName}`);
        try {
          const text = await tool.run((params && params.arguments) || {});
          return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }] } };
        } catch (err) {
          return { jsonrpc: '2.0', id, result: { isError: true, content: [{ type: 'text', text: explainError(err, signupHelp) }] } };
        }
      }
      default:
        if (isNotification) return null; // notifications/initialized and other notifications
        return rpcError(id, -32601, `Method not found: ${method}`);
    }
  };
}
