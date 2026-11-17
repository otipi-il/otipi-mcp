#!/usr/bin/env node
// @ts-check
// Stdio entry point: newline-delimited JSON-RPC 2.0 on stdin/stdout. Logs go to stderr only.
import { createInterface } from 'node:readline';
import { handleMessage } from './server.js';

/** @param {unknown} obj */
function send(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
let pending = 0;
let closed = false;

rl.on('line', (line) => {
  const text = line.trim();
  if (!text) return;
  pending++;
  handleMessage(text)
    .then((out) => {
      if (out === null) return;
      for (const item of Array.isArray(out) ? out : [out]) send(item);
    })
    .catch((err) => {
      console.error('otipi-mcp: internal error:', err && err.message);
    })
    .finally(() => {
      pending--;
      if (closed && pending === 0) process.exit(0);
    });
});

rl.on('close', () => {
  closed = true;
  if (pending === 0) process.exit(0);
});

console.error('otipi-mcp: ready on stdio');
