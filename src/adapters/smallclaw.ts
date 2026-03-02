// Adapter: SmallClaw
// Schema version pinned to: local-ai/smallclaw@v0.3.2
// Config format: JSON (~/.smallclaw/config.json)
// TypeScript/Node, optimized for local LLMs via Ollama.
// Uses "ollama" block for local model config, falls back to "openai" block.
// Provider is inferred from which block is populated.

import type {
  Adapter,
  AdapterResult,
  CanonicalChannel,
  CanonicalConfig,
  UnmappedField,
} from "../types.js";

interface SmallClawConfig {
  agent?: {
    name?: string;
    system_prompt?: string;
    // flagged
    context_limit?: number;
    memory_type?: string;
  };
  ollama?: {
    model?: string;
    base_url?: string; // flagged: local endpoint
    temperature?: number;
    max_tokens?: number;
    // flagged
    num_ctx?: number;
    num_gpu?: number;
  };
  openai?: {
    api_key_env?: string; // flagged
    model?: string;
    temperature?: number;
    max_tokens?: number;
    base_url?: string; // flagged: custom endpoint
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
      channel_id?: string;
      webhook_url?: string;
      [key: string]: unknown;
    }
  >;
  data_dir?: string;
  // flagged
  log_level?: unknown;
  gpu_layers?: number;
}

export const SmallClawAdapter: Adapter = {
  cloneName: "smallclaw",
  schemaVersion: "v0.3.2",
  configPatterns: ["config.json", ".smallclaw/config.json"],
  defaultOutputFile: "config.json",

  write(config: CanonicalConfig): string {
    const out: Record<string, unknown> = {
      agent: {
        name: config.agent.name,
        ...(config.agent.system_prompt !== undefined && {
          system_prompt: config.agent.system_prompt,
        }),
      },
    };

    // Route to ollama or openai block based on provider
    if (config.agent.provider === "ollama") {
      out.ollama = {
        model: config.agent.model,
        ...(config.agent.temperature !== undefined && {
          temperature: config.agent.temperature,
        }),
        ...(config.agent.max_tokens !== undefined && {
          max_tokens: config.agent.max_tokens,
        }),
      };
    } else {
      out.openai = {
        model: config.agent.model,
        ...(config.agent.temperature !== undefined && {
          temperature: config.agent.temperature,
        }),
        ...(config.agent.max_tokens !== undefined && {
          max_tokens: config.agent.max_tokens,
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

    if (config.unmapped.length > 0) {
      out._clawport_unmapped = config.unmapped.map(
        (u) => `${u.source_path}: ${u.reason}`,
      );
    }

    return JSON.stringify(out, null, 2) + "\n";
  },

  parse(_configPath: string, raw: unknown): AdapterResult {
    const src = raw as SmallClawConfig;
    const unmapped: UnmappedField[] = [];

    const agentSrc = src.agent ?? {};
    const ollamaSrc = src.ollama;
    const openaiSrc = src.openai;

    if (agentSrc.context_limit !== undefined)
      unmapped.push({
        source_path: "agent.context_limit",
        value: agentSrc.context_limit,
        reason: "no canonical equivalent",
      });
    if (agentSrc.memory_type !== undefined)
      unmapped.push({
        source_path: "agent.memory_type",
        value: agentSrc.memory_type,
        reason: "no canonical equivalent",
      });
    if (src.log_level !== undefined)
      unmapped.push({
        source_path: "log_level",
        value: src.log_level,
        reason: "no canonical equivalent",
      });
    if (src.gpu_layers !== undefined)
      unmapped.push({
        source_path: "gpu_layers",
        value: src.gpu_layers,
        reason: "no canonical equivalent",
      });

    // Prefer ollama block if present; fall back to openai
    let provider = "anthropic";
    let model = "unknown";
    let temperature: number | undefined;
    let max_tokens: number | undefined;

    if (ollamaSrc) {
      provider = "ollama";
      model = ollamaSrc.model ?? "unknown";
      temperature = ollamaSrc.temperature;
      max_tokens = ollamaSrc.max_tokens;
      if (ollamaSrc.base_url !== undefined)
        unmapped.push({
          source_path: "ollama.base_url",
          value: ollamaSrc.base_url,
          reason: "no canonical equivalent — local endpoint",
        });
      if (ollamaSrc.num_ctx !== undefined)
        unmapped.push({
          source_path: "ollama.num_ctx",
          value: ollamaSrc.num_ctx,
          reason: "no canonical equivalent",
        });
      if (ollamaSrc.num_gpu !== undefined)
        unmapped.push({
          source_path: "ollama.num_gpu",
          value: ollamaSrc.num_gpu,
          reason: "no canonical equivalent",
        });
    } else if (openaiSrc) {
      provider = "openai";
      model = openaiSrc.model ?? "unknown";
      temperature = openaiSrc.temperature;
      max_tokens = openaiSrc.max_tokens;
      if (openaiSrc.api_key_env !== undefined)
        unmapped.push({
          source_path: "openai.api_key_env",
          value: openaiSrc.api_key_env,
          reason: "no canonical equivalent — set via environment",
        });
      if (openaiSrc.base_url !== undefined)
        unmapped.push({
          source_path: "openai.base_url",
          value: openaiSrc.base_url,
          reason: "no canonical equivalent",
        });
    }

    const agent = {
      name: agentSrc.name ?? "smallclaw-agent",
      model,
      provider,
      ...(agentSrc.system_prompt !== undefined && {
        system_prompt: agentSrc.system_prompt,
      }),
      ...(temperature !== undefined && { temperature }),
      ...(max_tokens !== undefined && { max_tokens }),
    };

    const chanSrc = src.channels ?? {};
    const knownKeys = new Set([
      "bot_token_env",
      "bot_token",
      "access_token_env",
      "chat_id",
      "guild_id",
      "workspace",
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
          channel_id: ch.channel_id,
          webhook_url: ch.webhook_url,
          extra,
        };
      },
    );

    const memory = src.data_dir
      ? { backend: "file" as const, path: src.data_dir }
      : undefined;

    return {
      ok: true,
      config: { agent, channels, memory, skills: [], unmapped },
    };
  },
};
