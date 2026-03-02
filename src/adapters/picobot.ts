// Adapter: Picobot
// Schema version pinned to: frugalai/picobot@v0.1.4
// Config format: JSON (~/.picobot/bot.json)
// Go-based, $5 VPS compatible. Minimal flat JSON config.
// No memory block — uses in-process ephemeral state only.
// Provider defaults to "openai" (cheapest API target).

import type {
  Adapter,
  AdapterResult,
  CanonicalConfig,
  UnmappedField,
} from "../types.js";
import { makeParsePersona, makeWritePersona } from "../persona.js";

interface PicobotConfig {
  name?: string;
  provider?: string; // "openai" | "anthropic" | "groq"
  model?: string;
  api_key_env?: string; // flagged
  system_prompt?: string;
  temperature?: number;
  max_tokens?: number;
  channels?: Record<
    string,
    {
      token_env?: string;
      bot_token_env?: string;
      chat_id?: string;
      guild_id?: string;
      webhook_url?: string;
      [key: string]: unknown;
    }
  >;
  // flagged
  debug?: boolean;
  max_history?: number;
  webhook_port?: number;
}

export const PicobotAdapter: Adapter = {
  cloneName: "picobot",
  schemaVersion: "v0.1.4",
  configPatterns: ["bot.json", ".picobot/bot.json"],
  defaultOutputFile: "bot.json",

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
        if (ch.bot_token_env) entry.bot_token_env = ch.bot_token_env;
        else if (ch.bot_token) entry.token_env = "FIXME_MOVE_TO_ENV";
        if (ch.chat_id) entry.chat_id = ch.chat_id;
        if (ch.guild_id) entry.guild_id = ch.guild_id;
        if (ch.webhook_url) entry.webhook_url = ch.webhook_url;
        Object.assign(entry, ch.extra);
        channels[ch.type] = entry;
      }
      out.channels = channels;
    }

    if (config.unmapped.length > 0) {
      out._clawport_unmapped = config.unmapped.map(
        (u) => `${u.source_path}: ${u.reason}`,
      );
    }

    return JSON.stringify(out, null, 2) + "\n";
  },

  parse(_configPath: string, raw: unknown): AdapterResult {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw))
      return { ok: false, error: "expected object config" };
    const src = raw as PicobotConfig;
    const unmapped: UnmappedField[] = [];

    if (src.api_key_env !== undefined)
      unmapped.push({
        source_path: "api_key_env",
        value: src.api_key_env,
        reason: "no canonical equivalent — set via environment",
      });
    if (src.debug !== undefined)
      unmapped.push({
        source_path: "debug",
        value: src.debug,
        reason: "no canonical equivalent",
      });
    if (src.max_history !== undefined)
      unmapped.push({
        source_path: "max_history",
        value: src.max_history,
        reason: "no canonical equivalent",
      });
    if (src.webhook_port !== undefined)
      unmapped.push({
        source_path: "webhook_port",
        value: src.webhook_port,
        reason: "no canonical equivalent",
      });

    const agent = {
      name: src.name ?? "picobot-agent",
      model: src.model ?? "unknown",
      provider: src.provider ?? "openai",
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
        bot_token_env: ch.bot_token_env ?? ch.token_env,
        chat_id: ch.chat_id,
        guild_id: ch.guild_id,
        webhook_url: ch.webhook_url,
        extra,
      };
    });

    return {
      ok: true,
      config: { agent, channels, memory: undefined, skills: [], unmapped },
    };
  },

  parsePersona: makeParsePersona("json", "agent.json"),

  writePersona: makeWritePersona("json", "agent.json"),
};
