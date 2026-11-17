// @ts-check
// Offline integration snippets. No API calls, no key needed.

const PHONE_RE = String.raw`/^(\+9725\d{8}|05\d{8})$/`;

/** @param {boolean} ts */
function nextjs(ts) {
  const x = ts ? 'ts' : 'js';
  const xx = ts ? 'tsx' : 'jsx';
  const bang = ts ? '!' : '';
  const reqT = ts ? ': Request' : '';
  const anyT = ts ? ': any' : '';
  const strT = ts ? ': string' : '';
  const body = ts
    ? '(await req.json().catch(() => ({}))) as { to?: string; code?: string }'
    : 'await req.json().catch(() => ({}))';
  return String.raw`Next.js (App Router). Install the SDK and set the key (server only, never in a client component):

  npm install otipi

  # .env.local
  OTIPI_KEY=sk_test_...

// File: lib/otipi.${x}
import { Otipi } from 'otipi';

export const otipi = new Otipi(process.env.OTIPI_KEY${bang});

// File: app/api/otp/send/route.${x}
import { NextResponse } from 'next/server';
import { OtipiError } from 'otipi';
import { otipi } from '@/lib/otipi';

const PHONE_RE = ${PHONE_RE};

export async function POST(req${reqT}) {
  const { to } = ${body};
  if (!to || !PHONE_RE.test(to)) {
    return NextResponse.json({ error: 'invalid_phone' }, { status: 422 });
  }
  try {
    const otp = await otipi.otp.send({ to, app: 'MyApp' });
    return NextResponse.json({ id: otp.id, expiresAt: otp.expires_at });
  } catch (err${anyT}) {
    if (err instanceof OtipiError) {
      return NextResponse.json({ error: err.code }, { status: err.status });
    }
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}

// File: app/api/otp/verify/route.${x}
import { NextResponse } from 'next/server';
import { OtipiError } from 'otipi';
import { otipi } from '@/lib/otipi';

const PHONE_RE = ${PHONE_RE};

export async function POST(req${reqT}) {
  const { to, code } = ${body};
  if (!to || !PHONE_RE.test(to) || !code) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 422 });
  }
  try {
    const result = await otipi.otp.verify({ to, code });
    return NextResponse.json({ valid: result.valid, reason: result.reason ?? null });
  } catch (err${anyT}) {
    if (err instanceof OtipiError) {
      return NextResponse.json({ error: err.code }, { status: err.status });
    }
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}

// File: app/otp/page.${xx}
'use client';
import { useState } from 'react';

export default function OtpPage() {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState('');

  async function post(url${strT}, payload${ts ? ': object' : ''}) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return res.json();
  }

  async function sendCode() {
    const data = await post('/api/otp/send', { to: phone });
    if (data.error) return setMessage('Error: ' + data.error);
    setSent(true);
    setMessage('Code sent');
  }

  async function verifyCode() {
    const data = await post('/api/otp/verify', { to: phone, code });
    setMessage(data.valid ? 'Verified' : 'Wrong or expired code');
  }

  return (
    <main>
      <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+972501234567" />
      <button onClick={sendCode}>Send code</button>
      {sent && (
        <>
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Code" />
          <button onClick={verifyCode}>Verify</button>
        </>
      )}
      <p>{message}</p>
    </main>
  );
}
`;
}

function supabase() {
  return String.raw`Supabase Auth with Israeli SMS via Otipi (Send SMS hook).

1. Deploy the edge function from https://github.com/planetebatel-cloud/otipi-supabase

  supabase functions deploy otipi-sms-hook --no-verify-jwt
  supabase secrets set OTIPI_KEY=sk_test_... SEND_SMS_HOOK_SECRETS='v1,whsec_...'

2. Enable it in the Supabase Dashboard: Authentication > Hooks > Send SMS hook (HTTP), with URL

  https://<project-ref>.supabase.co/functions/v1/otipi-sms-hook

   Use the same whsec_ secret that you set in SEND_SMS_HOOK_SECRETS.

3. Client code (supabase-js):

// Request the code
const { error } = await supabase.auth.signInWithOtp({ phone: '+972501234567' });

// Verify the code the user received
const { data, error: verifyError } = await supabase.auth.verifyOtp({
  phone: '+972501234567',
  token: '123456',
  type: 'sms',
});

Test keys (sk_test_) only deliver to numbers confirmed via add_test_recipient; switch to sk_live_ for real users.
`;
}

/** @param {boolean} ts */
function express(ts) {
  const x = ts ? 'ts' : 'js';
  const bang = ts ? '!' : '';
  const reqT = ts ? ': Request' : '';
  const resT = ts ? ': Response' : '';
  const anyT = ts ? ': any' : '';
  const imp = ts ? "import express, { Request, Response } from 'express';" : "import express from 'express';";
  return String.raw`Express. Install and set the key:

  npm install express otipi
  export OTIPI_KEY=sk_test_...

// File: server.${x}
${imp}
import { Otipi, OtipiError } from 'otipi';

const otipi = new Otipi(process.env.OTIPI_KEY${bang});
const PHONE_RE = ${PHONE_RE};

const app = express();
app.use(express.json());

app.post('/otp/send', async (req${reqT}, res${resT}) => {
  const { to } = req.body ?? {};
  if (!to || !PHONE_RE.test(to)) return res.status(422).json({ error: 'invalid_phone' });
  try {
    const otp = await otipi.otp.send({ to, app: 'MyApp' });
    res.status(201).json({ id: otp.id, expiresAt: otp.expires_at });
  } catch (err${anyT}) {
    if (err instanceof OtipiError) return res.status(err.status).json({ error: err.code });
    res.status(500).json({ error: 'internal_error' });
  }
});

app.post('/otp/verify', async (req${reqT}, res${resT}) => {
  const { to, code } = req.body ?? {};
  if (!to || !PHONE_RE.test(to) || !code) return res.status(422).json({ error: 'invalid_input' });
  try {
    const result = await otipi.otp.verify({ to, code });
    res.json({ valid: result.valid, reason: result.reason ?? null });
  } catch (err${anyT}) {
    if (err instanceof OtipiError) return res.status(err.status).json({ error: err.code });
    res.status(500).json({ error: 'internal_error' });
  }
});

app.listen(3000);
`;
}

const SDK_NOTE = `
SDK reference (npm package "otipi"):
  new Otipi(apiKey, { baseUrl? })
  otipi.otp.send({ to, app, channel?, language?, length?, ttlMinutes? })
  otipi.otp.verify({ to, code })
  otipi.send({ channel, to, text | template + variables, subject?, from?, language? })
  otipi.messages.get(id)
Errors throw OtipiError with .status and .code.
`;

/**
 * @param {string} framework
 * @param {string} [language]
 * @returns {string}
 */
export function getSnippet(framework, language = 'ts') {
  const ts = language !== 'js';
  switch (framework) {
    case 'nextjs':
      return nextjs(ts) + SDK_NOTE;
    case 'supabase':
      return supabase();
    case 'express':
      return express(ts) + SDK_NOTE;
    default:
      throw new Error(`Unknown framework "${framework}". Use nextjs, supabase or express.`);
  }
}
