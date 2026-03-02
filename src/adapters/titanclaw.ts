// Adapter: TitanClaw
// Schema version pinned to: titan-ai/titanclaw@v1.0.3
// Config format: TOML (~/.titanclaw/config.toml)
// TitanClaw is Rust-based, enterprise-focused. Uses [[agents]] array but
// single-agent in practice (first entry used). Explicit [provider] block.
// Skills map to [plugins] array. Database uses [persistence] block.

import type {
  Adapter,
  AdapterResult,
  CanonicalChannel,
  CanonicalConfig,
  UnmappedField,
} from "../types.js";
import { makeParsePersona, makeWritePersona } from "../persona.js";

interface TitanClawConfig {
  agents?: Array<{
    id?: string;
    name?: string;
    system_prompt?: string;
    // flagged
    persona?: string;
    max_history?: number;
    tools?: string[];
  }>;
  provider?: {
    backend?: string; // provider name
    model?: string;
    api_key_env?: string; // flagged
    temperature?: number;
    max_tokens?: number;
    // flagged
    top_p?: number;
    frequency_penalty?: number;
    timeout_ms?: number;
  };
  channels?: Array<{
    type: string;
    bot_token_env?: string;
    bot_token?: string;
    access_token_env?: string;
    app_token_env?: string;
    password_env?: string;
    guild_id?: string;
    chat_id?: string;
    workspace?: string;
    server_url?: string;
    room_id?: string;
    channel_id?: string;
    phone_number?: string;
    signal_cli_path?: string;
    webhook_url?: string;
    imap_host?: string;
    imap_port?: number;
    smtp_host?: string;
    smtp_port?: number;
    from_address?: string;
    // flagged
    priority?: number;
    [key: string]: unknown;
  }>;
  plugins?: Array<{
    name: string;
    enabled?: boolean;
    // flagged
    config?: Record<string, unknown>;
  }>;
  persistence?: {
    driver?: string; // "sqlite" | "postgres"
    path?: string;
    url?: string;
    // flagged
    pool_min?: number;
    pool_max?: number;
  };
  // flagged
  log_level?: unknown;
  metrics?: unknown;
  tracing?: unknown;
}

