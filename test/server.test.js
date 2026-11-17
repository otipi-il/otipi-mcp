// @ts-check
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const ENTRY = fileURLToPath(new URL('../src/index.js', import.meta.url));

/** Messages the fake API serves, keyed by id. */
const messages = {
  msg_real: { id: 'msg_real', channel: 'sms', to: '+972501111111', status: 'delivered', mode: 'test', test_delivery: 'real', segments: 1, events: [{ type: 'sent', detail: '', at: 't1' }, { type: 'delivered', detail: 'dlr', at: 't2' }] },
  msg_sandbox: { id: 'msg_sandbox', channel: 'sms', to: '+972502222222', status: 'sent', mode: 'test', test_delivery: 'sandbox', segments: 1, events: [] },
};

let fake;
let baseUrl;
const seen = [];

before(async () => {
  fake = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const body = raw ? JSON.parse(raw) : null;
      seen.push({ method: req.method, url: req.url, auth: req.headers.authorization, body });
      const reply = (status, obj) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(obj));
      };
      const u = req.url ?? '';
      if (req.method === 'POST' && u === '/v1/otp/send') {
        if (body.to === '+972509999999') return reply(402, { error: { code: 'free_test_sms_used', message: 'used' } });
        const real = body.to === '+972501111111';
        return reply(201, { id: 'otp_1', status: 'pending', to: body.to, channel: body.channel, message_id: real ? 'msg_real' : 'msg_sandbox', expires_at: '2030-01-01T00:00:00Z', test_code: '123456' });
      }
      if (req.method === 'POST' && u === '/v1/otp/verify') {
        return reply(200, body.code === '123456' ? { valid: true } : { valid: false, reason: 'wrong_code' });
      }
      if (req.method === 'POST' && u === '/v1/test-recipients') {
        return reply(201, { id: 'tr_1', channel: 'sms', to: body.to, status: 'pending', code_sent: true, created_at: 'now', confirmed_at: null });
      }
      if (req.method === 'POST' && u === '/v1/test-recipients/verify') {
        if (body.code !== '654321') return reply(422, { error: { code: 'wrong_code', message: 'bad' } });
        return reply(200, { id: 'tr_1', channel: 'sms', to: body.to, status: 'confirmed' });
      }
      if (req.method === 'GET' && u === '/v1/test-recipients') {
        return reply(200, { data: [{ id: 'tr_1', channel: 'sms', to: '+972501111111', status: 'confirmed' }], free_sms: { total: 5, used: 2, left: 3 } });
      }
      const m = u.match(/^\/v1\/messages\/(.+)$/);
      if (req.method === 'GET' && m) {
        const found = messages[m[1]];
        return found ? reply(200, found) : reply(404, { error: { code: 'not_found', message: 'no such message' } });
      }
      reply(404, { error: { code: 'not_found', message: 'route' } });
    });
  });
  await new Promise((r) => fake.listen(0, '127.0.0.1', r));
  baseUrl = `http://127.0.0.1:${fake.address().port}`;
});

after(() => fake.close());

/** Spawn the server and return a tiny JSON-RPC driver. */
function start(env) {
  const childEnv = { ...process.env, OTIPI_BASE_URL: baseUrl };
  delete childEnv.OTIPI_KEY;
  delete childEnv.OTIPI_API_KEY;
  Object.assign(childEnv, env);
  const child = spawn(process.execPath, [ENTRY], { env: childEnv, stdio: ['pipe', 'pipe', 'pipe'] });
  const waiters = new Map();
  const stdoutLines = [];
  createInterface({ input: child.stdout }).on('line', (line) => {
    stdoutLines.push(line);
    const obj = JSON.parse(line); // every stdout line must be valid JSON
    const w = waiters.get(obj.id);
    if (w) {
      waiters.delete(obj.id);
      w(obj);
    }
  });
  let n = 0;
  return {
    stdoutLines,
    call(method, params) {
      const id = ++n;
      const p = new Promise((resolve, reject) => {
        waiters.set(id, resolve);
        setTimeout(() => reject(new Error(`timeout waiting for ${method}`)), 10000).unref();
      });
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
      return p;
    },
    notify(method) {
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method }) + '\n');
    },
    tool(name, args) {
      return this.call('tools/call', { name, arguments: args });
    },
    close() {
      child.stdin.end();
      return new Promise((r) => child.on('exit', r));
    },
  };
}

