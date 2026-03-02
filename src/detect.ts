// Fingerprints a directory as a specific claw clone.
// Uses file patterns from each adapter's configPatterns list.
// Conflict resolution (e.g. 14 adapters share "config.json"):
//   1. Specific patterns (containing "/") beat bare filenames — score +10
//   2. Content fingerprinting for JSON files breaks remaining ties — score +2
//   3. ADAPTERS array order breaks equal-score ties

import fs from "fs";
import path from "path";
import { ADAPTERS } from "./adapters/index.js";
import type { Adapter, CloneFingerprint } from "./types.js";

export interface DetectResult {
  adapter: Adapter;
  fingerprint: CloneFingerprint;
}

export function detect(dir: string): DetectResult | null {
  const abs = path.resolve(dir);

  // Collect all matching candidates (one per adapter)
  type Candidate = {
    adapter: Adapter;
    configFile: string;
    isSpecific: boolean;
    adapterIdx: number;
  };
  const candidates: Candidate[] = [];

  for (let i = 0; i < ADAPTERS.length; i++) {
    const adapter = ADAPTERS[i];
    // Pick the most-specific matching pattern for this adapter.
    // A pattern containing "/" (subdirectory) beats a bare filename.
    let best: { configFile: string; isSpecific: boolean } | null = null;
    for (const pattern of adapter.configPatterns) {
      const candidate = path.join(abs, pattern);
      if (fs.existsSync(candidate)) {
        const isSpecific = pattern.includes("/");
        if (!best || isSpecific) best = { configFile: candidate, isSpecific };
        if (isSpecific) break; // can't do better than a specific match
      }
    }
    if (best)
      candidates.push({
        adapter,
        configFile: best.configFile,
        isSpecific: best.isSpecific,
        adapterIdx: i,
      });
  }

  if (candidates.length === 0) return null;
  if (candidates.length === 1) return makeResult(candidates[0]);

  // Score each candidate; sort descending, preserve ADAPTERS order on ties
  const scored = candidates.map((c) => ({
    ...c,
    score: (c.isSpecific ? 10 : 0) + contentScore(c.adapter, c.configFile),
  }));
  scored.sort((a, b) => b.score - a.score || a.adapterIdx - b.adapterIdx);

  return makeResult(scored[0]);
}

function makeResult(c: { adapter: Adapter; configFile: string }): DetectResult {
  const ext = path.extname(c.configFile).toLowerCase();
  const language =
    ext === ".toml"
      ? ("rust" as const)
      : ext === ".yaml" || ext === ".yml"
        ? ("unknown" as const)
        : ext === ".json"
          ? ("typescript" as const)
          : ("unknown" as const);

  return {
    adapter: c.adapter,
    fingerprint: {
      name: c.adapter.cloneName,
      schema_version: c.adapter.schemaVersion,
      config_file: c.configFile,
      language,
    },
  };
}

// Content fingerprint for JSON adapters that share a bare filename pattern.
// Reads and parses the file; checks for adapter-specific distinguishing keys.
// Returns 0 if not a JSON file or file can't be read.
function contentScore(adapter: Adapter, configFile: string): number {
  if (path.extname(configFile).toLowerCase() !== ".json") return 0;

  let obj: Record<string, unknown>;
  try {
    const parsed = JSON.parse(fs.readFileSync(configFile, "utf8"));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
      return 0;
    obj = parsed as Record<string, unknown>;
  } catch {
    return 0;
  }

  const agents = obj.agents as Record<string, unknown> | undefined;

  switch (adapter.cloneName) {
    case "picoclaw":
      // agents.defaults block or model_list array
      return agents?.defaults !== undefined || Array.isArray(agents?.model_list)
        ? 2
        : 0;
    case "tinyclaw":
      // agents is a plain object map keyed by agent ID (not an array)
      return agents !== undefined &&
        !Array.isArray(agents) &&
        typeof agents === "object"
        ? 2
        : 0;
    case "nullclaw":
      // agents.list[] array
      return Array.isArray(agents?.list) ? 2 : 0;
    case "kafclaw":
      // storage.dsn
      return (obj.storage as Record<string, unknown> | undefined)?.dsn !==
        undefined
        ? 2
        : 0;
    case "safeclaw":
      // llm.model_env (env-var enforced model)
      return (obj.llm as Record<string, unknown> | undefined)?.model_env !==
        undefined
        ? 2
        : 0;
    case "nanoclaw":
      // model is a "provider:model" colon-compound string
      return typeof obj.model === "string" &&
        (obj.model as string).includes(":")
        ? 2
        : 0;
    case "nanobot":
      // both llm and bot top-level blocks
      return obj.llm !== undefined && obj.bot !== undefined ? 2 : 0;
    case "smallclaw":
      // ollama or openai top-level block
      return obj.ollama !== undefined || obj.openai !== undefined ? 2 : 0;
    case "copaw":
      // model.name (Chinese platform style)
      return (obj.model as Record<string, unknown> | undefined)?.name !==
        undefined
        ? 2
        : 0;
    case "rowboat":
      // llm + project.name
      return obj.llm !== undefined &&
        (obj.project as Record<string, unknown> | undefined)?.name !== undefined
        ? 2
        : 0;
    case "memubot":
      // memory + capabilities both present
      return obj.memory !== undefined && obj.capabilities !== undefined ? 2 : 0;
    case "grip-ai":
      // tools array (26 built-in tools)
      return Array.isArray(obj.tools) ? 2 : 0;
    case "aionui":
      // ui block (Electron desktop)
      return obj.ui !== undefined ? 2 : 0;
    case "picobot":
      // webhook_port is picobot-specific (HTTP webhook server)
      return obj.webhook_port !== undefined ? 2 : 0;
    default:
      return 0;
  }
}
