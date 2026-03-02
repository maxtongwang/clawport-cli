// Adapter: NanoClaw
// Schema version pinned to: TinyAGI/nanoclaw@v0.4.1
// Config format: JSON (~/.nanoclaw/config.json)
// NanoClaw is TypeScript/Node.js — ultra-minimal, single-agent focus.
// Uses "model" as a compound "provider:model" string (colon-separated).
// No multi-provider support. Memory via local file only.

import type {
  Adapter,
  AdapterResult,
  CanonicalConfig,
  UnmappedField,
} from "../types.js";

interface NanoClawConfig {
  model?: string; // compound: "anthropic:claude-sonnet-4-6"
  system_prompt?: string;
  temperature?: number;
  max_tokens?: number;
  // flagged
  seed?: number;
  stop_sequences?: string[];
  channels?: Record<
    string,
    {
      token_env?: string;
      bot_token_env?: string;
      guild_id?: string;
      chat_id?: string;
      [key: string]: unknown;
    }
  >;
  data_path?: string;
  // flagged
  debug?: boolean;
  history_limit?: number;
}

export const NanoClawAdapter: Adapter = {
  cloneName: "nanoclaw",
  schemaVersion: "v0.4.1",
  configPatterns: ["config.json", ".nanoclaw/config.json"],
  defaultOutputFile: "config.json",

  write(config: CanonicalConfig): string {
    // NanoClaw uses "provider:model" compound format
    const model = config.agent.model.includes(":")
      ? config.agent.model
      : `${config.agent.provider}:${config.agent.model}`;

    const out: Record<string, unknown> = {
      model,
      ...(config.agent.system_prompt !== undefined && {
        system_prompt: config.agent.system_prompt,
      }),
      ...(config.agent.temperature !== undefined && {
        temperature: config.agent.temperature,
      }),
      ...(config.agent.max_tokens !== undefined && {
        max_tokens: config.agent.max_tokens,
      }),
    };

    if (config.channels.length > 0) {
      const channels: Record<string, unknown> = {};
      for (const ch of config.channels) {
        const entry: Record<string, unknown> = {};
        if (ch.bot_token_env) entry.bot_token_env = ch.bot_token_env;
        else if (ch.bot_token) entry.token_env = "FIXME_MOVE_TO_ENV";
        if (ch.guild_id) entry.guild_id = ch.guild_id;
        if (ch.chat_id) entry.chat_id = ch.chat_id;
        Object.assign(entry, ch.extra);
        channels[ch.type] = entry;
      }
      out.channels = channels;
    }

    if (config.memory?.path) out.data_path = config.memory.path;

    if (config.unmapped.length > 0) {
      out._clawport_unmapped = config.unmapped.map(
        (u) => `${u.source_path}: ${u.reason}`,
      );
    }

    return JSON.stringify(out, null, 2) + "\n";
  },

  parse(_configPath: string, raw: unknown): AdapterResult {
    const src = raw as NanoClawConfig;
    const unmapped: UnmappedField[] = [];

    // Split "provider:model" compound
    let provider = "anthropic";
    let model = src.model ?? "unknown";
    if (model.includes(":")) {
      const colon = model.indexOf(":");
      provider = model.slice(0, colon);
      model = model.slice(colon + 1);
    }

    if (src.seed !== undefined)
      unmapped.push({
        source_path: "seed",
        value: src.seed,
        reason: "no canonical equivalent",
      });
    if (src.stop_sequences !== undefined)
      unmapped.push({
        source_path: "stop_sequences",
        value: src.stop_sequences,
        reason: "no canonical equivalent",
      });
    if (src.debug !== undefined)
      unmapped.push({
        source_path: "debug",
        value: src.debug,
        reason: "no canonical equivalent",
      });
    if (src.history_limit !== undefined)
      unmapped.push({
        source_path: "history_limit",
        value: src.history_limit,
        reason: "no canonical equivalent",
      });

    const agent = {
      name: "nanoclaw-agent",
      model,
      provider,
      ...(src.system_prompt !== undefined && {
        system_prompt: src.system_prompt,
      }),
      ...(src.temperature !== undefined && { temperature: src.temperature }),
      ...(src.max_tokens !== undefined && { max_tokens: src.max_tokens }),
    };

    const chanSrc = src.channels ?? {};
    const knownKeys = new Set([
      "token_env",
      "bot_token_env",
      "guild_id",
      "chat_id",
    ]);
    const channels = Object.entries(chanSrc).map(([type, ch]) => {
      const extra: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(ch)) {
        if (!knownKeys.has(k)) extra[k] = v;
      }
      return {
        type,
        bot_token_env: ch.bot_token_env ?? ch.token_env,
        guild_id: ch.guild_id,
        chat_id: ch.chat_id,
        extra,
      };
    });

    const memory = src.data_path
      ? { backend: "file" as const, path: src.data_path }
      : undefined;

    return {
      ok: true,
      config: { agent, channels, memory, skills: [], unmapped },
    };
  },
};