const text = (r) => r.result.content[0].text;

test('initialize, tools/list, ping, unknown method', async () => {
  const s = start({ OTIPI_KEY: 'sk_test_x' });
  const init = await s.call('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 't', version: '1' } });
  assert.equal(init.result.protocolVersion, '2025-03-26');
  assert.deepEqual(init.result.capabilities, { tools: {} });
  assert.equal(init.result.serverInfo.name, 'otipi-mcp');
  assert.ok(init.result.instructions.length > 20);
  s.notify('notifications/initialized');

  const init2 = await s.call('initialize', { protocolVersion: '1999-01-01' });
  assert.equal(init2.result.protocolVersion, '2025-06-18');

  assert.deepEqual((await s.call('ping')).result, {});

  const list = await s.call('tools/list');
  const names = list.result.tools.map((t) => t.name);
  assert.deepEqual(names, ['send_test_otp', 'verify_otp', 'add_test_recipient', 'confirm_test_recipient', 'list_test_recipients', 'check_delivery_status', 'get_integration_snippet']);
  for (const t of list.result.tools) {
    assert.equal(t.inputSchema.type, 'object');
    assert.ok(t.description.length > 30);
  }

  const bad = await s.call('resources/list');
  assert.equal(bad.error.code, -32601);

  await s.close();
  assert.ok(s.stdoutLines.length >= 5);
});

test('send_test_otp: real and sandbox delivery, auth header, error hint', async () => {
  const s = start({ OTIPI_KEY: 'sk_test_x' });
  await s.call('initialize', { protocolVersion: '2025-06-18' });

  const real = await s.tool('send_test_otp', { to: '+972501111111', app: 'MyApp' });
  assert.ok(!real.result.isError);
  assert.match(text(real), /Delivery: REAL/);
  assert.match(text(real), /test_code: 123456/);

  const sandbox = await s.tool('send_test_otp', { to: '+972502222222', app: 'MyApp', language: 'en' });
  assert.match(text(sandbox), /Delivery: SANDBOX/);
  assert.match(text(sandbox), /add_test_recipient/);

  const sendCall = seen.findLast((x) => x.url === '/v1/otp/send');
  assert.equal(sendCall.auth, 'Bearer sk_test_x');
  assert.deepEqual(sendCall.body, { to: '+972502222222', app: 'MyApp', channel: 'sms', language: 'en' });

  const used = await s.tool('send_test_otp', { to: '+972509999999', app: 'MyApp' });
  assert.equal(used.result.isError, true);
  assert.match(text(used), /free_test_sms_used/);

  const missing = await s.tool('send_test_otp', { to: '+972501111111' });
  assert.equal(missing.result.isError, true);
  assert.match(text(missing), /app/);

  await s.close();
});

test('verify_otp valid and invalid', async () => {
  const s = start({ OTIPI_KEY: 'sk_test_x' });
  await s.call('initialize', {});
  assert.match(text(await s.tool('verify_otp', { to: '+972501111111', code: '123456' })), /valid\./);
  const bad = await s.tool('verify_otp', { to: '+972501111111', code: '000000' });
  assert.match(text(bad), /NOT valid.*wrong_code/);
  await s.close();
});

test('add and confirm test recipient, list', async () => {
  const s = start({ OTIPI_KEY: 'sk_test_x' });
  await s.call('initialize', {});
  const add = await s.tool('add_test_recipient', { to: '+972501111111' });
  assert.match(text(add), /6-digit/);
  assert.match(text(add), /confirm_test_recipient/);

  const wrong = await s.tool('confirm_test_recipient', { to: '+972501111111', code: '111111' });
  assert.equal(wrong.result.isError, true);
  assert.match(text(wrong), /wrong_code/);

  const ok = await s.tool('confirm_test_recipient', { to: '+972501111111', code: '654321' });
  assert.match(text(ok), /confirmed/);

  const list = await s.tool('list_test_recipients', {});
  assert.match(text(list), /\+972501111111/);
  assert.match(text(list), /3 left of 5/);
  await s.close();
});

test('check_delivery_status', async () => {
  const s = start({ OTIPI_KEY: 'sk_test_x' });
  await s.call('initialize', {});
  const ok = await s.tool('check_delivery_status', { message_id: 'msg_real' });
  assert.match(text(ok), /delivered/);
  assert.match(text(ok), /Events:/);
  const nf = await s.tool('check_delivery_status', { message_id: 'nope' });
  assert.equal(nf.result.isError, true);
  assert.match(text(nf), /not_found/);
  await s.close();
});

test('get_integration_snippet works without a key for all frameworks', async () => {
  const s = start({});
  await s.call('initialize', {});

  const next = text(await s.tool('get_integration_snippet', { framework: 'nextjs' }));
  assert.match(next, /app\/api\/otp\/send\/route\.ts/);
  assert.match(next, /app\/api\/otp\/verify\/route\.ts/);
  assert.match(next, /import \{ Otipi \} from 'otipi'/);
  assert.match(next, /new Otipi\(process\.env\.OTIPI_KEY!\)/);
  assert.match(next, /otipi\.otp\.send\(\{ to, app: 'MyApp' \}\)/);
  assert.match(next, /OtipiError/);
  assert.match(next, /\^\(\\\+9725\\d\{8\}\|05\\d\{8\}\)\$/);
  assert.match(next, /'use client'/);

  const nextJs = text(await s.tool('get_integration_snippet', { framework: 'nextjs', language: 'js' }));
  assert.match(nextJs, /route\.js/);
  assert.doesNotMatch(nextJs, /OTIPI_KEY!/);

  const sup = text(await s.tool('get_integration_snippet', { framework: 'supabase' }));
  assert.match(sup, /supabase functions deploy otipi-sms-hook --no-verify-jwt/);
  assert.match(sup, /signInWithOtp/);
  assert.match(sup, /verifyOtp/);
  assert.match(sup, /planetebatel-cloud\/otipi-supabase/);

  const exp = text(await s.tool('get_integration_snippet', { framework: 'express' }));
  assert.match(exp, /app\.post\('\/otp\/send'/);
  assert.match(exp, /app\.post\('\/otp\/verify'/);

  for (const snippet of [next, nextJs, sup, exp]) {
    assert.doesNotMatch(snippet, /\u2014|\u2013/);
  }

  const bad = await s.tool('get_integration_snippet', { framework: 'rails' });
  assert.equal(bad.result.isError, true);
  await s.close();
});

test('missing key returns isError with setup help and never leaks key', async () => {
  const s = start({});
  await s.call('initialize', {});
  const r = await s.tool('send_test_otp', { to: '+972501111111', app: 'MyApp' });
  assert.equal(r.result.isError, true);
  assert.match(text(r), /https:\/\/otipi\.co\.il\/signup/);
  assert.match(text(r), /OTIPI_KEY/);
  await s.close();

  const k = start({ OTIPI_API_KEY: 'sk_test_fallback' });
  await k.call('initialize', {});
  await k.tool('verify_otp', { to: '+972501111111', code: '123456' });
  assert.equal(seen.findLast((x) => x.url === '/v1/otp/verify').auth, 'Bearer sk_test_fallback');
  await k.close();
});
