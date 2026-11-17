// Dependency-free check of server.json against the official schema. Usage: node scripts/validate-server-json.mjs <schema.json>
import { readFileSync } from 'node:fs';
const schema = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const sj = JSON.parse(readFileSync('server.json', 'utf8'));
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const defs = schema.definitions;
const errs = [];
function check(obj, def, path) {
  const d = def.$ref ? defs[def.$ref.split('/').pop()] : def;
  if (d.allOf) { d.allOf.forEach((x) => check(obj, x, path)); return; }
  for (const r of d.required || []) if (!(r in obj)) errs.push(`${path}: missing ${r}`);
  for (const [k, v] of Object.entries(obj)) {
    const p = d.properties && d.properties[k];
    if (!p) { if (d.additionalProperties === false) errs.push(`${path}.${k}: unknown`); continue; }
    if (p.type === 'string' && typeof v !== 'string') errs.push(`${path}.${k}: not string`);
    if (p.type === 'boolean' && typeof v !== 'boolean') errs.push(`${path}.${k}: not boolean`);
    if (p.maxLength && v.length > p.maxLength) errs.push(`${path}.${k}: too long ${v.length}>${p.maxLength}`);
    if (p.pattern && !new RegExp(p.pattern).test(v)) errs.push(`${path}.${k}: pattern`);
    if (p.enum && !p.enum.includes(v)) errs.push(`${path}.${k}: enum`);
    if (p.$ref && typeof v === 'object' && !Array.isArray(v)) check(v, p, `${path}.${k}`);
    if (p.type === 'array' && p.items && p.items.$ref) v.forEach((it, i) => check(it, p.items, `${path}.${k}[${i}]`));
  }
}
check(sj, schema.definitions.ServerDetail, 'server.json');
const pk = sj.packages[0];
if (pk.transport.type !== 'stdio') errs.push('transport');
if (sj.name !== pkg.mcpName) errs.push('name != mcpName');
if (sj.version !== pkg.version || pk.version !== pkg.version) errs.push('version mismatch');
if (sj.$schema !== schema.$id) errs.push('$schema != schema $id');
console.log(errs.length ? errs.join('\n') : 'server.json OK against ' + schema.$id);
process.exit(errs.length ? 1 : 0);
