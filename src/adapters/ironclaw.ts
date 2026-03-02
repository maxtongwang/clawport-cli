// Adapter: IronClaw
// Schema version pinned to: nearai/ironclaw@v0.12.0
// Config format: TOML (~/.ironclaw/settings.toml) + .env for bootstrap
// IronClaw uses an [llm] block (not [agent]) and [[channels]] array like zeroclaw.
// DATABASE_URL maps to memory.connection_string (postgres backend).

import type {
  Adapter,
  AdapterResult,
  CanonicalChannel,
  CanonicalConfig,
  UnmappedField,
} from "../types.js";

interface IronClawConfig {
  agent?: {
    name?: string;
    system_prompt?: string;
    // flagged: ironclaw-specific
    max_tool_iterations?: number;
    memory_window?: number;
  };
  llm?: {
    backend?: string; // "anthropic" | "openai" | "groq" etc. — maps to provider
    model?: string;
    api_key_env?: string; // env var holding the API key
    base_url?: string; // optional custom endpoint — flagged
    // flagged
    timeout_secs?: number;
    retry_limit?: number;
    temperature?: number;
    max_tokens?: number;
  };
  database?: {
    url_env?: string; // env var holding DATABASE_URL (postgres)
    url?: string; // literal DB URL — warn
    // flagged
    pool_size?: number;
    idle_timeout_secs?: number;
  };
  channels?: Array<{
    type: string;
    bot_token_env?: string;
    bot_token?: string;
    guild_id?: string;
    chat_id?: string;
    server_url?: string;
    access_token_env?: string;
    app_token_env?: string;
    workspace?: string;
    phone_number?: string;
    room_id?: string;
    channel_id?: string;
    webhook_url?: string;
    // flagged: ironclaw-specific
    rate_limit_per_min?: number;
    allowed_users?: unknown;
    [key: string]: unknown;
  }>;
  // flagged top-level
  telemetry?: unknown;
  log_level?: unknown;
  hooks?: unknown;
}

