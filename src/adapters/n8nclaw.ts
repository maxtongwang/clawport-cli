// Adapter: n8nClaw
// Schema version pinned to: n8n-io/n8nclaw@v0.5.0
// Config format: JSON (~/.n8nclaw/config.json)
// TypeScript, runs inside n8n workflow platform. AI agent embedded in n8n node.
// "workflow" block is flagged. Standard agent fields map normally.

import type {
  Adapter,
  AdapterResult,
  CanonicalChannel,
  CanonicalConfig,
  UnmappedField,
} from "../types.js";
import { makeParsePersona, makeWritePersona } from "../persona.js";

interface N8nClawConfig {
  agent?: {
    name?: string;
    provider?: string;
    model?: string;
    system_prompt?: string;
    temperature?: number;
    max_tokens?: number;
    // flagged
    credentials_id?: string;
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
  workflow?: {
    // flagged: n8n-specific workflow execution context
    id?: string;
    node_name?: string;
    trigger_type?: string;
    session_id_source?: string;
  };
  memory?: {
    backend?: string;
    path?: string;
    connection_string?: string;
  };
  tools?: Array<{
    name: string;
    enabled?: boolean;
    // flagged
    n8n_node_type?: string;
  }>;
  // flagged
  log_level?: unknown;
}

export const N8nClawAdapter: Adapter = {
  cloneName: "n8nclaw",
  schemaVersion: "v0.5.0",
  configPatterns: ["config.json", ".n8nclaw/config.json"],
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

    if (config.skills.length > 0) {
      out.tools = config.skills.map((s) => ({
        name: s.name,
        enabled: s.enabled,
      }));
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
    const src = raw as N8nClawConfig;
    const unmapped: UnmappedField[] = [];

    const agentSrc = src.agent ?? {};

    if (agentSrc.credentials_id !== undefined)
      unmapped.push({
        source_path: "agent.credentials_id",
        value: agentSrc.credentials_id,
        reason: "no canonical equivalent — n8n credential store reference",
      });
    if (src.workflow !== undefined)
      unmapped.push({
        source_path: "workflow",
        value: src.workflow,
        reason: "n8n workflow execution context — no canonical equivalent",
      });
    if (src.log_level !== undefined)
      unmapped.push({
        source_path: "log_level",
        value: src.log_level,
        reason: "no canonical equivalent",
      });

    const agent = {
      name: agentSrc.name ?? "n8nclaw-agent",
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

    const skills = (src.tools ?? []).map((t) => {
      if (t.n8n_node_type !== undefined)
        unmapped.push({
          source_path: `tools[${t.name}].n8n_node_type`,
          value: t.n8n_node_type,
          reason: "no canonical equivalent",
        });
      return { name: t.name, enabled: t.enabled ?? true };
    });

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
      config: { agent, channels, memory, skills, unmapped },
    };
  },

  parsePersona: makeParsePersona("json", "agent.json"),

  writePersona: makeWritePersona("json", "agent.json"),
};
