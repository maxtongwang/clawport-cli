// Adapter: Rowboat
// Schema version pinned to: rowboat-ai/rowboat@v0.8.0
// Config format: JSON (~/.rowboat/config.json)
// TypeScript/YC-backed. Knowledge graph visualization, multi-agent orchestration.
// Uses a "graph" block for agent topology — only primary node exported.
// Skills map to "tools" array.

import type {
  Adapter,
  AdapterResult,
  CanonicalChannel,
  CanonicalConfig,
  UnmappedField,
} from "../types.js";
import { makeParsePersona, makeWritePersona } from "../persona.js";

interface RowboatConfig {
  project?: {
    name?: string;
    description?: string; // flagged
  };
  llm?: {
    provider?: string;
    model?: string;
    api_key_env?: string; // flagged
    temperature?: number;
    max_tokens?: number;
  };
  agent?: {
    system_prompt?: string;
    // flagged: rowboat-specific
    handoff_policy?: string;
    max_agents?: number;
  };
  graph?: {
    // flagged: knowledge graph topology
    nodes?: unknown;
    edges?: unknown;
    entry_node?: string;
  };
  channels?: Record<
    string,
    {
      bot_token_env?: string;
      bot_token?: string;
      access_token_env?: string;
      app_token_env?: string;
      chat_id?: string;
      guild_id?: string;
      workspace?: string;
      channel_id?: string;
      webhook_url?: string;
      server_url?: string;
      room_id?: string;
      [key: string]: unknown;
    }
  >;
  tools?: Array<{
    name: string;
    enabled?: boolean;
    // flagged
    description?: string;
    parameters?: unknown;
  }>;
  memory?: {
    backend?: string;
    path?: string;
    connection_string?: string;
    // flagged
    graph_db?: string;
  };
  // flagged
  telemetry?: unknown;
  log_level?: unknown;
}

export const RowboatAdapter: Adapter = {
  cloneName: "rowboat",
  schemaVersion: "v0.8.0",
  configPatterns: ["config.json", ".rowboat/config.json"],
  defaultOutputFile: "config.json",

  write(config: CanonicalConfig): string {
    const out: Record<string, unknown> = {
      project: { name: config.agent.name },
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

    if (config.agent.system_prompt !== undefined) {
      out.agent = { system_prompt: config.agent.system_prompt };
    }

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
        if (ch.channel_id) entry.channel_id = ch.channel_id;
        if (ch.room_id) entry.room_id = ch.room_id;
        if (ch.server_url) entry.server_url = ch.server_url;
        if (ch.webhook_url) entry.webhook_url = ch.webhook_url;
        Object.assign(entry, ch.extra);
        channels[ch.type] = entry;
      }
      out.channels = channels;
    }

    if (config.skills.length > 0) {
      out.tools = config.skills.map((s) => ({
        name: s.name,
        enabled: s.enabled,
        ...(s.config && { config: s.config }),
      }));
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
    if (typeof raw !== "object" || raw === null || Array.isArray(raw))
      return { ok: false, error: "expected object config" };
    const src = raw as RowboatConfig;
    const unmapped: UnmappedField[] = [];

    const llmSrc = src.llm ?? {};
    const agentSrc = src.agent ?? {};

    if (src.project?.description !== undefined)
      unmapped.push({
        source_path: "project.description",
        value: src.project.description,
        reason: "no canonical equivalent",
      });
    if (llmSrc.api_key_env !== undefined)
      unmapped.push({
        source_path: "llm.api_key_env",
        value: llmSrc.api_key_env,
        reason: "no canonical equivalent — set via environment",
      });
    if (agentSrc.handoff_policy !== undefined)
      unmapped.push({
        source_path: "agent.handoff_policy",
        value: agentSrc.handoff_policy,
        reason: "no canonical equivalent",
      });
    if (agentSrc.max_agents !== undefined)
      unmapped.push({
        source_path: "agent.max_agents",
        value: agentSrc.max_agents,
        reason: "no canonical equivalent",
      });
    if (src.graph !== undefined)
      unmapped.push({
        source_path: "graph",
        value: src.graph,
        reason: "knowledge graph topology — no canonical equivalent",
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
      name: src.project?.name ?? "rowboat-agent",
      model: llmSrc.model ?? "unknown",
      provider: llmSrc.provider ?? "anthropic",
      ...(agentSrc.system_prompt !== undefined && {
        system_prompt: agentSrc.system_prompt,
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
      "app_token_env",
      "chat_id",
      "guild_id",
      "workspace",
      "channel_id",
      "room_id",
      "server_url",
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
          app_token_env: ch.app_token_env,
          guild_id: ch.guild_id,
          chat_id: ch.chat_id,
          workspace: ch.workspace,
          channel_id: ch.channel_id,
          room_id: ch.room_id,
          server_url: ch.server_url,
          webhook_url: ch.webhook_url,
          extra,
        };
      },
    );

    const knownToolKeys = new Set([
      "name",
      "enabled",
      "description",
      "parameters",
    ]);
    const skills = (src.tools ?? []).map((t) => {
      if (t.description !== undefined)
        unmapped.push({
          source_path: `tools[${t.name}].description`,
          value: t.description,
          reason: "no canonical equivalent",
        });
      if (t.parameters !== undefined)
        unmapped.push({
          source_path: `tools[${t.name}].parameters`,
          value: t.parameters,
          reason: "no canonical equivalent",
        });
      // Preserve any extra fields (e.g. config from other adapters) as skill config
      const config: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(t as Record<string, unknown>)) {
        if (!knownToolKeys.has(k)) config[k] = v;
      }
      return {
        name: t.name,
        enabled: t.enabled ?? true,
        ...(Object.keys(config).length > 0 && { config }),
      };
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
      if (memSrc.graph_db !== undefined)
        unmapped.push({
          source_path: "memory.graph_db",
          value: memSrc.graph_db,
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
      config: { agent, channels, memory, skills, unmapped },
    };
  },

  parsePersona: makeParsePersona("json", "agent.json"),

  writePersona: makeWritePersona("json", "agent.json"),
};
