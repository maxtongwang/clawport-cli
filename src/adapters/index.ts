// Adapter registry — every entry is both a source (parse) and a target (write).
// Import order determines detection priority for `clawport detect`.

import type { Adapter } from "../types.js";
import { OpenClawAdapter } from "./openclaw.js";
import { ZeroClawAdapter } from "./zeroclaw.js";
import { OpenFangAdapter } from "./openfang.js";

export const ADAPTERS: Adapter[] = [
  ZeroClawAdapter, // TOML → check before openclaw (distinct file format)
  OpenFangAdapter, // TOML → differentiated by openfang-specific keys
  OpenClawAdapter, // YAML → fallback
];

export function getAdapter(cloneName: string): Adapter | undefined {
  return ADAPTERS.find((a) => a.cloneName === cloneName);
}
