// Adapter: nanobot
// Schema version pinned to: hku-systems/nanobot@v1.2.0
// Config format: JSON (~/.nanobot/config.json)
// Python/Pydantic-based research bot by HKU. Uses "llm" block for model config.
// Channels use a keyed map. Research-oriented: flags many non-standard fields.

import type {
  Adapter,
  AdapterResult,
  CanonicalChannel,
  CanonicalConfig,
  UnmappedField,
} from "../types.js";
import { makeParsePersona, makeWritePersona } from "../persona.js";
import { unmappedCanonicalExtras } from "./write-helpers.js";

interface NanobotConfig {
  llm?: {
    provider?: string;
    model?: string;
    api_key_env?: string; // flagged
    temperature?: number;
    max_tokens?: number;
    // flagged: research params
    top_p?: number;
    top_k?: number;
    repetition_penalty?: number;
  };
  bot?: {
    name?: string;
    system_prompt?: string;
    // flagged
    persona?: string;
    language?: string;
    max_turns?: number;
    reasoning?: boolean;
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
      server_url?: string;
      room_id?: string;
      channel_id?: string;
      webhook_url?: string;
      [key: string]: unknown;
    }
  >;
  storage?: {
    type?: string; // "sqlite" | "postgres" | "file"
    path?: string;
    dsn?: string;
    // flagged
    vector_store?: string;
    embedding_model?: string;
  };
  // flagged
  experiment?: unknown;
  logging?: unknown;
}

export const NanobotAdapter: Adapter = {
  cloneName: "nanobot",
  schemaVersion: "v1.2.0",
  configPatterns: ["config.json", ".nanobot/config.json"],
  defaultOutputFile: "config.json",

  write(config: CanonicalConfig): string {
    const out: Record<string, unknown> = {
      llm: {
        provider: config.agent.provider,
        model: config.agent.model,
        ...(config.agent.temperature !== undefined && {
          temperature: config.agent.temperature,
        }),
        ...(config.agent.max_tokens !== undefined && {
          max_tokens: config.agent.max_tokens,
        }),
      },
      bot: {
        name: config.agent.name,
        ...(config.agent.system_prompt !== undefined && {
          system_prompt: config.agent.system_prompt,
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
        if (ch.room_id) entry.room_id = ch.room_id;
        if (ch.channel_id) entry.channel_id = ch.channel_id;
        if (ch.server_url) entry.server_url = ch.server_url;
        if (ch.webhook_url) entry.webhook_url = ch.webhook_url;
        Object.assign(entry, ch.extra);
        channels[ch.type] = entry;
      }
      out.channels = channels;
    }

    if (config.memory) {
      out.storage = {
        type: config.memory.backend,
        ...(config.memory.path && { path: config.memory.path }),
        ...(config.memory.connection_string && {
          dsn: config.memory.connection_string,
        }),
      };
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
    const src = raw as NanobotConfig;
    const unmapped: UnmappedField[] = [];

    const llmSrc = src.llm ?? {};
    const botSrc = src.bot ?? {};

    if (llmSrc.api_key_env !== undefined)
      unmapped.push({
        source_path: "llm.api_key_env",
        value: llmSrc.api_key_env,
        reason: "no canonical equivalent — set via environment",
      });
    if (llmSrc.top_p !== undefined)
      unmapped.push({
        source_path: "llm.top_p",
        value: llmSrc.top_p,
        reason: "no canonical equivalent",
      });
    if (llmSrc.top_k !== undefined)
      unmapped.push({
        source_path: "llm.top_k",
        value: llmSrc.top_k,
        reason: "no canonical equivalent",
      });
    if (llmSrc.repetition_penalty !== undefined)
      unmapped.push({
        source_path: "llm.repetition_penalty",
        value: llmSrc.repetition_penalty,
        reason: "no canonical equivalent",
      });
    if (botSrc.persona !== undefined)
      unmapped.push({
        source_path: "bot.persona",
        value: botSrc.persona,
        reason: "no canonical equivalent",
      });
    if (botSrc.language !== undefined)
      unmapped.push({
        source_path: "bot.language",
        value: botSrc.language,
        reason: "no canonical equivalent",
      });
    if (botSrc.max_turns !== undefined)
      unmapped.push({
        source_path: "bot.max_turns",
        value: botSrc.max_turns,
        reason: "no canonical equivalent",
      });
    if (botSrc.reasoning !== undefined)
      unmapped.push({
        source_path: "bot.reasoning",
        value: botSrc.reasoning,
        reason: "no canonical equivalent",
      });
    if (src.experiment !== undefined)
      unmapped.push({
        source_path: "experiment",
        value: src.experiment,
        reason: "no canonical equivalent",
      });
    if (src.logging !== undefined)
      unmapped.push({
        source_path: "logging",
        value: src.logging,
        reason: "no canonical equivalent",
      });

    const agent = {
      name: botSrc.name ?? "nanobot-agent",
      model: llmSrc.model ?? "unknown",
      provider: llmSrc.provider ?? "anthropic",
      ...(botSrc.system_prompt !== undefined && {
        system_prompt: botSrc.system_prompt,
      }),
      ...(llmSrc.temperature !== undefined && {
        temperature: llmSrc.temperature,
      }),
      ...(llmSrc.max_tokens !== undefined && {
        max_tokens: llmSrc.max_tokens,
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
      "server_url",
      "room_id",
      "channel_id",
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
          guild_id: ch.guild_id,
          chat_id: ch.chat_id,
          workspace: ch.workspace,
          server_url: ch.server_url,
          room_id: ch.room_id,
          channel_id: ch.channel_id,
          webhook_url: ch.webhook_url,
          extra,
        };
      },
    );

    const storeSrc = src.storage;
    let memory:
      | {
          backend: "sqlite" | "file" | "postgres" | "unknown";
          path?: string;
          connection_string?: string;
        }
      | undefined;
    if (storeSrc) {
      if (storeSrc.vector_store !== undefined)
        unmapped.push({
          source_path: "storage.vector_store",
          value: storeSrc.vector_store,
          reason: "no canonical equivalent",
        });
      if (storeSrc.embedding_model !== undefined)
        unmapped.push({
          source_path: "storage.embedding_model",
          value: storeSrc.embedding_model,
          reason: "no canonical equivalent",
        });
      const t = storeSrc.type;
      const backend: "sqlite" | "file" | "postgres" | "unknown" =
        t === "sqlite" || t === "file" || t === "postgres" ? t : "unknown";
      memory = {
        backend,
        ...(storeSrc.path && { path: storeSrc.path }),
        ...(storeSrc.dsn && { connection_string: storeSrc.dsn }),
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
