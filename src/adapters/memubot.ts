// Adapter: memU Bot
// Schema version pinned to: memu-ai/memubot@v2.3.0
// Config format: JSON (~/.memubot/config.json)
// TypeScript, enterprise persistent memory layer. Memory config is first-class.
// Channels use keyed map. Skills map to "capabilities" array.

import type {
  Adapter,
  AdapterResult,
  CanonicalChannel,
  CanonicalConfig,
  UnmappedField,
} from "../types.js";
import { makeParsePersona, makeWritePersona } from "../persona.js";
import { unmappedCanonicalExtras } from "./write-helpers.js";

interface MemuBotConfig {
  agent?: {
    name?: string;
    provider?: string;
    model?: string;
    system_prompt?: string;
    temperature?: number;
    max_tokens?: number;
    // flagged
    persona?: string;
    response_style?: string;
  };
  memory?: {
    backend?: string; // "sqlite" | "postgres" | "redis"
    path?: string;
    connection_string?: string;
    // flagged
    retention_days?: number;
    max_entries?: number;
    summary_model?: string;
    embedding_model?: string;
  };
  channels?: Record<
    string,
    {
      bot_token_env?: string;
      bot_token?: string;
      access_token_env?: string;
      app_token_env?: string;
      chat_id?: string;
      guild_id?: string;
      workspace?: string;
      channel_id?: string;
      server_url?: string;
      room_id?: string;
      webhook_url?: string;
      [key: string]: unknown;
    }
  >;
  capabilities?: Array<{
    name: string;
    enabled?: boolean;
    // flagged
    scope?: string;
    tier?: string;
  }>;
  // flagged
  enterprise?: unknown;
  audit?: unknown;
  log_level?: unknown;
}

