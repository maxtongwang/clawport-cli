// Adapter: AionUi
// Schema version pinned to: aion-labs/aionui@v1.4.2
// Config format: JSON (~/.aionui/config.json)
// TypeScript desktop GUI for non-technical users. Electron-based.
// Wraps standard LLM config with GUI-specific settings (all flagged).
// Channels: GUI-native only — webhook/notification channels still supported.

import type {
  Adapter,
  AdapterResult,
  CanonicalChannel,
  CanonicalConfig,
  UnmappedField,
} from "../types.js";
import { makeParsePersona, makeWritePersona } from "../persona.js";

interface AionUiConfig {
  agent?: {
    name?: string;
    provider?: string;
    model?: string;
    system_prompt?: string;
    temperature?: number;
    max_tokens?: number;
    // flagged
    streaming?: boolean;
    avatar_url?: string;
  };
  ui?: {
    // flagged: desktop GUI settings
    theme?: string;
    font_size?: number;
    window_width?: number;
    window_height?: number;
    always_on_top?: boolean;
    tray_icon?: boolean;
    hotkey?: string;
  };
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
  memory?: {
    backend?: string;
    path?: string;
    connection_string?: string;
  };
  // flagged
  auto_update?: boolean;
  telemetry?: unknown;
  log_level?: unknown;
}

export const AionUiAdapter: Adapter = {
  cloneName: "aionui",
  schemaVersion: "v1.4.2",
  configPatterns: ["config.json", ".aionui/config.json"],
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

    if (config.memory) {
      out.memory = {
        backend: config.memory.backend,
        ...(config.memory.path && { path: config.memory.path }),
        ...(config.memory.connection_string && {
          connection_string: config.memory.connection_string,
        }),
      };
    }

    // aionui has no skills/tools block — flag any incoming skills as unmapped
    const allUnmapped = [
      ...config.unmapped,
      ...config.skills.map((s) => ({
        source_path: `skills[${s.name}]`,
        value: s,
        reason: "aionui has no skills support in its native schema",
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
    const src = raw as AionUiConfig;
    const unmapped: UnmappedField[] = [];

    const agentSrc = src.agent ?? {};

    if (agentSrc.streaming !== undefined)
      unmapped.push({
        source_path: "agent.streaming",
        value: agentSrc.streaming,
        reason: "no canonical equivalent",
      });
    if (agentSrc.avatar_url !== undefined)
      unmapped.push({
        source_path: "agent.avatar_url",
        value: agentSrc.avatar_url,
        reason: "no canonical equivalent",
      });
    if (src.ui !== undefined)
      unmapped.push({
        source_path: "ui",
        value: src.ui,
        reason: "desktop GUI settings — no canonical equivalent",
      });
    if (src.auto_update !== undefined)
      unmapped.push({
        source_path: "auto_update",
        value: src.auto_update,
        reason: "no canonical equivalent",
      });
    if (src.telemetry !== undefined)
      unmapped.push({
        source_path: "telemetry",
        value: src.telemetry,
        reason: "no canonical equivalent",
      });
    if (src.log_level !== undefined)
      unmapped.push({
        source_path: "log_level",
        value: src.log_level,
        reason: "no canonical equivalent",
      });

    const agent = {
      name: agentSrc.name ?? "aionui-agent",
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

    const memSrc = src.memory;
    let memory:
      | {
          backend: "sqlite" | "file" | "postgres" | "unknown";
          path?: string;
          connection_string?: string;
        }
      | undefined;
    if (memSrc) {
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
      config: { agent, channels, memory, skills: [], unmapped },
    };
  },

  parsePersona: makeParsePersona("json", "agent.json"),

  writePersona: makeWritePersona("json", "agent.json"),
};
