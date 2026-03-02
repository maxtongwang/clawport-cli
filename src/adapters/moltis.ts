// Adapter: Moltis
// Schema version pinned to: moltis-org/moltis@v0.10.6
// Config format: TOML (moltis.toml)
// Moltis uses [[providers]] array for multi-provider routing with priority fallback.
// First provider by priority is used as the canonical agent provider/model.

import type {
  Adapter,
  AdapterResult,
  CanonicalChannel,
  CanonicalConfig,
  UnmappedField,
} from "../types.js";

interface MoltisConfig {
  agent?: {
    name?: string;
    system_prompt?: string;
    // flagged
    max_tool_iterations?: number;
    hooks?: unknown;
  };
  providers?: Array<{
    name: string; // provider id: "anthropic", "openai", "groq" etc.
    model: string;
    priority?: number; // lower = higher priority; flagged
    api_key_env?: string; // flagged
    temperature?: number;
    max_tokens?: number;
    // flagged
    fallback_on_error?: boolean;
    timeout_ms?: number;
  }>;
  channels?: {
    discord?: {
      bot_token_env?: string;
      bot_token?: string;
      guild_id?: string;
      channel_id?: string;
    };
    telegram?: { bot_token_env?: string; bot_token?: string; chat_id?: string };
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
    whatsapp?: { access_token_env?: string; phone_number?: string };
    signal?: {
      access_token_env?: string;
      signal_cli_path?: string;
      phone_number?: string;
    };
    email?: {
      password_env?: string;
      imap_host?: string;
      imap_port?: number;
      smtp_host?: string;
      smtp_port?: number;
      from_address?: string;
    };
    [key: string]: Record<string, unknown> | undefined;
  };
  memory?: {
    backend?: string;
    path?: string;
    connection_string?: string;
  };
  // flagged
  log_level?: unknown;
  telemetry?: unknown;
  data_dir?: string;
}

export const MoltisAdapter: Adapter = {
  cloneName: "moltis",
  schemaVersion: "v0.10.6",
  configPatterns: ["moltis.toml", ".moltis/moltis.toml"],
  defaultOutputFile: "moltis.toml",

  write(config: CanonicalConfig): string {
    const lines: string[] = [];

    lines.push("[agent]");
    lines.push(`name = "${esc(config.agent.name)}"`);
    if (config.agent.system_prompt)
      lines.push(`system_prompt = "${esc(config.agent.system_prompt)}"`);

    lines.push("");
    lines.push("[[providers]]");
    lines.push(`name = "${esc(config.agent.provider)}"`);
    lines.push(`model = "${esc(config.agent.model)}"`);
    lines.push(`priority = 1`);
    if (config.agent.temperature !== undefined)
      lines.push(`temperature = ${config.agent.temperature}`);
    if (config.agent.max_tokens !== undefined)
      lines.push(`max_tokens = ${config.agent.max_tokens}`);

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

    const chanSrc = config.channels;
    for (const ch of chanSrc) {
      lines.push("");
      lines.push(`[channels.${ch.type}]`);
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
      if (ch.password_env)
        lines.push(`password_env = "${esc(ch.password_env)}"`);
      if (ch.server_url) lines.push(`server_url = "${esc(ch.server_url)}"`);
      if (ch.guild_id) lines.push(`guild_id = "${esc(ch.guild_id)}"`);
      if (ch.chat_id) lines.push(`chat_id = "${esc(ch.chat_id)}"`);
      if (ch.workspace) lines.push(`workspace = "${esc(ch.workspace)}"`);
      if (ch.room_id) lines.push(`room_id = "${esc(ch.room_id)}"`);
      if (ch.channel_id) lines.push(`channel_id = "${esc(ch.channel_id)}"`);
      if (ch.phone_number)
        lines.push(`phone_number = "${esc(ch.phone_number)}"`);
      if (ch.signal_cli_path)
        lines.push(`signal_cli_path = "${esc(ch.signal_cli_path)}"`);
      if (ch.imap_host) lines.push(`imap_host = "${esc(ch.imap_host)}"`);
      if (ch.imap_port) lines.push(`imap_port = ${ch.imap_port}`);
      if (ch.smtp_host) lines.push(`smtp_host = "${esc(ch.smtp_host)}"`);
      if (ch.smtp_port) lines.push(`smtp_port = ${ch.smtp_port}`);
      if (ch.from_address)
        lines.push(`from_address = "${esc(ch.from_address)}"`);
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
    const src = raw as MoltisConfig;
    const unmapped: UnmappedField[] = [];

    const agentSrc = src.agent ?? {};

    if (agentSrc.max_tool_iterations !== undefined)
      unmapped.push({
        source_path: "agent.max_tool_iterations",
        value: agentSrc.max_tool_iterations,
        reason: "no canonical equivalent",
      });
    if (agentSrc.hooks !== undefined)
      unmapped.push({
        source_path: "agent.hooks",
        value: agentSrc.hooks,
        reason: "no canonical equivalent",
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

    // Sort providers by priority (ascending), use lowest priority number as primary
    const sortedProviders = [...(src.providers ?? [])].sort(
      (a, b) => (a.priority ?? 99) - (b.priority ?? 99),
    );
    const primary = sortedProviders[0];

    // Flag non-primary providers
    if (sortedProviders.length > 1) {
      unmapped.push({
        source_path: "providers",
        value: sortedProviders.slice(1).map((p) => `${p.name}/${p.model}`),
        reason:
          "multi-provider fallback chain — only primary provider exported",
      });
    }
    if (primary?.priority !== undefined)
      unmapped.push({
        source_path: "providers[0].priority",
        value: primary.priority,
        reason: "no canonical equivalent",
      });
    if (primary?.fallback_on_error !== undefined)
      unmapped.push({
        source_path: "providers[0].fallback_on_error",
        value: primary.fallback_on_error,
        reason: "no canonical equivalent",
      });
    if (primary?.timeout_ms !== undefined)
      unmapped.push({
        source_path: "providers[0].timeout_ms",
        value: primary.timeout_ms,
        reason: "no canonical equivalent",
      });
    if (primary?.api_key_env !== undefined)
      unmapped.push({
        source_path: "providers[0].api_key_env",
        value: primary.api_key_env,
        reason: "no canonical equivalent — set via environment",
      });

    const agent = {
      name: agentSrc.name ?? "moltis-agent",
      model: primary?.model ?? "unknown",
      provider: primary?.name ?? "anthropic",
      ...(agentSrc.system_prompt !== undefined && {
        system_prompt: agentSrc.system_prompt,
      }),
      ...(primary?.temperature !== undefined && {
        temperature: primary.temperature,
      }),
      ...(primary?.max_tokens !== undefined && {
        max_tokens: primary.max_tokens,
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
    if (chanSrc.whatsapp) {
      const w = chanSrc.whatsapp;
      channels.push({
        type: "whatsapp",
        access_token_env: w.access_token_env,
        phone_number: w.phone_number,
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
    if (chanSrc.email) {
      const e = chanSrc.email;
      channels.push({
        type: "email",
        password_env: e.password_env,
        imap_host: e.imap_host,
        imap_port: e.imap_port,
        smtp_host: e.smtp_host,
        smtp_port: e.smtp_port,
        from_address: e.from_address,
        extra: {},
      });
    }
    const known = new Set([
      "discord",
      "telegram",
      "slack",
      "matrix",
      "whatsapp",
      "signal",
      "email",
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
};

function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
function tomlVal(v: unknown): string {
  if (typeof v === "string") return `"${esc(v)}"`;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return `"${esc(JSON.stringify(v))}"`;
}
