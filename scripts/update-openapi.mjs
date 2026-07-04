// Refreshes spec/openapi.json from a RUNNING NombaOne API. The committed
// snapshot in the nombaone-turbo docs app is not used because it can lag the
// mounted router; the served spec is walked from the live Express stack and
// cannot drift from what the server actually enforces.
//
// Usage:
//   node scripts/update-openapi.mjs                          # local dev API
//   NOMBAONE_SPEC_ORIGIN=https://sandbox.api.nombaone.xyz \
//     node scripts/update-openapi.mjs                        # deployed sandbox
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const origin = process.env.NOMBAONE_SPEC_ORIGIN ?? 'http://localhost:8000';
const url = `${origin.replace(/\/$/, '')}/v1/openapi.json`;

const res = await fetch(url);
if (!res.ok) {
  console.error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  process.exit(1);
}
const spec = await res.json();

const root = fileURLToPath(new URL('..', import.meta.url));
writeFileSync(`${root}/spec/openapi.json`, `${JSON.stringify(spec, null, 2)}\n`);

const opCount = Object.values(spec.paths ?? {}).reduce(
  (n, item) => n + Object.keys(item).length,
  0
);
console.log(`spec/openapi.json updated from ${url} (${opCount} operations)`);
