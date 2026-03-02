// Adapter: ZeroClaw
// Schema version pinned to: zeroclaw-labs/zeroclaw@b91e44f (2026-02-10)
// Config format: TOML (~/.zeroclaw/config.toml)
// Field mapping is exact — every field explicitly handled or flagged unmapped.

import type {
  Adapter,
  AdapterResult,
  CanonicalChannel,
  CanonicalConfig,
  UnmappedField,
} from "../types.js";
import { makeParsePersona, makeWritePersona } from "../persona.js";

// Exact shape of zeroclaw config.toml as of schema_version above
interface ZeroClawConfig {
  agent?: {
    name?: string;
    model?: string;
    provider?: string;
    system_prompt?: string;
    // zeroclaw uses [llm] block for these — but some configs put them here too
    temperature?: number;
    max_tokens?: number;
    // flagged: zeroclaw-specific
    reflection?: boolean;
    tool_choice?: string;
  };
  llm?: {
    temperature?: number;
    max_tokens?: number;
    // flagged: no canonical equivalent
    seed?: number;
    stream?: boolean;
  };
  // zeroclaw uses array of channel tables: [[channels]]
  channels?: Array<{
    type: string;
    bot_token?: string;
    guild_id?: string; // discord
    chat_id?: string; // telegram
    workspace?: string; // slack
    webhook_secret?: string; // flagged
    [key: string]: unknown;
  }>;
  memory?: {
    backend?: string;
    path?: string;
    connection_string?: string;
    // flagged: zeroclaw-specific
    embedding_model?: string;
    vector_dimensions?: number;
  };
  skills?: Array<{
    name: string;
    enabled?: boolean;
    config?: Record<string, unknown>;
    // flagged: zeroclaw-specific
    timeout_ms?: number;
  }>;
  // flagged top-level fields
  telemetry?: unknown;
  log_level?: unknown;
}

