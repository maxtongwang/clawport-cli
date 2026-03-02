// Adapter: grip-ai
// Schema version pinned to: grip-tools/grip-ai@v1.0.2
// Config format: JSON (~/.grip/config.json)
// Python, Claude Agent SDK-based, 26 built-in tools.
// Tools (skills) are first-class — config has a "tools" array with enable flags.

import type {
  Adapter,
  AdapterResult,
  CanonicalChannel,
  CanonicalConfig,
  UnmappedField,
} from "../types.js";
import { makeParsePersona, makeWritePersona } from "../persona.js";
import { unmappedCanonicalExtras } from "./write-helpers.js";

interface GripAiConfig {
  agent?: {
    name?: string;
    model?: string; // always "anthropic/..." — compound format
    system_prompt?: string;
    // flagged
    max_tokens_per_turn?: number;
    thinking?: boolean;
  };
  temperature?: number;
  max_tokens?: number;
  tools?: Array<{
    name: string;
    enabled?: boolean;
    // flagged
    config?: Record<string, unknown>;
    api_key_env?: string;
  }>;
  channels?: Record<
    string,
    {
      bot_token_env?: string;
      bot_token?: string;
      access_token_env?: string;
      chat_id?: string;
      guild_id?: string;
      workspace?: string;
      webhook_url?: string;
      channel_id?: string;
      [key: string]: unknown;
    }
  >;
  data_dir?: string;
  // flagged
  log_level?: unknown;
  beta_features?: unknown;
}

export const GripAiAdapter: Adapter = {
  cloneName: "grip-ai",
  schemaVersion: "v1.0.2",
  configPatterns: ["config.json", ".grip/config.json"],
  defaultOutputFile: "config.json",

  write(config: CanonicalConfig): string {
    const agentSrc = config.agent;
    // grip-ai uses compound "provider/model" format
    const modelStr = agentSrc.model ?? "";
    const model = modelStr.includes("/")
      ? modelStr
      : `${agentSrc.provider}/${agentSrc.model}`;

    const out: Record<string, unknown> = {
      agent: {
        name: agentSrc.name,
        model,
        ...(agentSrc.system_prompt !== undefined && {
          system_prompt: agentSrc.system_prompt,
        }),
      },
      ...(agentSrc.temperature !== undefined && {
        temperature: agentSrc.temperature,
      }),
      ...(agentSrc.max_tokens !== undefined && {
        max_tokens: agentSrc.max_tokens,
      }),
    };

    if (config.skills.length > 0) {
      out.tools = config.skills.map((s) => ({
        name: s.name,
        enabled: s.enabled,
      }));
    }

    if (config.channels.length > 0) {
      const channels: Record<string, unknown> = {};
      for (const ch of config.channels) {
        const entry: Record<string, unknown> = {};
        if (ch.bot_token_env) entry.bot_token_env = ch.bot_token_env;
        else if (ch.bot_token) entry.bot_token = ch.bot_token;
        if (ch.access_token_env) entry.access_token_env = ch.access_token_env;
        if (ch.guild_id) entry.guild_id = ch.guild_id;
        if (ch.chat_id) entry.chat_id = ch.chat_id;
        if (ch.workspace) entry.workspace = ch.workspace;
        if (ch.channel_id) entry.channel_id = ch.channel_id;
        if (ch.webhook_url) entry.webhook_url = ch.webhook_url;
        Object.assign(entry, ch.extra);
        channels[ch.type] = entry;
      }
      out.channels = channels;
    }

    if (config.memory?.path) out.data_dir = config.memory.path;

    const allUnmapped = [...config.unmapped, ...unmappedCanonicalExtras(config)];
    if (allUnmapped.length > 0) {
      out._clawport_unmapped = allUnmapped.map(
        (u) => `${u.source_path}: ${u.reason} | value: ${JSON.stringify(u.value)}`,
      );
    }

    return JSON.stringify(out, null, 2) + "\n";
  },

  parse(_configPath: string, raw: unknown): AdapterResult {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw))
      return { ok: false, error: "expected object config" };
    const src = raw as GripAiConfig;
    const unmapped: UnmappedField[] = [];

    const agentSrc = src.agent ?? {};

    // Split "provider/model" compound
    let provider = "anthropic";
    let model = agentSrc.model ?? "unknown";
    if (model.includes("/")) {
      const slash = model.indexOf("/");
      provider = model.slice(0, slash);
      model = model.slice(slash + 1);
    }

    if (agentSrc.max_tokens_per_turn !== undefined)
      unmapped.push({
        source_path: "agent.max_tokens_per_turn",
        value: agentSrc.max_tokens_per_turn,
        reason: "no canonical equivalent",
      });
    if (agentSrc.thinking !== undefined)
      unmapped.push({
        source_path: "agent.thinking",
        value: agentSrc.thinking,
        reason: "no canonical equivalent",
      });
    if (src.log_level !== undefined)
      unmapped.push({
        source_path: "log_level",
        value: src.log_level,
        reason: "no canonical equivalent",
      });
    if (src.beta_features !== undefined)
      unmapped.push({
        source_path: "beta_features",
        value: src.beta_features,
        reason: "no canonical equivalent",
      });

    const agent = {
      name: agentSrc.name ?? "grip-ai-agent",
      model,
      provider,
      ...(agentSrc.system_prompt !== undefined && {
        system_prompt: agentSrc.system_prompt,
      }),
      ...(src.temperature !== undefined && { temperature: src.temperature }),
      ...(src.max_tokens !== undefined && { max_tokens: src.max_tokens }),
    };

    const chanSrc = src.channels ?? {};
    const knownKeys = new Set([
      "bot_token_env",
      "bot_token",
      "access_token_env",
      "chat_id",
      "guild_id",
      "workspace",
      "webhook_url",
      "channel_id",
    ]);
    const channels: CanonicalChannel[] = Object.entries(chanSrc).map(
      ([type, ch]) => {
        const extra: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(ch)) {
          if (!knownKeys.has(k)) extra[k] = v;
        }
        return {
          type,
          bot_token_env: ch.bot_token_env,
          bot_token: ch.bot_token,
          access_token_env: ch.access_token_env,
          guild_id: ch.guild_id,
          chat_id: ch.chat_id,
          workspace: ch.workspace,
          channel_id: ch.channel_id,
          webhook_url: ch.webhook_url,
          extra,
        };
      },
    );

    const skills = (src.tools ?? []).map((t) => {
      if (t.config !== undefined)
        unmapped.push({
          source_path: `tools[${t.name}].config`,
          value: t.config,
          reason: "no canonical equivalent",
        });
      if (t.api_key_env !== undefined)
        unmapped.push({
          source_path: `tools[${t.name}].api_key_env`,
          value: t.api_key_env,
          reason: "no canonical equivalent — set via environment",
        });
      return { name: t.name, enabled: t.enabled ?? true };
    });

    const memory = src.data_dir
      ? { backend: "file" as const, path: src.data_dir }
      : undefined;

    return {
      ok: true,
      config: { agent, channels, memory, skills, unmapped },
    };
  },

  parsePersona: makeParsePersona("json", "agent.json"),

  writePersona: makeWritePersona("json", "agent.json"),
};
