// Adapter: thepopebot
// Schema version pinned to: git-agents/thepopebot@v1.1.0
// Config format: JSON (.thepopebot.json or ~/.thepopebot/config.json)
// JavaScript/Node. Git-based agent — auditable through commits.
// Flat config structure. Channels minimal (mainly webhook-based).

import type {
  Adapter,
  AdapterResult,
  CanonicalConfig,
  UnmappedField,
} from "../types.js";
import { makeParsePersona, makeWritePersona } from "../persona.js";
import { unmappedCanonicalExtras } from "./write-helpers.js";

interface ThepopebotConfig {
  name?: string;
  provider?: string;
  model?: string;
  api_key_env?: string; // flagged
  system_prompt?: string;
  temperature?: number;
  max_tokens?: number;
  channels?: Record<
    string,
    {
      webhook_url?: string;
      bot_token_env?: string;
      bot_token?: string;
      chat_id?: string;
      guild_id?: string;
      // flagged
      commit_on_response?: boolean;
      [key: string]: unknown;
    }
  >;
  git?: {
    // flagged: git-specific audit trail config
    repo?: string;
    branch?: string;
    commit_message_template?: string;
    auto_push?: boolean;
  };
  data_path?: string;
  // flagged
  debug?: boolean;
}

export const ThepopebotAdapter: Adapter = {
  cloneName: "thepopebot",
  schemaVersion: "v1.1.0",
  configPatterns: [
    ".thepopebot.json",
    "config.json",
    ".thepopebot/config.json",
  ],
  defaultOutputFile: ".thepopebot.json",

  write(config: CanonicalConfig): string {
    const out: Record<string, unknown> = {
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
    };

    if (config.channels.length > 0) {
      const channels: Record<string, unknown> = {};
      for (const ch of config.channels) {
        const entry: Record<string, unknown> = {};
        if (ch.webhook_url) entry.webhook_url = ch.webhook_url;
        if (ch.bot_token_env) entry.bot_token_env = ch.bot_token_env;
        else if (ch.bot_token) entry.bot_token = ch.bot_token;
        if (ch.chat_id) entry.chat_id = ch.chat_id;
        if (ch.guild_id) entry.guild_id = ch.guild_id;
        Object.assign(entry, ch.extra);
        channels[ch.type] = entry;
      }
      out.channels = channels;
    }

    if (config.memory?.path) out.data_path = config.memory.path;

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
    const src = raw as ThepopebotConfig;
    const unmapped: UnmappedField[] = [];

    if (src.api_key_env !== undefined)
      unmapped.push({
        source_path: "api_key_env",
        value: src.api_key_env,
        reason: "no canonical equivalent — set via environment",
      });
    if (src.git !== undefined)
      unmapped.push({
        source_path: "git",
        value: src.git,
        reason: "git audit trail config — no canonical equivalent",
      });
    if (src.debug !== undefined)
      unmapped.push({
        source_path: "debug",
        value: src.debug,
        reason: "no canonical equivalent",
      });

    const agent = {
      name: src.name ?? "thepopebot-agent",
      model: src.model ?? "unknown",
      provider: src.provider ?? "anthropic",
      ...(src.system_prompt !== undefined && {
        system_prompt: src.system_prompt,
      }),
      ...(src.temperature !== undefined && { temperature: src.temperature }),
      ...(src.max_tokens !== undefined && { max_tokens: src.max_tokens }),
    };

    const chanSrc = src.channels ?? {};
    const knownKeys = new Set([
      "webhook_url",
      "bot_token_env",
      "bot_token",
      "chat_id",
      "guild_id",
      "commit_on_response",
    ]);
    const channels = Object.entries(chanSrc).map(([type, ch]) => {
      if (ch.commit_on_response !== undefined)
        unmapped.push({
          source_path: `channels.${type}.commit_on_response`,
          value: ch.commit_on_response,
          reason: "no canonical equivalent",
        });
      const extra: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(ch)) {
        if (!knownKeys.has(k)) extra[k] = v;
      }
      return {
        type,
        webhook_url: ch.webhook_url,
        bot_token_env: ch.bot_token_env,
        bot_token: ch.bot_token,
        chat_id: ch.chat_id,
        guild_id: ch.guild_id,
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

  parsePersona: makeParsePersona("json", "agent.json"),

  writePersona: makeWritePersona("json", "agent.json"),
};
