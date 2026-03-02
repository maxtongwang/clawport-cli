// Adapter: RuVector
// Schema version pinned to: ru-ai/ruvector@v0.4.0
// Config format: TOML (~/.ruvector/config.toml)
// Rust-based self-learning agent with built-in vector database.
// Uses [llm] block for model. [vector_db] block is flagged (no canonical eq).

import type {
  Adapter,
  AdapterResult,
  CanonicalChannel,
  CanonicalConfig,
  UnmappedField,
} from "../types.js";
import { makeParsePersona, makeWritePersona } from "../persona.js";

interface RuVectorConfig {
  agent?: {
    name?: string;
    system_prompt?: string;
    // flagged
    learning_rate?: number;
    self_improve?: boolean;
  };
  llm?: {
    provider?: string;
    model?: string;
    api_key_env?: string; // flagged
    temperature?: number;
    max_tokens?: number;
    // flagged
    embedding_model?: string;
  };
  vector_db?: {
    // flagged: entire block has no canonical equivalent
    backend?: string;
    dimensions?: number;
    index_type?: string;
    path?: string;
  };
  channels?: Array<{
    type: string;
    bot_token_env?: string;
    bot_token?: string;
    access_token_env?: string;
    guild_id?: string;
    chat_id?: string;
    workspace?: string;
    server_url?: string;
    room_id?: string;
    channel_id?: string;
    webhook_url?: string;
    [key: string]: unknown;
  }>;
  storage?: {
    backend?: string; // "sqlite" | "postgres"
    path?: string;
    url?: string;
  };
  // flagged
  log_level?: unknown;
  telemetry?: unknown;
}

export const RuVectorAdapter: Adapter = {
  cloneName: "ruvector",
  schemaVersion: "v0.4.0",
  configPatterns: ["config.toml", ".ruvector/config.toml"],
  defaultOutputFile: "config.toml",

  write(config: CanonicalConfig): string {
    const lines: string[] = [];

    lines.push("[agent]");
    lines.push(`name = "${esc(config.agent.name)}"`);
    if (config.agent.system_prompt)
      lines.push(`system_prompt = "${esc(config.agent.system_prompt)}"`);

    lines.push("");
    lines.push("[llm]");
    lines.push(`provider = "${esc(config.agent.provider)}"`);
    lines.push(`model = "${esc(config.agent.model)}"`);
    if (config.agent.temperature !== undefined)
      lines.push(`temperature = ${config.agent.temperature}`);
    if (config.agent.max_tokens !== undefined)
      lines.push(`max_tokens = ${config.agent.max_tokens}`);

    if (config.memory) {
      lines.push("");
      lines.push("[storage]");
      lines.push(`backend = "${esc(config.memory.backend)}"`);
      if (config.memory.path) lines.push(`path = "${esc(config.memory.path)}"`);
      if (config.memory.connection_string)
        lines.push(`url = "${esc(config.memory.connection_string)}"`);
    }

    for (const ch of config.channels) {
      lines.push("");
      lines.push("[[channels]]");
      lines.push(`type = "${esc(ch.type)}"`);
      if (ch.bot_token_env)
        lines.push(`bot_token_env = "${esc(ch.bot_token_env)}"`);
      else if (ch.bot_token) {
        lines.push(`# WARNING: literal token`);
        lines.push(`bot_token = "${esc(ch.bot_token)}"`);
      }
      if (ch.access_token_env)
        lines.push(`access_token_env = "${esc(ch.access_token_env)}"`);
      if (ch.guild_id) lines.push(`guild_id = "${esc(ch.guild_id)}"`);
      if (ch.chat_id) lines.push(`chat_id = "${esc(ch.chat_id)}"`);
      if (ch.workspace) lines.push(`workspace = "${esc(ch.workspace)}"`);
      if (ch.server_url) lines.push(`server_url = "${esc(ch.server_url)}"`);
      if (ch.room_id) lines.push(`room_id = "${esc(ch.room_id)}"`);
      if (ch.channel_id) lines.push(`channel_id = "${esc(ch.channel_id)}"`);
      if (ch.webhook_url) lines.push(`webhook_url = "${esc(ch.webhook_url)}"`);
      for (const [k, v] of Object.entries(ch.extra))
        lines.push(`${k} = ${tomlVal(v)}`);
    }

    if (config.unmapped.length > 0) {
      lines.push("");
      lines.push("# --- UNMAPPED FIELDS ---");
      for (const u of config.unmapped)
        lines.push(`# ${u.source_path}: ${u.reason}`);
    }

    return lines.join("\n") + "\n";
  },

  parse(_configPath: string, raw: unknown): AdapterResult {
    const src = raw as RuVectorConfig;
    const unmapped: UnmappedField[] = [];

    const agentSrc = src.agent ?? {};
    const llmSrc = src.llm ?? {};

    if (agentSrc.learning_rate !== undefined)
      unmapped.push({
        source_path: "agent.learning_rate",
        value: agentSrc.learning_rate,
        reason: "no canonical equivalent",
      });
    if (agentSrc.self_improve !== undefined)
      unmapped.push({
        source_path: "agent.self_improve",
        value: agentSrc.self_improve,
        reason: "no canonical equivalent",
      });
    if (llmSrc.api_key_env !== undefined)
      unmapped.push({
        source_path: "llm.api_key_env",
        value: llmSrc.api_key_env,
        reason: "no canonical equivalent — set via environment",
      });
    if (llmSrc.embedding_model !== undefined)
      unmapped.push({
        source_path: "llm.embedding_model",
        value: llmSrc.embedding_model,
        reason: "no canonical equivalent",
      });
    if (src.vector_db !== undefined)
      unmapped.push({
        source_path: "vector_db",
        value: src.vector_db,
        reason: "vector database config — no canonical equivalent",
      });
    if (src.log_level !== undefined)
      unmapped.push({
        source_path: "log_level",
        value: src.log_level,
        reason: "no canonical equivalent",
      });
    if (src.telemetry !== undefined)
      unmapped.push({
        source_path: "telemetry",
        value: src.telemetry,
        reason: "no canonical equivalent",
      });

    const agent = {
      name: agentSrc.name ?? "ruvector-agent",
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

    const knownKeys = new Set([
      "type",
      "bot_token_env",
      "bot_token",
      "access_token_env",
      "guild_id",
      "chat_id",
      "workspace",
      "server_url",
      "room_id",
      "channel_id",
      "webhook_url",
    ]);
    const channels: CanonicalChannel[] = (src.channels ?? []).map((ch) => {
      const extra: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(ch)) {
        if (!knownKeys.has(k)) extra[k] = v;
      }
      return {
        type: ch.type,
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
    });

    const storageSrc = src.storage;
    let memory:
      | {
          backend: "sqlite" | "file" | "postgres" | "unknown";
          path?: string;
          connection_string?: string;
        }
      | undefined;
    if (storageSrc) {
      const b = storageSrc.backend;
      const backend: "sqlite" | "file" | "postgres" | "unknown" =
        b === "sqlite" || b === "file" || b === "postgres" ? b : "unknown";
      memory = {
        backend,
        ...(storageSrc.path && { path: storageSrc.path }),
        ...(storageSrc.url && { connection_string: storageSrc.url }),
      };
    }

    return {
      ok: true,
      config: { agent, channels, memory, skills: [], unmapped },
    };
  },

  parsePersona: makeParsePersona("toml", "agent.toml"),

  writePersona: makeWritePersona("toml", "agent.toml"),
};

function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
function tomlVal(v: unknown): string {
  if (typeof v === "string") return `"${esc(v)}"`;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return `"${esc(JSON.stringify(v))}"`;
}