export const ZeroClawAdapter: Adapter = {
  cloneName: "zeroclaw",
  schemaVersion: "b91e44f",
  configPatterns: ["config.toml", ".zeroclaw/config.toml", "zeroclaw.toml"],
  defaultOutputFile: "config.toml",

  write(config: CanonicalConfig): string {
    // Build zeroclaw TOML — zeroclaw uses [[channels]] array, not a keyed map
    const lines: string[] = [];

    lines.push("[agent]");
    lines.push(`name = "${esc(config.agent.name)}"`);
    lines.push(`model = "${esc(config.agent.model)}"`);
    lines.push(`provider = "${esc(config.agent.provider)}"`);
    if (config.agent.system_prompt !== undefined) {
      lines.push(`system_prompt = "${esc(config.agent.system_prompt)}"`);
    }

    const hasLlm =
      config.agent.temperature !== undefined ||
      config.agent.max_tokens !== undefined;
    if (hasLlm) {
      lines.push("");
      lines.push("[llm]");
      if (config.agent.temperature !== undefined)
        lines.push(`temperature = ${config.agent.temperature}`);
      if (config.agent.max_tokens !== undefined)
        lines.push(`max_tokens = ${config.agent.max_tokens}`);
    }

    if (config.memory) {
      lines.push("");
      lines.push("[memory]");
      lines.push(`backend = "${esc(config.memory.backend)}"`);
      if (config.memory.path) lines.push(`path = "${esc(config.memory.path)}"`);
      if (config.memory.connection_string)
        lines.push(
          `connection_string = "${esc(config.memory.connection_string)}"`,
        );
    }

    // zeroclaw: [[channels]] array
    for (const ch of config.channels) {
      lines.push("");
      lines.push("[[channels]]");
      lines.push(`type = "${esc(ch.type)}"`);
      if (ch.bot_token) lines.push(`bot_token = "${esc(ch.bot_token)}"`);
      if (ch.bot_token_env) lines.push(`bot_token = "\${${ch.bot_token_env}}"`);
      if (ch.access_token)
        lines.push(`access_token = "${esc(ch.access_token)}"`);
      if (ch.access_token_env)
        lines.push(`access_token = "\${${ch.access_token_env}}"`);
      if (ch.app_token_env) lines.push(`app_token = "\${${ch.app_token_env}}"`);
      if (ch.password_env) lines.push(`password = "\${${ch.password_env}}"`);
      if (ch.server_url) lines.push(`server_url = "${esc(ch.server_url)}"`);
      if (ch.phone_number)
        lines.push(`phone_number = "${esc(ch.phone_number)}"`);
      if (ch.signal_cli_path)
        lines.push(`signal_cli_path = "${esc(ch.signal_cli_path)}"`);
      if (ch.guild_id) lines.push(`guild_id = "${esc(ch.guild_id)}"`);
      if (ch.chat_id) lines.push(`chat_id = "${esc(ch.chat_id)}"`);
      if (ch.workspace) lines.push(`workspace = "${esc(ch.workspace)}"`);
      if (ch.room_id) lines.push(`room_id = "${esc(ch.room_id)}"`);
      if (ch.channel_id) lines.push(`channel_id = "${esc(ch.channel_id)}"`);
      if (ch.imap_host) lines.push(`imap_host = "${esc(ch.imap_host)}"`);
      if (ch.imap_port) lines.push(`imap_port = ${ch.imap_port}`);
      if (ch.smtp_host) lines.push(`smtp_host = "${esc(ch.smtp_host)}"`);
      if (ch.smtp_port) lines.push(`smtp_port = ${ch.smtp_port}`);
      if (ch.from_address)
        lines.push(`from_address = "${esc(ch.from_address)}"`);
      if (ch.webhook_url) lines.push(`webhook_url = "${esc(ch.webhook_url)}"`);
      for (const [k, v] of Object.entries(ch.extra)) {
        lines.push(`${k} = ${tomlVal(v)}`);
      }
    }

    // zeroclaw: [[skills]] array
    for (const skill of config.skills) {
      lines.push("");
      lines.push("[[skills]]");
      lines.push(`name = "${esc(skill.name)}"`);
      lines.push(`enabled = ${skill.enabled}`);
    }

    if (config.unmapped.length > 0) {
      lines.push("");
      lines.push("# --- UNMAPPED FIELDS (review required) ---");
      for (const u of config.unmapped) {
        lines.push(
          `# ${u.source_path}: ${u.reason} | value: ${JSON.stringify(u.value)}`,
        );
      }
    }

    return lines.join("\n") + "\n";
  },

  parse(_configPath: string, raw: unknown): AdapterResult {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw))
      return { ok: false, error: "expected object config" };
    const src = raw as ZeroClawConfig;
    const unmapped: UnmappedField[] = [];

    // --- agent block ---
    const agentSrc = src.agent ?? {};
    const llmSrc = src.llm ?? {};

    const temperature = agentSrc.temperature ?? llmSrc.temperature;
    const max_tokens = agentSrc.max_tokens ?? llmSrc.max_tokens;

    if (agentSrc.reflection !== undefined) {
      unmapped.push({
        source_path: "agent.reflection",
        value: agentSrc.reflection,
        reason: "no canonical equivalent",
      });
    }
    if (agentSrc.tool_choice !== undefined) {
      unmapped.push({
        source_path: "agent.tool_choice",
        value: agentSrc.tool_choice,
        reason: "no canonical equivalent",
      });
    }
    if (llmSrc.seed !== undefined) {
      unmapped.push({
        source_path: "llm.seed",
        value: llmSrc.seed,
        reason: "no canonical equivalent",
      });
    }
    if (llmSrc.stream !== undefined) {
      unmapped.push({
        source_path: "llm.stream",
        value: llmSrc.stream,
        reason: "no canonical equivalent",
      });
    }
    if (src.telemetry !== undefined) {
      unmapped.push({
        source_path: "telemetry",
        value: src.telemetry,
        reason: "no canonical equivalent",
      });
    }
    if (src.log_level !== undefined) {
      unmapped.push({
        source_path: "log_level",
        value: src.log_level,
        reason: "no canonical equivalent",
      });
    }

    const agent = {
      name: agentSrc.name ?? "unnamed",
      model: agentSrc.model ?? "unknown",
      provider: agentSrc.provider ?? "anthropic",
      ...(agentSrc.system_prompt !== undefined && {
        system_prompt: agentSrc.system_prompt,
      }),
      ...(temperature !== undefined && { temperature }),
      ...(max_tokens !== undefined && { max_tokens }),
    };

    // --- channels block ---
    // zeroclaw uses [[channels]] array, not a keyed map like openclaw
    const knownChannelKeys = new Set([
      "type",
      "bot_token",
      "guild_id",
      "chat_id",
      "workspace",
    ]);
    const channels: CanonicalChannel[] = (src.channels ?? []).map((ch, i) => {
      const extra: Record<string, unknown> = {};

      if (ch.webhook_secret !== undefined) {
        unmapped.push({
          source_path: `channels[${i}].webhook_secret`,
          value: ch.webhook_secret,
          reason: "no canonical equivalent",
        });
      }

      // Preserve any unknown keys in extra
      for (const [k, v] of Object.entries(ch)) {
        if (!knownChannelKeys.has(k) && k !== "webhook_secret") {
          extra[k] = v;
        }
      }

      return {
        type: ch.type,
        bot_token: ch.bot_token,
        guild_id: ch.guild_id,
        chat_id: ch.chat_id,
        workspace: ch.workspace,
        extra,
      };
    });

    // --- memory block ---
    const memSrc = src.memory;
    let memory:
      | {
          backend: "sqlite" | "file" | "postgres" | "unknown";
          path?: string;
          connection_string?: string;
        }
      | undefined;
    if (memSrc) {
      if (memSrc.embedding_model !== undefined) {
        unmapped.push({
          source_path: "memory.embedding_model",
          value: memSrc.embedding_model,
          reason: "no canonical equivalent",
        });
      }
      if (memSrc.vector_dimensions !== undefined) {
        unmapped.push({
          source_path: "memory.vector_dimensions",
          value: memSrc.vector_dimensions,
          reason: "no canonical equivalent",
        });
      }
      const backend =
        memSrc.backend === "sqlite" ||
        memSrc.backend === "file" ||
        memSrc.backend === "postgres"
          ? memSrc.backend
          : ("unknown" as const);
      memory = {
        backend,
        ...(memSrc.path !== undefined && { path: memSrc.path }),
        ...(memSrc.connection_string !== undefined && {
          connection_string: memSrc.connection_string,
        }),
      };
    }

    // --- skills block ---
    const skills = (src.skills ?? []).map((s, i) => {
      if (s.timeout_ms !== undefined) {
        unmapped.push({
          source_path: `skills[${i}].timeout_ms`,
          value: s.timeout_ms,
          reason: "no canonical equivalent",
        });
      }
      return { name: s.name, enabled: s.enabled ?? true, config: s.config };
    });

    return {
      ok: true,
      config: { agent, channels, memory, skills, unmapped },
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