export const MemuBotAdapter: Adapter = {
  cloneName: "memubot",
  schemaVersion: "v2.3.0",
  configPatterns: ["config.json", ".memubot/config.json"],
  defaultOutputFile: "config.json",

  write(config: CanonicalConfig): string {
    const out: Record<string, unknown> = {
      agent: {
        name: config.agent.name,
        provider: config.agent.provider,
        model: config.agent.model,
        ...(config.agent.system_prompt !== undefined && {
          system_prompt: config.agent.system_prompt,
        }),
        ...(config.agent.temperature !== undefined && {
          temperature: config.agent.temperature,
        }),
        ...(config.agent.max_tokens !== undefined && {
          max_tokens: config.agent.max_tokens,
        }),
      },
    };

    if (config.memory) {
      out.memory = {
        backend: config.memory.backend,
        ...(config.memory.path && { path: config.memory.path }),
        ...(config.memory.connection_string && {
          connection_string: config.memory.connection_string,
        }),
      };
    }

    if (config.channels.length > 0) {
      const channels: Record<string, unknown> = {};
      for (const ch of config.channels) {
        const entry: Record<string, unknown> = {};
        if (ch.bot_token_env) entry.bot_token_env = ch.bot_token_env;
        else if (ch.bot_token) entry.bot_token = ch.bot_token;
        if (ch.access_token_env) entry.access_token_env = ch.access_token_env;
        if (ch.app_token_env) entry.app_token_env = ch.app_token_env;
        if (ch.guild_id) entry.guild_id = ch.guild_id;
        if (ch.chat_id) entry.chat_id = ch.chat_id;
        if (ch.workspace) entry.workspace = ch.workspace;
        if (ch.channel_id) entry.channel_id = ch.channel_id;
        if (ch.room_id) entry.room_id = ch.room_id;
        if (ch.server_url) entry.server_url = ch.server_url;
        if (ch.webhook_url) entry.webhook_url = ch.webhook_url;
        Object.assign(entry, ch.extra);
        channels[ch.type] = entry;
      }
      out.channels = channels;
    }

    if (config.skills.length > 0) {
      out.capabilities = config.skills.map((s) => ({
        name: s.name,
        enabled: s.enabled,
      }));
    }

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
    const src = raw as MemuBotConfig;
    const unmapped: UnmappedField[] = [];

    const agentSrc = src.agent ?? {};

    if (agentSrc.persona !== undefined)
      unmapped.push({
        source_path: "agent.persona",
        value: agentSrc.persona,
        reason: "no canonical equivalent",
      });
    if (agentSrc.response_style !== undefined)
      unmapped.push({
        source_path: "agent.response_style",
        value: agentSrc.response_style,
        reason: "no canonical equivalent",
      });
    if (src.enterprise !== undefined)
      unmapped.push({
        source_path: "enterprise",
        value: src.enterprise,
        reason: "no canonical equivalent",
      });
    if (src.audit !== undefined)
      unmapped.push({
        source_path: "audit",
        value: src.audit,
        reason: "no canonical equivalent",
      });
    if (src.log_level !== undefined)
      unmapped.push({
        source_path: "log_level",
        value: src.log_level,
        reason: "no canonical equivalent",
      });

    const agent = {
      name: agentSrc.name ?? "memubot-agent",
      model: agentSrc.model ?? "unknown",
      provider: agentSrc.provider ?? "anthropic",
      ...(agentSrc.system_prompt !== undefined && {
        system_prompt: agentSrc.system_prompt,
      }),
      ...(agentSrc.temperature !== undefined && {
        temperature: agentSrc.temperature,
      }),
      ...(agentSrc.max_tokens !== undefined && {
        max_tokens: agentSrc.max_tokens,
      }),
    };

    const chanSrc = src.channels ?? {};
    const knownKeys = new Set([
      "bot_token_env",
      "bot_token",
      "access_token_env",
      "app_token_env",
      "chat_id",
      "guild_id",
      "workspace",
      "channel_id",
      "room_id",
      "server_url",
      "webhook_url",
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
          app_token_env: ch.app_token_env,
          guild_id: ch.guild_id,
          chat_id: ch.chat_id,
          workspace: ch.workspace,
          channel_id: ch.channel_id,
          room_id: ch.room_id,
          server_url: ch.server_url,
          webhook_url: ch.webhook_url,
          extra,
        };
      },
    );

    const skills = (src.capabilities ?? []).map((c) => {
      if (c.scope !== undefined)
        unmapped.push({
          source_path: `capabilities[${c.name}].scope`,
          value: c.scope,
          reason: "no canonical equivalent",
        });
      if (c.tier !== undefined)
        unmapped.push({
          source_path: `capabilities[${c.name}].tier`,
          value: c.tier,
          reason: "no canonical equivalent",
        });
      return { name: c.name, enabled: c.enabled ?? true };
    });

    const memSrc = src.memory;
    let memory:
      | {
          backend: "sqlite" | "file" | "postgres" | "unknown";
          path?: string;
          connection_string?: string;
        }
      | undefined;
    if (memSrc) {
      if (memSrc.retention_days !== undefined)
        unmapped.push({
          source_path: "memory.retention_days",
          value: memSrc.retention_days,
          reason: "no canonical equivalent",
        });
      if (memSrc.max_entries !== undefined)
        unmapped.push({
          source_path: "memory.max_entries",
          value: memSrc.max_entries,
          reason: "no canonical equivalent",
        });
      if (memSrc.summary_model !== undefined)
        unmapped.push({
          source_path: "memory.summary_model",
          value: memSrc.summary_model,
          reason: "no canonical equivalent",
        });
      if (memSrc.embedding_model !== undefined)
        unmapped.push({
          source_path: "memory.embedding_model",
          value: memSrc.embedding_model,
          reason: "no canonical equivalent",
        });
      // treat "redis" as unknown backend (no canonical equivalent)
      const b = memSrc.backend;
      const backend: "sqlite" | "file" | "postgres" | "unknown" =
        b === "sqlite" || b === "file" || b === "postgres" ? b : "unknown";
      memory = {
        backend,
        ...(memSrc.path && { path: memSrc.path }),
        ...(memSrc.connection_string && {
          connection_string: memSrc.connection_string,
        }),
      };
    }

    return {
      ok: true,
      config: { agent, channels, memory, skills, unmapped },
    };
  },

  parsePersona: makeParsePersona("json", "agent.json"),

  writePersona: makeWritePersona("json", "agent.json"),
};
