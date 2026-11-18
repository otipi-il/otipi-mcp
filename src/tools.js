// @ts-check
// Tool definitions and handlers. Handlers return text; errors are thrown as ToolError.
// Shared as is by the npm package (stdio) and the Otipi service (/mcp over HTTP): keep the copies the same.
// The transport hands in { api, hasKey, signupHelp }: how to call the Otipi API with the caller's key.
import { ToolError, explainError } from './errors.js';
import { getSnippet } from './snippets.js';

export { ToolError };

export const STDIO_SIGNUP_HELP =
  'No Otipi API key found. Get a free test key at https://otipi.co.il/signup (it starts with sk_test_), ' +
  'then set it as the OTIPI_KEY environment variable in your MCP client config, for example: ' +
  '"env": { "OTIPI_KEY": "sk_test_..." }, and restart the client. ' +
  'Claude Code: claude mcp add otipi --env OTIPI_KEY=sk_test_... -- npx -y otipi-mcp';

const PHONE_DESC =
  'Israeli mobile number in E.164 format +9725XXXXXXXX (05XXXXXXXX is also accepted), or an email address for the email channel.';

/** @param {any} args @param {string} name @param {number} [max] */
function str(args, name, max) {
  const v = args && args[name];
  if (typeof v !== 'string' || !v.trim()) throw new ToolError(`Missing required argument "${name}" (non-empty string).`);
  if (max && v.length > max) throw new ToolError(`Argument "${name}" is too long (max ${max} characters).`);
  return v.trim();
}

/** @param {any} args @param {string} name @param {string[]} allowed @param {string} def */
function oneOf(args, name, allowed, def) {
  const v = args && args[name];
  if (v === undefined || v === null || v === '') return def;
  if (typeof v !== 'string' || !allowed.includes(v)) {
    throw new ToolError(`Argument "${name}" must be one of: ${allowed.join(', ')}.`);
  }
  return v;
}

/** @param {unknown} data */
const json = (data) => JSON.stringify(data, null, 2);

/**
 * @typedef {{ name: string, description: string, inputSchema: object, run: (args: any) => Promise<string>, offline?: boolean }} Tool
 */

/**
 * @param {{ api: (method: 'GET'|'POST', path: string, body?: object) => Promise<any>, hasKey: () => boolean, signupHelp?: string }} client
 * @returns {Tool[]}
 */
