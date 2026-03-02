// Adapter: CoPaw
// Schema version pinned to: alibaba-damo/copaw@v0.5.1
// Config format: JSON (~/.copaw/config.json)
// Python/Alibaba alternative. DingTalk-first, supports WeChat Work and Feishu.
// Uses "model" block (Alibaba Qwen naming convention).

import type {
  Adapter,
  AdapterResult,
  CanonicalChannel,
  CanonicalConfig,
  UnmappedField,
} from "../types.js";
import { makeParsePersona, makeWritePersona } from "../persona.js";
import { unmappedCanonicalExtras } from "./write-helpers.js";

interface CoPawConfig {
  agent?: {
    name?: string;
    system_prompt?: string;
    // flagged
    role?: string;
    language?: string;
    safety_level?: string;
  };
  model?: {
    provider?: string; // "qwen" | "openai" | "anthropic" etc.
    name?: string; // model name
    api_key_env?: string; // flagged
    temperature?: number;
    max_tokens?: number;
    // flagged
    enable_search?: boolean;
    top_p?: number;
  };
  channels?: {
    dingtalk?: {
      access_token_env?: string;
      webhook_url?: string;
      // flagged
      corp_id?: string;
      app_key_env?: string;
    };
    wechat_work?: {
      access_token_env?: string;
      corp_id?: string; // flagged
      agent_id?: string; // flagged
    };
    feishu?: {
      access_token_env?: string;
      app_id?: string; // flagged
      webhook_url?: string;
    };
    telegram?: { bot_token_env?: string; bot_token?: string; chat_id?: string };
    slack?: {
      bot_token_env?: string;
      app_token_env?: string;
      workspace?: string;
    };
    discord?: {
      bot_token_env?: string;
      bot_token?: string;
      guild_id?: string;
    };
    [key: string]: Record<string, unknown> | undefined;
  };
  memory?: {
    backend?: string;
    path?: string;
    connection_string?: string;
  };
  // flagged
  plugins?: unknown;
  log_level?: unknown;
}

export const CoPawAdapter: Adapter = {
  cloneName: "copaw",
  schemaVersion: "v0.5.1",
  configPatterns: ["config.json", ".copaw/config.json"],
  defaultOutputFile: "config.json",

  write(config: CanonicalConfig): string {
    const out: Record<string, unknown> = {
      agent: {
        name: config.agent.name,
        ...(config.agent.system_prompt !== undefined && {
          system_prompt: config.agent.system_prompt,
        }),
      },
      model: {
        provider: config.agent.provider,
        name: config.agent.model,
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
    const src = raw as CoPawConfig;
    const unmapped: UnmappedField[] = [];

    const agentSrc = src.agent ?? {};
    const modelSrc = src.model ?? {};

    if (agentSrc.role !== undefined)
      unmapped.push({
        source_path: "agent.role",
        value: agentSrc.role,
        reason: "no canonical equivalent",
      });
    if (agentSrc.language !== undefined)
      unmapped.push({
        source_path: "agent.language",
        value: agentSrc.language,
        reason: "no canonical equivalent",
      });
    if (agentSrc.safety_level !== undefined)
      unmapped.push({
        source_path: "agent.safety_level",
        value: agentSrc.safety_level,
        reason: "no canonical equivalent",
      });
    if (modelSrc.api_key_env !== undefined)
      unmapped.push({
        source_path: "model.api_key_env",
        value: modelSrc.api_key_env,
        reason: "no canonical equivalent — set via environment",
      });
    if (modelSrc.enable_search !== undefined)
      unmapped.push({
        source_path: "model.enable_search",
        value: modelSrc.enable_search,
        reason: "no canonical equivalent",
      });
    if (modelSrc.top_p !== undefined)
      unmapped.push({
        source_path: "model.top_p",
        value: modelSrc.top_p,
        reason: "no canonical equivalent",
      });
    if (src.plugins !== undefined)
      unmapped.push({
        source_path: "plugins",
        value: src.plugins,
        reason: "no canonical equivalent",
      });
    if (src.log_level !== undefined)
      unmapped.push({
        source_path: "log_level",
        value: src.log_level,
        reason: "no canonical equivalent",
      });

    const agent = {
      name: agentSrc.name ?? "copaw-agent",
      model: modelSrc.name ?? "unknown",
      provider: modelSrc.provider ?? "qwen",
      ...(agentSrc.system_prompt !== undefined && {
        system_prompt: agentSrc.system_prompt,
      }),
      ...(modelSrc.temperature !== undefined && {
        temperature: modelSrc.temperature,
      }),
      ...(modelSrc.max_tokens !== undefined && {
        max_tokens: modelSrc.max_tokens,
      }),
    };

    const chanSrc = src.channels ?? {};
    const channels: CanonicalChannel[] = [];

    if (chanSrc.dingtalk) {
      const d = chanSrc.dingtalk;
      if (d.corp_id !== undefined)
        unmapped.push({
          source_path: "channels.dingtalk.corp_id",
          value: d.corp_id,
          reason: "no canonical equivalent",
        });
      if (d.app_key_env !== undefined)
        unmapped.push({
          source_path: "channels.dingtalk.app_key_env",
          value: d.app_key_env,
          reason: "no canonical equivalent",
        });
      channels.push({
        type: "dingtalk",
        access_token_env: d.access_token_env,
        webhook_url: d.webhook_url,
        extra: {},
      });
    }
    if (chanSrc.wechat_work) {
      const w = chanSrc.wechat_work;
      if (w.corp_id !== undefined)
        unmapped.push({
          source_path: "channels.wechat_work.corp_id",
          value: w.corp_id,
          reason: "no canonical equivalent",
        });
      if (w.agent_id !== undefined)
        unmapped.push({
          source_path: "channels.wechat_work.agent_id",
          value: w.agent_id,
          reason: "no canonical equivalent",
        });
      channels.push({
        type: "wechat_work",
        access_token_env: w.access_token_env,
        extra: {},
      });
    }
    if (chanSrc.feishu) {
      const f = chanSrc.feishu;
      if (f.app_id !== undefined)
        unmapped.push({
          source_path: "channels.feishu.app_id",
          value: f.app_id,
          reason: "no canonical equivalent",
        });
      channels.push({
        type: "feishu",
        access_token_env: f.access_token_env,
        webhook_url: f.webhook_url,
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
    if (chanSrc.discord) {
      const d = chanSrc.discord;
      channels.push({
        type: "discord",
        bot_token_env: d.bot_token_env,
        bot_token: d.bot_token,
        guild_id: d.guild_id,
        extra: {},
      });
    }

    const known = new Set([
      "dingtalk",
      "wechat_work",
      "feishu",
      "telegram",
      "slack",
      "discord",
    ]);
    for (const [key, val] of Object.entries(chanSrc)) {
      if (!known.has(key) && val)
        channels.push({ type: key, extra: val as Record<string, unknown> });
    }

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
