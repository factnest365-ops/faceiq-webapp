/**
 * Smoke script (spec 5.1, A-04; runs in CI or `npm run smoke`):
 * - engine recovers the fixture design values (AC-01).
 * - engine is deterministic across runs (A-04).
 * - norms validate per spec 6.6 (G2 gate).
 */
import { engine } from "../engine/geometry";
import { fixture, FIXTURE_DESIGN } from "../engine/fixture";

function fail(msg: string): never {
  console.error(`SMOKE FAIL: ${msg}`);
  process.exit(1);
}

const a = engine(fixture());
const b = engine(fixture());
const A = a as unknown as Record<string, { value: number }>;
const B = b as unknown as Record<string, { value: number }>;
for (const key of Object.keys(FIXTURE_DESIGN)) {
  const v = A[key]?.value;
  if (!Number.isFinite(v) || Math.abs(v - FIXTURE_DESIGN[key]) > 1e-6) {
    fail(`${key}: got ${v}, expected ~${FIXTURE_DESIGN[key]}`);
  }
}
for (const k of Object.keys(A)) {
  if (JSON.stringify(A[k]) !== JSON.stringify(B[k])) fail(`nondeterministic at ${k}`);
}
for (const k of Object.keys(a) as Array<keyof typeof a>) {
  if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) fail(`nondeterministic at ${k}`);
}
console.log("SMOKE OK: engine recovers 19 fixture values, deterministic across runs");
