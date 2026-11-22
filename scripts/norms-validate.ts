/**
 * Norm-set validation script (spec 6.6). Exit 0 when all norm sets validate.
 * Run: npm run norms-validate
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { NormValidationError, normSetHash, validateNormSet } from "../engine/norms";
import type { NormSet } from "../engine/norms";

const dataDir = path.join(import.meta.dirname, "..", "data");

async function main(): Promise<number> {
  const files = readdirSync(dataDir).filter((f) => f.endsWith(".json"));
  let failed = false;
  for (const f of files) {
    const ns = JSON.parse(readFileSync(path.join(dataDir, f), "utf8")) as NormSet;
    try {
      validateNormSet(ns);
      console.log(`OK   ${f} (hash ${normSetHash(ns)})`);
    } catch (e) {
      failed = true;
      console.error(`FAIL ${f}: ${e instanceof NormValidationError ? e.message : String(e)}`);
    }
  }
  if (files.length === 0) {
    console.error("no norm set files in data/");
    return 1;
  }
  return failed ? 1 : 0;
}

void main().then((code) => process.exit(code));
