// Adapter: PicoClaw
// Schema version pinned to: sipeed/picoclaw@v0.2.0
// Config format: JSON (~/.picoclaw/config.json)
// PicoClaw uses agents.defaults for LLM params and a keyed channels map.
// model_list entries are flagged — no canonical per-model key list.

import type {
  Adapter,
  AdapterResult,
  CanonicalChannel,
  CanonicalConfig,
  UnmappedField,
} from "../types.js";

interface PicoClawConfig {
  agents?: {
    defaults?: {
      model?: string;
      max_tokens?: number;
      temperature?: number;
      workspace?: string;
      system_prompt?: string;
      // flagged
      max_tool_iterations?: number;
    };
    // flagged: named agent overrides
    [key: string]: unknown;
  };
  model_list?: Array<{
    model_name?: string;
    api_key_env?: string;
    api_key?: string;
    base_url?: string;
    request_timeout?: number;
    [key: string]: unknown;
  }>;
  channels?: {
    telegram?: { bot_token_env?: string; bot_token?: string; chat_id?: string };
    discord?: {
      bot_token_env?: string;
      bot_token?: string;
      guild_id?: string;
      channel_id?: string;
    };
    whatsapp?: { access_token_env?: string; phone_number?: string };
    slack?: {
      bot_token_env?: string;
      app_token_env?: string;
      workspace?: string;
    };
    matrix?: {
      access_token_env?: string;
      server_url?: string;
      room_id?: string;
    };
    signal?: {
      access_token_env?: string;
      signal_cli_path?: string;
      phone_number?: string;
    };
    dingtalk?: { access_token_env?: string; webhook_url?: string };
    [key: string]: Record<string, unknown> | undefined;
  };
  tools?: {
    web_search?: { provider?: string; api_key_env?: string };
    [key: string]: unknown;
  };
  // flagged
  log_level?: unknown;
  data_dir?: string;
}

export const PicoClawAdapter: Adapter = {
  cloneName: "picoclaw",
  schemaVersion: "v0.2.0",
  configPatterns: ["config.json", ".picoclaw/config.json"],
  defaultOutputFile: "config.json",

  write(config: CanonicalConfig): string {
    const out: Record<string, unknown> = {
      agents: {
        defaults: {
          model: config.agent.model,
          ...(config.agent.temperature !== undefined && {
            temperature: config.agent.temperature,
          }),
          ...(config.agent.max_tokens !== undefined && {
            max_tokens: config.agent.max_tokens,
          }),
          ...(config.agent.system_prompt !== undefined && {
            system_prompt: config.agent.system_prompt,
          }),
        },
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
        Object.assign(entry, ch.extra);
        channels[ch.type] = entry;
      }
      out.channels = channels;
    }

    if (config.memory?.path) out.data_dir = config.memory.path;

    if (config.unmapped.length > 0) {
      out._clawport_unmapped = config.unmapped.map(
        (u) => `${u.source_path}: ${u.reason}`,
      );
    }

    return JSON.stringify(out, null, 2) + "\n";
  },

  parse(_configPath: string, raw: unknown): AdapterResult {
    const src = raw as PicoClawConfig;
    const unmapped: UnmappedField[] = [];

    const defaults = src.agents?.defaults ?? {};

    if (defaults.max_tool_iterations !== undefined)
      unmapped.push({
        source_path: "agents.defaults.max_tool_iterations",
        value: defaults.max_tool_iterations,
        reason: "no canonical equivalent",
      });
    if (defaults.workspace !== undefined)
      unmapped.push({
        source_path: "agents.defaults.workspace",
        value: defaults.workspace,
        reason: "no canonical equivalent — use memory.path",
      });
    if (src.model_list !== undefined)
      unmapped.push({
        source_path: "model_list",
        value: src.model_list,
        reason: "per-model list has no canonical equivalent — use agent.model",
      });
    if (src.tools !== undefined)
      unmapped.push({
        source_path: "tools",
        value: src.tools,
        reason: "no canonical equivalent",
      });
    if (src.log_level !== undefined)
      unmapped.push({
        source_path: "log_level",
        value: src.log_level,
        reason: "no canonical equivalent",
      });

    // Infer provider from model_list[0] if present
    const firstModel = src.model_list?.[0];
    const provider = firstModel?.base_url?.includes("anthropic")
      ? "anthropic"
      : firstModel?.base_url?.includes("openai")
        ? "openai"
        : firstModel?.base_url?.includes("groq")
          ? "groq"
          : "anthropic";

    const agent = {
      name: "picoclaw-agent",
      model: defaults.model ?? firstModel?.model_name ?? "unknown",
      provider,
      ...(defaults.system_prompt !== undefined && {
        system_prompt: defaults.system_prompt,
      }),
      ...(defaults.temperature !== undefined && {
        temperature: defaults.temperature,
      }),
      ...(defaults.max_tokens !== undefined && {
        max_tokens: defaults.max_tokens,
      }),
    };

    const chanSrc = src.channels ?? {};
    const channels: CanonicalChannel[] = [];

    if (chanSrc.discord) {
      const d = chanSrc.discord;
      channels.push({
        type: "discord",
        bot_token_env: d.bot_token_env,
        bot_token: d.bot_token,
        guild_id: d.guild_id,
        channel_id: d.channel_id,
        extra: {},
      });
    }
    if (chanSrc.telegram) {
      const t = chanSrc.telegram;
      channels.push({
        type: "telegram",
        bot_token_env: t.bot_token_env,
        bot_token: t.bot_token,
        chat_id: t.chat_id,
        extra: {},
      });
    }
    if (chanSrc.slack) {
      const s = chanSrc.slack;
      channels.push({
        type: "slack",
        bot_token_env: s.bot_token_env,
        app_token_env: s.app_token_env,
        workspace: s.workspace,
        extra: {},
      });
    }
    if (chanSrc.whatsapp) {
      const w = chanSrc.whatsapp;
      channels.push({
        type: "whatsapp",
        access_token_env: w.access_token_env,
        phone_number: w.phone_number,
        extra: {},
      });
    }
    if (chanSrc.matrix) {
      const m = chanSrc.matrix;
      channels.push({
        type: "matrix",
        access_token_env: m.access_token_env,
        server_url: m.server_url,
        room_id: m.room_id,
        extra: {},
      });
    }
    if (chanSrc.signal) {
      const s = chanSrc.signal;
      channels.push({
        type: "signal",
        access_token_env: s.access_token_env,
        signal_cli_path: s.signal_cli_path,
        phone_number: s.phone_number,
        extra: {},
      });
    }
    if (chanSrc.dingtalk) {
      const d = chanSrc.dingtalk;
      channels.push({
        type: "dingtalk",
        access_token_env: d.access_token_env,
        webhook_url: d.webhook_url,
        extra: {},
      });
    }

    const knownChanKeys = new Set([
      "telegram",
      "discord",
      "slack",
      "whatsapp",
      "matrix",
      "signal",
      "dingtalk",
    ]);
    for (const [key, val] of Object.entries(chanSrc)) {
      if (!knownChanKeys.has(key) && val)
        channels.push({ type: key, extra: val as Record<string, unknown> });
    }

    const memory = src.data_dir
      ? { backend: "file" as const, path: src.data_dir }
      : undefined;

    return {
      ok: true,
      config: { agent, channels, memory, skills: [], unmapped },
    };
  },
};
