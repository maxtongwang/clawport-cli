// Adapter: FreeClaw
// Schema version pinned to: budget-ai/freeclaw@v0.2.3
// Config format: JSON (~/.freeclaw/config.json)
// Python-based, targets free/low-cost providers (Groq, Together, Gemini flash, etc).
// Uses a "providers" list (priority order) to route to cheapest available.
// Only the first (primary) provider maps to canonical agent fields.

import type {
  Adapter,
  AdapterResult,
  CanonicalConfig,
  UnmappedField,
} from "../types.js";
import { makeParsePersona, makeWritePersona } from "../persona.js";
import { unmappedCanonicalExtras } from "./write-helpers.js";

interface FreeclawConfig {
  agent?: {
    name?: string;
    system_prompt?: string;
    // flagged
    budget_limit_usd?: number;
    fallback_enabled?: boolean;
  };
  providers?: Array<{
    name?: string; // provider id
    model?: string;
    api_key_env?: string; // flagged
    free_tier?: boolean; // flagged
    temperature?: number;
    max_tokens?: number;
    // flagged
    rpm_limit?: number;
    tpd_limit?: number;
  }>;
  channels?: Record<
    string,
    {
      bot_token_env?: string;
      bot_token?: string;
      chat_id?: string;
      guild_id?: string;
      webhook_url?: string;
      [key: string]: unknown;
    }
  >;
  data_dir?: string;
  // flagged
  cost_tracker?: unknown;
  log_level?: unknown;
}

export const FreeclawAdapter: Adapter = {
  cloneName: "freeclaw",
  schemaVersion: "v0.2.3",
  configPatterns: ["config.json", ".freeclaw/config.json"],
  defaultOutputFile: "config.json",

  write(config: CanonicalConfig): string {
    // Recover full providers array if available from unmapped (roundtrip)
    const recoveredProvidersEntry = config.unmapped.find(
      (u) => u.source_path === "providers" && Array.isArray(u.value),
    );
    const unmappedRest = config.unmapped.filter(
      (u) => !(u.source_path === "providers" && Array.isArray(u.value)),
    );

    const providers = recoveredProvidersEntry
      ? (recoveredProvidersEntry.value as Array<Record<string, unknown>>).map(
          (p, i) =>
            i === 0
              ? {
                  ...p,
                  name: config.agent.provider,
                  model: config.agent.model,
                  ...(config.agent.temperature !== undefined && {
                    temperature: config.agent.temperature,
                  }),
                  ...(config.agent.max_tokens !== undefined && {
                    max_tokens: config.agent.max_tokens,
                  }),
                }
              : p,
        )
      : [
          {
            name: config.agent.provider,
            model: config.agent.model,
            ...(config.agent.temperature !== undefined && {
              temperature: config.agent.temperature,
            }),
            ...(config.agent.max_tokens !== undefined && {
              max_tokens: config.agent.max_tokens,
            }),
          },
        ];

    const out: Record<string, unknown> = {
      agent: {
        name: config.agent.name,
        ...(config.agent.system_prompt !== undefined && {
          system_prompt: config.agent.system_prompt,
        }),
      },
      providers,
    };

    if (config.channels.length > 0) {
      const channels: Record<string, unknown> = {};
      for (const ch of config.channels) {
        const entry: Record<string, unknown> = {};
        if (ch.bot_token_env) entry.bot_token_env = ch.bot_token_env;
        else if (ch.bot_token) entry.bot_token = ch.bot_token;
        if (ch.chat_id) entry.chat_id = ch.chat_id;
        if (ch.guild_id) entry.guild_id = ch.guild_id;
        if (ch.webhook_url) entry.webhook_url = ch.webhook_url;
        Object.assign(entry, ch.extra);
        channels[ch.type] = entry;
      }
      out.channels = channels;
    }

    if (config.memory?.path) out.data_dir = config.memory.path;

    const allUnmapped = [...unmappedRest, ...unmappedCanonicalExtras(config)];
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
    const src = raw as FreeclawConfig;
    const unmapped: UnmappedField[] = [];

    const agentSrc = src.agent ?? {};
    const providers = src.providers ?? [];
    const primary = providers[0] ?? {};

    if (agentSrc.budget_limit_usd !== undefined)
      unmapped.push({
        source_path: "agent.budget_limit_usd",
        value: agentSrc.budget_limit_usd,
        reason: "no canonical equivalent",
      });
    if (agentSrc.fallback_enabled !== undefined)
      unmapped.push({
        source_path: "agent.fallback_enabled",
        value: agentSrc.fallback_enabled,
        reason: "no canonical equivalent",
      });
    if (providers.length > 1)
      unmapped.push({
        source_path: "providers",
        value: providers,
        reason: "multi-provider fallback list — only primary exported",
      });
    if (primary.api_key_env !== undefined)
      unmapped.push({
        source_path: "providers[0].api_key_env",
        value: primary.api_key_env,
        reason: "no canonical equivalent — set via environment",
      });
    if (primary.free_tier !== undefined)
      unmapped.push({
        source_path: "providers[0].free_tier",
        value: primary.free_tier,
        reason: "no canonical equivalent",
      });
    if (primary.rpm_limit !== undefined)
      unmapped.push({
        source_path: "providers[0].rpm_limit",
        value: primary.rpm_limit,
        reason: "no canonical equivalent",
      });
    if (primary.tpd_limit !== undefined)
      unmapped.push({
        source_path: "providers[0].tpd_limit",
        value: primary.tpd_limit,
        reason: "no canonical equivalent",
      });
    if (src.cost_tracker !== undefined)
      unmapped.push({
        source_path: "cost_tracker",
        value: src.cost_tracker,
        reason: "no canonical equivalent",
      });
    if (src.log_level !== undefined)
      unmapped.push({
        source_path: "log_level",
        value: src.log_level,
        reason: "no canonical equivalent",
      });

    const agent = {
      name: agentSrc.name ?? "freeclaw-agent",
      model: primary.model ?? "unknown",
      provider: primary.name ?? "groq",
      ...(agentSrc.system_prompt !== undefined && {
        system_prompt: agentSrc.system_prompt,
      }),
      ...(primary.temperature !== undefined && {
        temperature: primary.temperature,
      }),
      ...(primary.max_tokens !== undefined && {
        max_tokens: primary.max_tokens,
      }),
    };

    const chanSrc = src.channels ?? {};
    const knownKeys = new Set([
      "bot_token_env",
      "bot_token",
      "chat_id",
      "guild_id",
      "webhook_url",
    ]);
    const channels = Object.entries(chanSrc).map(([type, ch]) => {
      const extra: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(ch)) {
        if (!knownKeys.has(k)) extra[k] = v;
      }
      return {
        type,
        bot_token_env: ch.bot_token_env,
        bot_token: ch.bot_token,
        chat_id: ch.chat_id,
        guild_id: ch.guild_id,
        webhook_url: ch.webhook_url,
        extra,
      };
    });

    const memory = src.data_dir
      ? { backend: "file" as const, path: src.data_dir }
      : undefined;

    return {
      ok: true,
      config: { agent, channels, memory, skills: [], unmapped },
    };
  },

  parsePersona: makeParsePersona("json", "agent.json"),

  writePersona: makeWritePersona("json", "agent.json"),
};
