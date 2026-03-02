// Adapter registry — every entry is both a source (parse) and a target (write).
// Import order determines detection priority for `clawport detect`.
// Coverage: 32/32 clawclones.com clones

import type { Adapter } from "../types.js";
// Original 3
import { OpenClawAdapter } from "./openclaw.js";
import { ZeroClawAdapter } from "./zeroclaw.js";
import { OpenFangAdapter } from "./openfang.js";
// Batch 1 (prev session)
import { IronClawAdapter } from "./ironclaw.js";
import { PicoClawAdapter } from "./picoclaw.js";
import { TinyClawAdapter } from "./tinyclaw.js";
import { MoltisAdapter } from "./moltis.js";
import { KafClawAdapter } from "./kafclaw.js";
import { SafeClawAdapter } from "./safeclaw.js";
import { NanoClawAdapter } from "./nanoclaw.js";
import { LightClawAdapter } from "./lightclaw.js";
import { TitanClawAdapter } from "./titanclaw.js";
// Batch 2 (this session)
import { NanobotAdapter } from "./nanobot.js";
import { SmallClawAdapter } from "./smallclaw.js";
import { PicobotAdapter } from "./picobot.js";
import { CoPawAdapter } from "./copaw.js";
import { RowboatAdapter } from "./rowboat.js";
import { RuVectorAdapter } from "./ruvector.js";
import { CarapaceAdapter } from "./carapace.js";
import { ThepopebotAdapter } from "./thepopebot.js";
import { OuroborosAdapter } from "./ouroboros.js";
import { FreeclawAdapter } from "./freeclaw.js";
import { GripAiAdapter } from "./gripai.js";
import { MemuBotAdapter } from "./memubot.js";
import { N8nClawAdapter } from "./n8nclaw.js";
import { AionUiAdapter } from "./aionui.js";
// Batch 3 (this session — completing 32/32)
import { NullClawAdapter } from "./nullclaw.js";
import { AndyClawAdapter } from "./andyclaw.js";
import { BashoBotAdapter } from "./bashobot.js";
import { OpenGorkAdapter } from "./opengork.js";
import { ZClawAdapter } from "./zclaw.js";
import { MimiClawAdapter } from "./mimiclaw.js";

export const ADAPTERS: Adapter[] = [
  // ── TOML-based ───────────────────────────────────────────────────────────
  ZeroClawAdapter, // TOML [[channels]] array
  OpenFangAdapter, // TOML [channels.<type>] keyed map, provider/model compound
  IronClawAdapter, // TOML [llm] block, [database] postgres
  MoltisAdapter, // TOML [[providers]] priority-sorted
  LightClawAdapter, // TOML [model] block, [[channel]] array
  TitanClawAdapter, // TOML [[agents]] + [provider] + [persistence]
  RuVectorAdapter, // TOML [llm] + [storage] + vector_db flagged
  CarapaceAdapter, // TOML [runtime] + [[plugins]] WASM

  // ── JSON-based ───────────────────────────────────────────────────────────
  PicoClawAdapter, // JSON agents.defaults + model_list
  TinyClawAdapter, // JSON agents map keyed by ID
  NullClawAdapter, // JSON agents.list[] + compound provider/model string (Zig)
  AndyClawAdapter, // JSON agents.list[] OpenClaw schema, no channels (Kotlin/Android)
  KafClawAdapter, // JSON flat agent + storage.dsn
  SafeClawAdapter, // JSON llm + agent, enforces env vars
  NanoClawAdapter, // JSON minimal, provider:model colon-compound
  NanobotAdapter, // JSON llm + bot blocks (HKU research)
  SmallClawAdapter, // JSON ollama|openai blocks (local LLM focus)
  PicobotAdapter, // JSON flat, minimal ($5 VPS)
  CoPawAdapter, // JSON model.name, DingTalk/WeChat/Feishu
  RowboatAdapter, // JSON llm + project.name, graph flagged
  ThepopebotAdapter, // JSON flat, git audit trail flagged
  OuroborosAdapter, // JSON llm + agent, self-modify flagged
  FreeclawAdapter, // JSON providers array (budget routing)
  GripAiAdapter, // JSON provider/model compound, tools array
  MemuBotAdapter, // JSON agent + memory + capabilities (enterprise)
  N8nClawAdapter, // JSON agent, workflow block flagged
  AionUiAdapter, // JSON agent, ui block flagged (Electron desktop)

  // ── Shell env-based ──────────────────────────────────────────────────────
  BashoBotAdapter, // env BASHOBOT_LLM + TELEGRAM_* (pure Bash)
  OpenGorkAdapter, // env OPENGORK_MODE + OLLAMA_MODEL (Grok/Ollama)
  ZClawAdapter, // env provision template — ESP32 C firmware
  MimiClawAdapter, // env provision template — ESP32-S3 bare-metal C

  // ── YAML-based ───────────────────────────────────────────────────────────
  OpenClawAdapter, // YAML (fallback)
];

export function getAdapter(cloneName: string): Adapter | undefined {
  return ADAPTERS.find((a) => a.cloneName === cloneName);
}
