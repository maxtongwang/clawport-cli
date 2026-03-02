// Adapter: Ouroboros
// Schema version pinned to: self-mod/ouroboros@v0.3.0
// Config format: JSON (~/.ouroboros/config.json)
// Python-based self-modifying agent. Cycles config itself — very experimental.
// Most cycle/mutation settings are flagged. Standard agent/channel fields map normally.

import type {
  Adapter,
  AdapterResult,
  CanonicalChannel,
  CanonicalConfig,
  UnmappedField,
} from "../types.js";
import { makeParsePersona, makeWritePersona } from "../persona.js";

interface OuroborosConfig {
  agent?: {
    name?: string;
    system_prompt?: string;
    // flagged
    self_modify?: boolean;
    mutation_rate?: number;
    cycle_limit?: number;
    eval_strategy?: string;
  };
  llm?: {
    provider?: string;
    model?: string;
    api_key_env?: string; // flagged
    temperature?: number;
    max_tokens?: number;
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
      [key: string]: unknown;
    }
  >;
  memory?: {
    backend?: string;
    path?: string;
    connection_string?: string;
    // flagged
    checkpoint_interval?: number;
  };
  // flagged
  sandbox?: unknown;
  log_level?: unknown;
}

export const OuroborosAdapter: Adapter = {
  cloneName: "ouroboros",
  schemaVersion: "v0.3.0",
  configPatterns: ["config.json", ".ouroboros/config.json"],
  defaultOutputFile: "config.json",

  write(config: CanonicalConfig): string {
    const out: Record<string, unknown> = {
      agent: {
        name: config.agent.name,
        ...(config.agent.system_prompt !== undefined && {
          system_prompt: config.agent.system_prompt,
        }),
      },
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

    if (config.unmapped.length > 0) {
      out._clawport_unmapped = config.unmapped.map(
        (u) => `${u.source_path}: ${u.reason}`,
      );
    }

    return JSON.stringify(out, null, 2) + "\n";
  },

  parse(_configPath: string, raw: unknown): AdapterResult {
    const src = raw as OuroborosConfig;
    const unmapped: UnmappedField[] = [];

    const agentSrc = src.agent ?? {};
    const llmSrc = src.llm ?? {};

    if (agentSrc.self_modify !== undefined)
      unmapped.push({
        source_path: "agent.self_modify",
        value: agentSrc.self_modify,
        reason: "no canonical equivalent",
      });
    if (agentSrc.mutation_rate !== undefined)
      unmapped.push({
        source_path: "agent.mutation_rate",
        value: agentSrc.mutation_rate,
        reason: "no canonical equivalent",
      });
    if (agentSrc.cycle_limit !== undefined)
      unmapped.push({
        source_path: "agent.cycle_limit",
        value: agentSrc.cycle_limit,
        reason: "no canonical equivalent",
      });
    if (agentSrc.eval_strategy !== undefined)
      unmapped.push({
        source_path: "agent.eval_strategy",
        value: agentSrc.eval_strategy,
        reason: "no canonical equivalent",
      });
    if (llmSrc.api_key_env !== undefined)
      unmapped.push({
        source_path: "llm.api_key_env",
        value: llmSrc.api_key_env,
        reason: "no canonical equivalent — set via environment",
      });
    if (src.sandbox !== undefined)
      unmapped.push({
        source_path: "sandbox",
        value: src.sandbox,
        reason: "no canonical equivalent",
      });
    if (src.log_level !== undefined)
      unmapped.push({
        source_path: "log_level",
        value: src.log_level,
        reason: "no canonical equivalent",
      });

    const agent = {
      name: agentSrc.name ?? "ouroboros-agent",
      model: llmSrc.model ?? "unknown",
      provider: llmSrc.provider ?? "anthropic",
      ...(agentSrc.system_prompt !== undefined && {
        system_prompt: agentSrc.system_prompt,
      }),
      ...(llmSrc.temperature !== undefined && {
        temperature: llmSrc.temperature,
      }),
      ...(llmSrc.max_tokens !== undefined && { max_tokens: llmSrc.max_tokens }),
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
      if (memSrc.checkpoint_interval !== undefined)
        unmapped.push({
          source_path: "memory.checkpoint_interval",
          value: memSrc.checkpoint_interval,
          reason: "no canonical equivalent",
        });
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