export const IronClawAdapter: Adapter = {
  cloneName: "ironclaw",
  schemaVersion: "v0.12.0",
  configPatterns: ["settings.toml", ".ironclaw/settings.toml"],
  defaultOutputFile: "settings.toml",

  write(config: CanonicalConfig): string {
    const lines: string[] = [];

    lines.push("[agent]");
    lines.push(`name = "${esc(config.agent.name)}"`);
    if (config.agent.system_prompt)
      lines.push(`system_prompt = "${esc(config.agent.system_prompt)}"`);

    lines.push("");
    lines.push("[llm]");
    lines.push(`backend = "${esc(config.agent.provider)}"`);
    lines.push(`model = "${esc(config.agent.model)}"`);
    if (config.agent.temperature !== undefined)
      lines.push(`temperature = ${config.agent.temperature}`);
    if (config.agent.max_tokens !== undefined)
      lines.push(`max_tokens = ${config.agent.max_tokens}`);

    if (config.memory) {
      lines.push("");
      lines.push("[database]");
      if (config.memory.connection_string)
        lines.push(`url = "${esc(config.memory.connection_string)}"`);
      else if (config.memory.path)
        lines.push(`url = "sqlite://${esc(config.memory.path)}"`);
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
      if (ch.app_token_env)
        lines.push(`app_token_env = "${esc(ch.app_token_env)}"`);
      if (ch.workspace) lines.push(`workspace = "${esc(ch.workspace)}"`);
      if (ch.guild_id) lines.push(`guild_id = "${esc(ch.guild_id)}"`);
      if (ch.chat_id) lines.push(`chat_id = "${esc(ch.chat_id)}"`);
      if (ch.server_url) lines.push(`server_url = "${esc(ch.server_url)}"`);
      if (ch.phone_number)
        lines.push(`phone_number = "${esc(ch.phone_number)}"`);
      if (ch.room_id) lines.push(`room_id = "${esc(ch.room_id)}"`);
      if (ch.channel_id) lines.push(`channel_id = "${esc(ch.channel_id)}"`);
      if (ch.webhook_url) lines.push(`webhook_url = "${esc(ch.webhook_url)}"`);
      for (const [k, v] of Object.entries(ch.extra))
        lines.push(`${k} = ${tomlVal(v)}`);
    }

    if (config.skills.length > 0) {
      lines.push("");
      lines.push("[[skills]]");
      for (const s of config.skills) {
        lines.push(`name = "${esc(s.name)}"`);
        lines.push(`enabled = ${s.enabled}`);
      }
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
    const src = raw as IronClawConfig;
    const unmapped: UnmappedField[] = [];

    const agentSrc = src.agent ?? {};
    const llmSrc = src.llm ?? {};

    if (agentSrc.max_tool_iterations !== undefined)
      unmapped.push({
        source_path: "agent.max_tool_iterations",
        value: agentSrc.max_tool_iterations,
        reason: "no canonical equivalent",
      });
    if (agentSrc.memory_window !== undefined)
      unmapped.push({
        source_path: "agent.memory_window",
        value: agentSrc.memory_window,
        reason: "no canonical equivalent",
      });
    if (llmSrc.base_url !== undefined)
      unmapped.push({
        source_path: "llm.base_url",
        value: llmSrc.base_url,
        reason: "no canonical equivalent",
      });
    if (llmSrc.timeout_secs !== undefined)
      unmapped.push({
        source_path: "llm.timeout_secs",
        value: llmSrc.timeout_secs,
        reason: "no canonical equivalent",
      });
    if (llmSrc.retry_limit !== undefined)
      unmapped.push({
        source_path: "llm.retry_limit",
        value: llmSrc.retry_limit,
        reason: "no canonical equivalent",
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
    if (src.hooks !== undefined)
      unmapped.push({
        source_path: "hooks",
        value: src.hooks,
        reason: "no canonical equivalent",
      });

    const agent = {
      name: agentSrc.name ?? "unnamed",
      model: llmSrc.model ?? "unknown",
      provider: llmSrc.backend ?? "anthropic",
      ...(agentSrc.system_prompt !== undefined && {
        system_prompt: agentSrc.system_prompt,
      }),
      ...(llmSrc.temperature !== undefined && {
        temperature: llmSrc.temperature,
      }),
      ...(llmSrc.max_tokens !== undefined && { max_tokens: llmSrc.max_tokens }),
    };

    const knownChannelKeys = new Set([
      "type",
      "bot_token_env",
      "bot_token",
      "guild_id",
      "chat_id",
      "server_url",
      "access_token_env",
      "app_token_env",
      "workspace",
      "phone_number",
      "room_id",
      "channel_id",
      "webhook_url",
      "rate_limit_per_min",
      "allowed_users",
    ]);
    const channels: CanonicalChannel[] = (src.channels ?? []).map((ch, i) => {
      if (ch.rate_limit_per_min !== undefined)
        unmapped.push({
          source_path: `channels[${i}].rate_limit_per_min`,
          value: ch.rate_limit_per_min,
          reason: "no canonical equivalent",
        });
      if (ch.allowed_users !== undefined)
        unmapped.push({
          source_path: `channels[${i}].allowed_users`,
          value: ch.allowed_users,
          reason: "no canonical equivalent",
        });
      const extra: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(ch)) {
        if (!knownChannelKeys.has(k)) extra[k] = v;
      }
      return {
        type: ch.type,
        bot_token_env: ch.bot_token_env,
        bot_token: ch.bot_token,
        guild_id: ch.guild_id,
        chat_id: ch.chat_id,
        server_url: ch.server_url,
        access_token_env: ch.access_token_env,
        app_token_env: ch.app_token_env,
        workspace: ch.workspace,
        phone_number: ch.phone_number,
        room_id: ch.room_id,
        channel_id: ch.channel_id,
        webhook_url: ch.webhook_url,
        extra,
      };
    });

    const dbSrc = src.database;
    let memory:
      | {
          backend: "sqlite" | "file" | "postgres" | "unknown";
          connection_string?: string;
        }
      | undefined;
    if (dbSrc) {
      if (dbSrc.pool_size !== undefined)
        unmapped.push({
          source_path: "database.pool_size",
          value: dbSrc.pool_size,
          reason: "no canonical equivalent",
        });
      if (dbSrc.idle_timeout_secs !== undefined)
        unmapped.push({
          source_path: "database.idle_timeout_secs",
          value: dbSrc.idle_timeout_secs,
          reason: "no canonical equivalent",
        });
      const connStr =
        dbSrc.url ?? (dbSrc.url_env ? `\${${dbSrc.url_env}}` : undefined);
      const backend = connStr?.startsWith("postgres")
        ? ("postgres" as const)
        : ("unknown" as const);
      memory = {
        backend,
        ...(connStr !== undefined && { connection_string: connStr }),
      };
    }

    return {
      ok: true,
      config: { agent, channels, memory, skills: [], unmapped },
    };
  },
};

function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
function tomlVal(v: unknown): string {
  if (typeof v === "string") return `"${esc(v)}"`;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return `"${esc(JSON.stringify(v))}"`;
}
