// Adapter: AndyClaw
// Schema version pinned to: friuns2/andyclaw@v0.3.1
// Config format: JSON (openclaw.json)
// Kotlin-based Android assistant. Uses OpenClaw's JSON schema exactly:
// agents.list[] with identity.name + model.primary compound string.
// No messaging channels (APK-bundled UI). Auth via auth-profiles.json (flagged).

import type {
  Adapter,
  AdapterResult,
  CanonicalConfig,
  UnmappedField,
} from "../types.js";
import { makeParsePersona, makeWritePersona } from "../persona.js";

interface AndyClawConfig {
  agents?: {
    defaults?: {
      model?: { primary?: string };
      system_prompt?: string;
      params?: { temperature?: number; maxTokens?: number };
    };
    list?: Array<{
      id?: string;
      identity?: { name?: string };
      model?: { primary?: string };
      system_prompt?: string;
      params?: { temperature?: number; maxTokens?: number };
    }>;
  };
  // flagged: Android auth profiles
  auth_profiles?: unknown;
  // flagged: on-device inference settings
  inference?: {
    backend?: string;
    model_path?: string;
    quantization?: string;
  };
  // flagged
  log_level?: unknown;
}

export const AndyClawAdapter: Adapter = {
  cloneName: "andyclaw",
  schemaVersion: "v0.3.1",
  configPatterns: ["openclaw.json", ".andyclaw/openclaw.json"],
  defaultOutputFile: "openclaw.json",

  write(config: CanonicalConfig): string {
    const modelPrimary = `${config.agent.provider}/${config.agent.model}`;

    const primaryAgent: Record<string, unknown> = {
      id: "primary",
      identity: { name: config.agent.name },
      model: { primary: modelPrimary },
    };
    if (config.agent.system_prompt !== undefined)
      primaryAgent.system_prompt = config.agent.system_prompt;
    if (
      config.agent.temperature !== undefined ||
      config.agent.max_tokens !== undefined
    ) {
      const params: Record<string, unknown> = {};
      if (config.agent.temperature !== undefined)
        params.temperature = config.agent.temperature;
      if (config.agent.max_tokens !== undefined)
        params.maxTokens = config.agent.max_tokens;
      primaryAgent.params = params;
    }

    // Recover multi-agent list if available from unmapped (roundtrip)
    const recoveredListEntry = config.unmapped.find(
      (u) => u.source_path === "agents.list" && Array.isArray(u.value),
    );
    const unmappedRest = config.unmapped.filter(
      (u) => !(u.source_path === "agents.list" && Array.isArray(u.value)),
    );

    const agentList = recoveredListEntry
      ? (recoveredListEntry.value as Array<Record<string, unknown>>).map(
          (a, i) => (i === 0 ? { ...a, ...primaryAgent } : a),
        )
      : [primaryAgent];

    const out: Record<string, unknown> = {
      agents: { list: agentList },
    };

    // andyclaw has no channel, memory, or skills support — flag all
    const allUnmapped = [
      ...unmappedRest,
      ...config.channels.map((ch) => ({
        source_path: `channels.${ch.type}`,
        value: ch,
        reason: "andyclaw is APK-bundled — no messaging channel support",
      })),
      ...(config.memory
        ? [
            {
              source_path: "memory",
              value: config.memory,
              reason: "andyclaw has no memory backend config",
            },
          ]
        : []),
      ...config.skills.map((s) => ({
        source_path: `skills[${s.name}]`,
        value: s,
        reason: "andyclaw has no skills/tools config",
      })),
    ];

    if (allUnmapped.length > 0) {
      out._clawport_unmapped = allUnmapped.map(
        (u) => `${u.source_path}: ${u.reason}`,
      );
    }

    return JSON.stringify(out, null, 2) + "\n";
  },

  parse(_configPath: string, raw: unknown): AdapterResult {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw))
      return { ok: false, error: "expected object config" };
    const src = raw as AndyClawConfig;
    const unmapped: UnmappedField[] = [];

    const agentsList = src.agents?.list ?? [];
    const defaults = src.agents?.defaults ?? {};
    const primary = agentsList[0] ?? {};

    if (agentsList.length > 1)
      unmapped.push({
        source_path: "agents.list",
        value: agentsList,
        reason: "multi-agent list — only first agent exported",
      });
    if (src.auth_profiles !== undefined)
      unmapped.push({
        source_path: "auth_profiles",
        value: src.auth_profiles,
        reason: "Android auth profiles — no canonical equivalent",
      });
    if (src.inference !== undefined)
      unmapped.push({
        source_path: "inference",
        value: src.inference,
        reason: "on-device inference settings — no canonical equivalent",
      });
    if (src.log_level !== undefined)
      unmapped.push({
        source_path: "log_level",
        value: src.log_level,
        reason: "no canonical equivalent",
      });

    const modelPrimary =
      primary.model?.primary ?? defaults.model?.primary ?? "";
    const slashIdx = modelPrimary.indexOf("/");
    const provider =
      slashIdx > -1 ? modelPrimary.slice(0, slashIdx) : "anthropic";
    const model =
      slashIdx > -1
        ? modelPrimary.slice(slashIdx + 1)
        : modelPrimary || "unknown";

    const systemPrompt = primary.system_prompt ?? defaults.system_prompt;
    const temperature =
      primary.params?.temperature ?? defaults.params?.temperature;
    const maxTokens = primary.params?.maxTokens ?? defaults.params?.maxTokens;

    const agent = {
      name: primary.identity?.name ?? "andyclaw-agent",
      model,
      provider,
      ...(systemPrompt !== undefined && { system_prompt: systemPrompt }),
      ...(temperature !== undefined && { temperature }),
      ...(maxTokens !== undefined && { max_tokens: maxTokens }),
    };

    return {
      ok: true,
      config: { agent, channels: [], memory: undefined, skills: [], unmapped },
    };
  },

  parsePersona: makeParsePersona("json", "agent.json"),

  writePersona: makeWritePersona("json", "agent.json"),
};
