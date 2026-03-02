// Adapter registry — every entry is both a source (parse) and a target (write).
// Import order determines detection priority for `clawport detect`.

import type { Adapter } from "../types.js";
import { OpenClawAdapter } from "./openclaw.js";
import { ZeroClawAdapter } from "./zeroclaw.js";
import { OpenFangAdapter } from "./openfang.js";
import { IronClawAdapter } from "./ironclaw.js";
import { PicoClawAdapter } from "./picoclaw.js";
import { TinyClawAdapter } from "./tinyclaw.js";
import { MoltisAdapter } from "./moltis.js";
import { KafClawAdapter } from "./kafclaw.js";
import { SafeClawAdapter } from "./safeclaw.js";
import { NanoClawAdapter } from "./nanoclaw.js";
import { LightClawAdapter } from "./lightclaw.js";
import { TitanClawAdapter } from "./titanclaw.js";

export const ADAPTERS: Adapter[] = [
  // TOML-based (check before YAML/JSON)
  ZeroClawAdapter, // TOML [[channels]] array
  OpenFangAdapter, // TOML [channels.<type>] keyed map, provider/model compound
  IronClawAdapter, // TOML [llm] block, [database] for postgres
  MoltisAdapter, // TOML [[providers]] array with priority
  LightClawAdapter, // TOML [model] block, [[channel]] array
  TitanClawAdapter, // TOML [[agents]] + [provider] + [persistence]
  // JSON-based
  PicoClawAdapter, // JSON agents.defaults + model_list
  TinyClawAdapter, // JSON agents map keyed by ID
  KafClawAdapter, // JSON flat agent + channels map + storage
  SafeClawAdapter, // JSON llm + agent blocks, enforces env vars
  NanoClawAdapter, // JSON minimal, provider:model compound
  // YAML-based (fallback)
  OpenClawAdapter, // YAML
];

export function getAdapter(cloneName: string): Adapter | undefined {
  return ADAPTERS.find((a) => a.cloneName === cloneName);
}
