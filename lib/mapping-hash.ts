import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import mapping from "../engine/mapping.json";

export const MAPPING_VERSION = (mapping as { version: string }).version;

/** Frozen landmark index mapping (spec R-19): hash of mapping.json for scan pinning. */
export function mappingHashSync(): string {
  const s = JSON.stringify(mapping);
  return createHash("sha256").update(s).digest("hex").slice(0, 16);
}

export async function mappingHash(): Promise<string> {
  const p = path.join(process.cwd(), "engine", "mapping.json");
  const b = await readFile(p);
  return createHash("sha256").update(b).digest("hex").slice(0, 16);
}