export const TitanClawAdapter: Adapter = {
  cloneName: "titanclaw",
  schemaVersion: "v1.0.3",
  configPatterns: ["config.toml", ".titanclaw/config.toml"],
  defaultOutputFile: "config.toml",

  write(config: CanonicalConfig): string {
    const lines: string[] = [];

    // Recover full agents array if available from unmapped (roundtrip)
    const recoveredAgentsEntry = config.unmapped.find(
      (u) => u.source_path === "agents" && Array.isArray(u.value),
    );
    const unmappedRest = config.unmapped.filter(
      (u) => !(u.source_path === "agents" && Array.isArray(u.value)),
    );

    if (recoveredAgentsEntry) {
      for (const [i, a] of (
        recoveredAgentsEntry.value as Array<Record<string, unknown>>
      ).entries()) {
        const entry =
          i === 0
            ? {
                ...a,
                name: config.agent.name,
                ...(config.agent.system_prompt !== undefined && {
                  system_prompt: config.agent.system_prompt,
                }),
              }
            : a;
        lines.push("[[agents]]");
        if (entry.id !== undefined)
          lines.push(`id = "${esc(String(entry.id))}"`);
        lines.push(`name = "${esc(String(entry.name ?? ""))}"`);
        if (entry.system_prompt !== undefined)
          lines.push(`system_prompt = "${esc(String(entry.system_prompt))}"`);
        if (entry.persona !== undefined)
          lines.push(`persona = "${esc(String(entry.persona))}"`);
        if (entry.max_history !== undefined)
          lines.push(`max_history = ${entry.max_history}`);
        if (entry.tools !== undefined)
          lines.push(`tools = ${JSON.stringify(entry.tools)}`);
        lines.push("");
      }
    } else {
      lines.push("[[agents]]");
      lines.push(`name = "${esc(config.agent.name)}"`);
      if (config.agent.system_prompt)
        lines.push(`system_prompt = "${esc(config.agent.system_prompt)}"`);
      lines.push("");
    }

    lines.push("[provider]");
    lines.push(`backend = "${esc(config.agent.provider)}"`);
    lines.push(`model = "${esc(config.agent.model)}"`);
    if (config.agent.temperature !== undefined)
      lines.push(`temperature = ${config.agent.temperature}`);
    if (config.agent.max_tokens !== undefined)
      lines.push(`max_tokens = ${config.agent.max_tokens}`);

    if (config.memory) {
      lines.push("");
      lines.push("[persistence]");
      lines.push(`driver = "${esc(config.memory.backend)}"`);
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
      if (ch.app_token_env)
        lines.push(`app_token_env = "${esc(ch.app_token_env)}"`);
      if (ch.password_env)
        lines.push(`password_env = "${esc(ch.password_env)}"`);
      if (ch.guild_id) lines.push(`guild_id = "${esc(ch.guild_id)}"`);
      if (ch.chat_id) lines.push(`chat_id = "${esc(ch.chat_id)}"`);
      if (ch.workspace) lines.push(`workspace = "${esc(ch.workspace)}"`);
      if (ch.server_url) lines.push(`server_url = "${esc(ch.server_url)}"`);
      if (ch.room_id) lines.push(`room_id = "${esc(ch.room_id)}"`);
      if (ch.channel_id) lines.push(`channel_id = "${esc(ch.channel_id)}"`);
      if (ch.phone_number)
        lines.push(`phone_number = "${esc(ch.phone_number)}"`);
      if (ch.signal_cli_path)
        lines.push(`signal_cli_path = "${esc(ch.signal_cli_path)}"`);
      if (ch.webhook_url) lines.push(`webhook_url = "${esc(ch.webhook_url)}"`);
      if (ch.imap_host) lines.push(`imap_host = "${esc(ch.imap_host)}"`);
      if (ch.imap_port) lines.push(`imap_port = ${ch.imap_port}`);
      if (ch.smtp_host) lines.push(`smtp_host = "${esc(ch.smtp_host)}"`);
      if (ch.smtp_port) lines.push(`smtp_port = ${ch.smtp_port}`);
      if (ch.from_address)
        lines.push(`from_address = "${esc(ch.from_address)}"`);
      for (const [k, v] of Object.entries(ch.extra))
        lines.push(`${k} = ${tomlVal(v)}`);
    }

    for (const s of config.skills) {
      lines.push("");
      lines.push("[[plugins]]");
      lines.push(`name = "${esc(s.name)}"`);
      lines.push(`enabled = ${s.enabled}`);
    }

    if (unmappedRest.length > 0) {
      lines.push("");
      lines.push("# --- UNMAPPED FIELDS ---");
      for (const u of unmappedRest)
        lines.push(`# ${u.source_path}: ${u.reason}`);
    }

    return lines.join("\n") + "\n";
  },

  parse(_configPath: string, raw: unknown): AdapterResult {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw))
      return { ok: false, error: "expected object config" };
    const src = raw as TitanClawConfig;
    const unmapped: UnmappedField[] = [];

    const providerSrc = src.provider ?? {};

    // Use first agent entry as canonical
    const agents = src.agents ?? [];
    const primaryAgent = agents[0] ?? {};
    if (agents.length > 1)
      unmapped.push({
        source_path: "agents",
        value: agents,
        reason: "multi-agent array — only first agent exported",
      });

    if (primaryAgent.persona !== undefined)
      unmapped.push({
        source_path: "agents[0].persona",
        value: primaryAgent.persona,
        reason: "no canonical equivalent",
      });
    if (primaryAgent.max_history !== undefined)
      unmapped.push({
        source_path: "agents[0].max_history",
        value: primaryAgent.max_history,
        reason: "no canonical equivalent",
      });
    if (primaryAgent.tools !== undefined)
      unmapped.push({
        source_path: "agents[0].tools",
        value: primaryAgent.tools,
        reason: "no canonical equivalent — use skills/plugins",
      });
    if (providerSrc.api_key_env !== undefined)
      unmapped.push({
        source_path: "provider.api_key_env",
        value: providerSrc.api_key_env,
        reason: "no canonical equivalent — set via environment",
      });
    if (providerSrc.top_p !== undefined)
      unmapped.push({
        source_path: "provider.top_p",
        value: providerSrc.top_p,
        reason: "no canonical equivalent",
      });
    if (providerSrc.frequency_penalty !== undefined)
      unmapped.push({
        source_path: "provider.frequency_penalty",
        value: providerSrc.frequency_penalty,
        reason: "no canonical equivalent",
      });
    if (providerSrc.timeout_ms !== undefined)
      unmapped.push({
        source_path: "provider.timeout_ms",
        value: providerSrc.timeout_ms,
        reason: "no canonical equivalent",
      });
    if (src.log_level !== undefined)
      unmapped.push({
        source_path: "log_level",
        value: src.log_level,
        reason: "no canonical equivalent",
      });
    if (src.metrics !== undefined)
      unmapped.push({
        source_path: "metrics",
        value: src.metrics,
        reason: "no canonical equivalent",
      });
    if (src.tracing !== undefined)
      unmapped.push({
        source_path: "tracing",
        value: src.tracing,
        reason: "no canonical equivalent",
      });

    const agent = {
      name: primaryAgent.name ?? "titanclaw-agent",
      model: providerSrc.model ?? "unknown",
      provider: providerSrc.backend ?? "anthropic",
      ...(primaryAgent.system_prompt !== undefined && {
        system_prompt: primaryAgent.system_prompt,
      }),
      ...(providerSrc.temperature !== undefined && {
        temperature: providerSrc.temperature,
      }),
      ...(providerSrc.max_tokens !== undefined && {
        max_tokens: providerSrc.max_tokens,
      }),
    };

    const knownChannelKeys = new Set([
      "type",
      "bot_token_env",
      "bot_token",
      "access_token_env",
      "app_token_env",
      "password_env",
      "guild_id",
      "chat_id",
      "workspace",
      "server_url",
      "room_id",
      "channel_id",
      "phone_number",
      "signal_cli_path",
      "webhook_url",
      "imap_host",
      "imap_port",
      "smtp_host",
      "smtp_port",
      "from_address",
      "priority",
    ]);
    const channels: CanonicalChannel[] = (src.channels ?? []).map((ch, i) => {
      if (ch.priority !== undefined)
        unmapped.push({
          source_path: `channels[${i}].priority`,
          value: ch.priority,
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
        access_token_env: ch.access_token_env,
        app_token_env: ch.app_token_env,
        password_env: ch.password_env,
        guild_id: ch.guild_id,
        chat_id: ch.chat_id,
        workspace: ch.workspace,
        server_url: ch.server_url,
        room_id: ch.room_id,
        channel_id: ch.channel_id,
        phone_number: ch.phone_number,
        signal_cli_path: ch.signal_cli_path,
        webhook_url: ch.webhook_url,
        imap_host: ch.imap_host,
        imap_port: ch.imap_port,
        smtp_host: ch.smtp_host,
        smtp_port: ch.smtp_port,
        from_address: ch.from_address,
        extra,
      };
    });

    const persistSrc = src.persistence;
    let memory:
      | {
          backend: "sqlite" | "file" | "postgres" | "unknown";
          path?: string;
          connection_string?: string;
        }
      | undefined;
    if (persistSrc) {
      if (persistSrc.pool_min !== undefined)
        unmapped.push({
          source_path: "persistence.pool_min",
          value: persistSrc.pool_min,
          reason: "no canonical equivalent",
        });
      if (persistSrc.pool_max !== undefined)
        unmapped.push({
          source_path: "persistence.pool_max",
          value: persistSrc.pool_max,
          reason: "no canonical equivalent",
        });
      const d = persistSrc.driver;
      const backend: "sqlite" | "file" | "postgres" | "unknown" =
        d === "sqlite" || d === "file" || d === "postgres" ? d : "unknown";
      memory = {
        backend,
        ...(persistSrc.path && { path: persistSrc.path }),
        ...(persistSrc.url && { connection_string: persistSrc.url }),
      };
    }

    const skills = (src.plugins ?? []).map((p) => {
      if (p.config !== undefined)
        unmapped.push({
          source_path: `plugins[${p.name}].config`,
          value: p.config,
          reason: "no canonical equivalent",
        });
      return { name: p.name, enabled: p.enabled ?? true };
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