export function createTools({ api, hasKey, signupHelp = STDIO_SIGNUP_HELP }) {
  const requireKey = () => {
    if (!hasKey()) throw new ToolError(signupHelp);
  };
  const explain = (/** @type {unknown} */ err) => explainError(err, signupHelp);
  return [
  {
    name: 'send_test_otp',
    description:
      'Send a one-time verification code (OTP) by SMS or email to a phone number in Israel using Otipi, in test mode. ' +
      'Use this to try the login/2FA flow end to end. With a test key the message really arrives ONLY if the recipient was confirmed ' +
      'with add_test_recipient + confirm_test_recipient; otherwise it is kept in the sandbox log and nothing is delivered. ' +
      'The result says which case happened and includes test_code when available, so you can verify it with verify_otp. ' +
      'Each account has 5 free test SMS for life.',
    inputSchema: {
      type: 'object',
      properties: {
        to: { type: 'string', description: PHONE_DESC },
        app: { type: 'string', maxLength: 40, description: 'Brand name shown in the message, for example "MyApp". Max 40 characters.' },
        channel: { type: 'string', enum: ['sms', 'email'], default: 'sms', description: 'Delivery channel. Default sms.' },
        language: { type: 'string', enum: ['he', 'ar', 'ru', 'en'], default: 'he', description: 'Message language. Default he (Hebrew).' },
      },
      required: ['to', 'app'],
      additionalProperties: false,
    },
    async run(args) {
      requireKey();
      const to = str(args, 'to');
      const app = str(args, 'app', 40);
      const channel = oneOf(args, 'channel', ['sms', 'email'], 'sms');
      const language = oneOf(args, 'language', ['he', 'ar', 'ru', 'en'], 'he');
      const otp = await api('POST', '/otp/send', { to, app, channel, language });
      const lines = [`OTP request accepted (id ${otp.id}, channel ${otp.channel}, to ${otp.to}, expires ${otp.expires_at}).`];
      if (otp.test_code) lines.push(`test_code: ${otp.test_code} (pass it to verify_otp to complete the check).`);
      if (otp.message_id) {
        try {
          const msg = await api('GET', `/messages/${encodeURIComponent(otp.message_id)}`);
          if (msg.test_delivery === 'real') {
            lines.push('Delivery: REAL. The recipient is confirmed, so the code was actually sent to the device. Ask the human to read it.');
          } else if (msg.test_delivery === 'sandbox') {
            lines.push(
              'Delivery: SANDBOX. Nothing was delivered to a device; the message only exists in the Otipi log. Either this number is not a confirmed test recipient, or real test delivery for this channel is not switched on yet (list_test_recipients shows which). ' +
                'To receive real messages, call add_test_recipient with this number, ask the human for the 6-digit code they receive, then call confirm_test_recipient. ' +
                (otp.test_code ? 'You can still complete the flow now using the test_code above.' : '')
            );
          } else {
            lines.push(`Delivery status: ${msg.status}${msg.mode === 'live' ? ' (live mode)' : ''}.`);
          }
          lines.push(`message_id: ${otp.message_id} (use check_delivery_status for details).`);
        } catch (err) {
          lines.push(`message_id: ${otp.message_id}. Could not fetch delivery details: ${explain(err)}`);
        }
      }
      return lines.join('\n');
    },
  },
  {
    name: 'verify_otp',
    description:
      'Check a one-time code that was sent with send_test_otp (or the live API) for a phone number or email. ' +
      'Returns valid true/false and, when false, the reason (wrong_code, expired_or_missing, too_many_attempts).',
    inputSchema: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'The same recipient the code was sent to.' },
        code: { type: 'string', description: 'The code entered by the user.' },
      },
      required: ['to', 'code'],
      additionalProperties: false,
    },
    async run(args) {
      requireKey();
      const to = str(args, 'to');
      const code = str(args, 'code');
      const r = await api('POST', '/otp/verify', { to, code });
      if (r.valid) return 'Code is valid.';
      const why = {
        wrong_code: 'The code is wrong. Ask for the code again or send a new one.',
        expired_or_missing: 'The code expired or was never sent. Call send_test_otp to send a new code.',
        too_many_attempts: 'Too many wrong attempts. Wait a few minutes and send a new code.',
      };
      return `Code is NOT valid. Reason: ${r.reason}. ${/** @type {Record<string,string>} */ (why)[r.reason] || ''}`.trim();
    },
  },
  {
    name: 'add_test_recipient',
    description:
      'Start confirming a phone number or email as a test recipient. A 6-digit code is sent to it. Once confirmed, test messages to that ' +
      'recipient really arrive (otherwise test mode only logs them in a sandbox). Only add numbers or emails that belong to the account owner. ' +
      'Test key (sk_test_) only. After calling this, ask the human for the 6-digit code they received and call confirm_test_recipient.',
    inputSchema: {
      type: 'object',
      properties: { to: { type: 'string', description: PHONE_DESC } },
      required: ['to'],
      additionalProperties: false,
    },
    async run(args) {
      requireKey();
      const to = str(args, 'to');
      const r = await api('POST', '/test-recipients', { to });
      if (r.status === 'confirmed') return `${r.to} (${r.channel}) is already confirmed. You can call send_test_otp now.`;
      return (
        `A 6-digit confirmation code was sent to ${r.to} (${r.channel}). ` +
        'Ask the human to read the code on that device, then call confirm_test_recipient with the same "to" and the code.'
      );
    },
  },
  {
    name: 'confirm_test_recipient',
    description:
      'Finish confirming a test recipient with the 6-digit code the human received after add_test_recipient. ' +
      'On success, send_test_otp to this recipient is really delivered.',
    inputSchema: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'The same number or email passed to add_test_recipient.' },
        code: { type: 'string', description: 'The 6-digit code the human received.' },
      },
      required: ['to', 'code'],
      additionalProperties: false,
    },
    async run(args) {
      requireKey();
      const to = str(args, 'to');
      const code = str(args, 'code');
      const r = await api('POST', '/test-recipients/verify', { to, code });
      return `${r.to} is now a confirmed test recipient (status ${r.status}). Real test messages to it will arrive. Call send_test_otp next.`;
    },
  },
  {
    name: 'list_test_recipients',
    description:
      'List the confirmed and pending test recipients of this account and how many of the 5 free test SMS are left. ' +
      'Call it before send_test_otp to know whether a number will really receive messages.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    async run() {
      requireKey();
      const r = await api('GET', '/test-recipients');
      const rows = (r.data || []).map((/** @type {any} */ x) => `- ${x.to} (${x.channel}): ${x.status}`);
      const fs = r.free_sms;
      const rd = r.real_delivery;
      const off = rd ? ['sms', 'email'].filter((c) => rd[c] === false) : [];
      return [
        rows.length ? `Test recipients:\n${rows.join('\n')}` : 'No test recipients yet. Use add_test_recipient.',
        fs ? `Free test SMS: ${fs.left} left of ${fs.total} (used ${fs.used}).` : '',
        off.length ? `Real test delivery is not switched on yet for: ${off.join(', ')}. Messages of that channel stay in the sandbox; use test_code to finish the flow.` : '',
      ]
        .filter(Boolean)
        .join('\n');
    },
  },
  {
    name: 'check_delivery_status',
    description:
      'Look up a sent message by message_id (returned by send_test_otp) and report its status ' +
      '(queued, sent, delivered, opened, failed, bounced), whether test delivery was real or sandbox, and the event timeline.',
    inputSchema: {
      type: 'object',
      properties: { message_id: { type: 'string', description: 'The message id, as returned by send_test_otp.' } },
      required: ['message_id'],
      additionalProperties: false,
    },
    async run(args) {
      requireKey();
      const id = str(args, 'message_id');
      const m = await api('GET', `/messages/${encodeURIComponent(id)}`);
      const lines = [
        `Message ${m.id}: ${m.status} (channel ${m.channel}, mode ${m.mode}${m.test_delivery ? `, test delivery ${m.test_delivery}` : ''}).`,
        `To: ${m.to}${m.from ? `, from: ${m.from}` : ''}${m.segments ? `, segments: ${m.segments}` : ''}.`,
      ];
      if (m.error) lines.push(`Error: ${m.error}`);
      if (m.test_delivery === 'sandbox') lines.push('Sandbox: not delivered to a device. Confirm the recipient with add_test_recipient to receive real messages.');
      const times = ['created_at', 'sent_at', 'delivered_at', 'opened_at'].filter((k) => m[k]).map((k) => `${k}=${m[k]}`);
      if (times.length) lines.push(times.join(', '));
      if (Array.isArray(m.events) && m.events.length) {
        lines.push('Events:', ...m.events.map((/** @type {any} */ e) => `- ${e.at} ${e.type}${e.detail ? `: ${e.detail}` : ''}`));
      }
      return lines.join('\n');
    },
  },
  {
    name: 'get_integration_snippet',
    description:
      'Return ready-to-paste code for adding Otipi phone/OTP login to a project: Next.js App Router (API routes plus a client component), ' +
      'Supabase Auth (Send SMS hook setup plus client code) or Express. Works offline and does not need an API key. ' +
      'Use it when the user wants to integrate SMS verification or 2FA for Israeli numbers.',
    offline: true,
    inputSchema: {
      type: 'object',
      properties: {
        framework: { type: 'string', enum: ['nextjs', 'supabase', 'express'], description: 'Target framework.' },
        language: { type: 'string', enum: ['ts', 'js'], default: 'ts', description: 'Code language. Default ts.' },
      },
      required: ['framework'],
      additionalProperties: false,
    },
    async run(args) {
      const framework = oneOf(args, 'framework', ['nextjs', 'supabase', 'express'], '');
      if (!framework) throw new ToolError('Missing required argument "framework" (nextjs, supabase or express).');
      const language = oneOf(args, 'language', ['ts', 'js'], 'ts');
      return getSnippet(framework, language);
    },
  },
];
}
