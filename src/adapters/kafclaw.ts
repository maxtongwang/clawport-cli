// Adapter: KafClaw
// Schema version pinned to: GoLang-AI/kafclaw@v1.3.2
// Config format: JSON (~/.kafclaw/config.json)
// KafClaw is Go-based; flat config with explicit provider/model fields.
// Channels use a keyed map. Memory maps to storage block.

import type {
  Adapter,
  AdapterResult,
  CanonicalChannel,
  CanonicalConfig,
  UnmappedField,
} from "../types.js";
import { makeParsePersona, makeWritePersona } from "../persona.js";
import { unmappedCanonicalExtras } from "./write-helpers.js";

interface KafClawConfig {
  agent?: {
    name?: string;
    provider?: string;
    model?: string;
    system_prompt?: string;
    temperature?: number;
    max_tokens?: number;
    // flagged
    context_window?: number;
    stream?: boolean;
    retry_count?: number;
  };
  channels?: Record<
    string,
    {
      bot_token_env?: string;
      bot_token?: string;
      guild_id?: string;
      chat_id?: string;
      workspace?: string;
      app_token_env?: string;
      access_token_env?: string;
      server_url?: string;
      room_id?: string;
      channel_id?: string;
      phone_number?: string;
      webhook_url?: string;
      // flagged
      rate_limit?: number;
      [key: string]: unknown;
    }
  >;
  storage?: {
    driver?: string; // "sqlite" | "postgres" | "file"
    dsn?: string;
    path?: string;
    // flagged
    max_connections?: number;
    migrations_dir?: string;
  };
  // flagged
  log_level?: unknown;
  metrics?: unknown;
  tracing?: unknown;
}

export const KafClawAdapter: Adapter = {
  cloneName: "kafclaw",
  schemaVersion: "v1.3.2",
  configPatterns: ["config.json", ".kafclaw/config.json"],
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
        if (ch.room_id) entry.room_id = ch.room_id;
        if (ch.channel_id) entry.channel_id = ch.channel_id;
        if (ch.server_url) entry.server_url = ch.server_url;
        if (ch.phone_number) entry.phone_number = ch.phone_number;
        if (ch.signal_cli_path) entry.signal_cli_path = ch.signal_cli_path;
        if (ch.webhook_url) entry.webhook_url = ch.webhook_url;
        if (ch.imap_host) entry.imap_host = ch.imap_host;
        if (ch.imap_port) entry.imap_port = ch.imap_port;
        if (ch.smtp_host) entry.smtp_host = ch.smtp_host;
        if (ch.smtp_port) entry.smtp_port = ch.smtp_port;
        if (ch.from_address) entry.from_address = ch.from_address;
        Object.assign(entry, ch.extra);
        channels[ch.type] = entry;
      }
      out.channels = channels;
    }

    if (config.memory) {
      out.storage = {
        driver:
          config.memory.backend === "file" ? "file" : config.memory.backend,
        ...(config.memory.path && { path: config.memory.path }),
        ...(config.memory.connection_string && {
          dsn: config.memory.connection_string,
        }),
      };
    }

    const allUnmapped = [...config.unmapped, ...unmappedCanonicalExtras(config)];
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
    const src = raw as KafClawConfig;
    const unmapped: UnmappedField[] = [];

    const agentSrc = src.agent ?? {};

    if (agentSrc.context_window !== undefined)
      unmapped.push({
        source_path: "agent.context_window",
        value: agentSrc.context_window,
        reason: "no canonical equivalent",
      });
    if (agentSrc.stream !== undefined)
      unmapped.push({
        source_path: "agent.stream",
        value: agentSrc.stream,
        reason: "no canonical equivalent",
      });
    if (agentSrc.retry_count !== undefined)
      unmapped.push({
        source_path: "agent.retry_count",
        value: agentSrc.retry_count,
        reason: "no canonical equivalent",
      });
    if (src.log_level !== undefined)
      unmapped.push({
        source_path: "log_level",
        value: src.log_level,
        reason: "no canonical equivalent",
      });
    if (src.metrics !== undefined)
      unmapped.push({
        source_path: "metrics",
        value: src.metrics,
        reason: "no canonical equivalent",
      });
    if (src.tracing !== undefined)
      unmapped.push({
        source_path: "tracing",
        value: src.tracing,
        reason: "no canonical equivalent",
      });

    const agent = {
      name: agentSrc.name ?? "kafclaw-agent",
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
      "guild_id",
      "chat_id",
      "workspace",
      "app_token_env",
      "access_token_env",
      "server_url",
      "room_id",
      "channel_id",
      "phone_number",
      "signal_cli_path",
      "webhook_url",
      "imap_host",
      "imap_port",
      "smtp_host",
      "smtp_port",
      "from_address",
      "rate_limit",
    ]);
    const channels: CanonicalChannel[] = Object.entries(chanSrc).map(
      ([type, ch]) => {
        if (ch.rate_limit !== undefined)
          unmapped.push({
            source_path: `channels.${type}.rate_limit`,
            value: ch.rate_limit,
            reason: "no canonical equivalent",
          });
        const extra: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(ch)) {
          if (!knownKeys.has(k)) extra[k] = v;
        }
        return {
          type,
          bot_token_env: ch.bot_token_env,
          bot_token: ch.bot_token,
          guild_id: ch.guild_id,
          chat_id: ch.chat_id,
          workspace: ch.workspace,
          app_token_env: ch.app_token_env,
          access_token_env: ch.access_token_env,
          server_url: ch.server_url,
          room_id: ch.room_id,
          channel_id: ch.channel_id,
          phone_number: ch.phone_number,
          webhook_url: ch.webhook_url,
          imap_host: (ch as Record<string, unknown>).imap_host as
            | string
            | undefined,
          imap_port: (ch as Record<string, unknown>).imap_port as
            | number
            | undefined,
          smtp_host: (ch as Record<string, unknown>).smtp_host as
            | string
            | undefined,
          smtp_port: (ch as Record<string, unknown>).smtp_port as
            | number
            | undefined,
          from_address: (ch as Record<string, unknown>).from_address as
            | string
            | undefined,
          extra,
        };
      },
    );

    const storageSrc = src.storage;
    let memory:
      | {
          backend: "sqlite" | "file" | "postgres" | "unknown";
          path?: string;
          connection_string?: string;
        }
      | undefined;
    if (storageSrc) {
      if (storageSrc.max_connections !== undefined)
        unmapped.push({
          source_path: "storage.max_connections",
          value: storageSrc.max_connections,
          reason: "no canonical equivalent",
        });
      if (storageSrc.migrations_dir !== undefined)
        unmapped.push({
          source_path: "storage.migrations_dir",
          value: storageSrc.migrations_dir,
          reason: "no canonical equivalent",
        });
      const d = storageSrc.driver;
      const backend: "sqlite" | "file" | "postgres" | "unknown" =
        d === "sqlite" || d === "file" || d === "postgres" ? d : "unknown";
      memory = {
        backend,
        ...(storageSrc.path && { path: storageSrc.path }),
        ...(storageSrc.dsn && { connection_string: storageSrc.dsn }),
      };
    }

    return {
      ok: true,
      config: { agent, channels, memory, skills: [], unmapped },
    };
  },

  parsePersona: makeParsePersona("json", "agent.json"),

  writePersona: makeWritePersona("json", "agent.json"),
};
