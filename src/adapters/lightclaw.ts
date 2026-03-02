// Adapter: LightClaw
// Schema version pinned to: fast-ai/lightclaw@v0.6.0
// Config format: TOML (~/.lightclaw/lightclaw.toml)
// LightClaw is Rust-based; uses [model] block (not [agent] or [llm]).
// Channels use [[channel]] array (plural key for each entry).
// Fast and minimal — few config options, many fields have no canonical match.

import type {
  Adapter,
  AdapterResult,
  CanonicalChannel,
  CanonicalConfig,
  UnmappedField,
} from "../types.js";
import { makeParsePersona, makeWritePersona } from "../persona.js";

interface LightClawConfig {
  agent?: {
    name?: string;
    system_prompt?: string;
    // flagged
    concurrency?: number;
  };
  model?: {
    provider?: string;
    name?: string; // model name — maps to agent.model
    api_key_env?: string; // flagged
    temperature?: number;
    max_tokens?: number;
    // flagged
    stream?: boolean;
  };
  channel?: Array<{
    type: string;
    token_env?: string;
    bot_token_env?: string;
    access_token_env?: string;
    guild_id?: string;
    chat_id?: string;
    server_url?: string;
    room_id?: string;
    channel_id?: string;
    phone_number?: string;
    webhook_url?: string;
    workspace?: string;
    // flagged
    workers?: number;
    [key: string]: unknown;
  }>;
  store?: {
    type?: string; // "sqlite" | "postgres" | "file"
    path?: string;
    url?: string;
  };
  skills?: Array<{
    name: string;
    enabled?: boolean;
  }>;
  // flagged
  log?: unknown;
  telemetry?: unknown;
}

export const LightClawAdapter: Adapter = {
  cloneName: "lightclaw",
  schemaVersion: "v0.6.0",
  configPatterns: ["lightclaw.toml", ".lightclaw/lightclaw.toml"],
  defaultOutputFile: "lightclaw.toml",

  write(config: CanonicalConfig): string {
    const lines: string[] = [];

    lines.push("[agent]");
    lines.push(`name = "${esc(config.agent.name)}"`);
    if (config.agent.system_prompt)
      lines.push(`system_prompt = "${esc(config.agent.system_prompt)}"`);

    lines.push("");
    lines.push("[model]");
    lines.push(`provider = "${esc(config.agent.provider)}"`);
    lines.push(`name = "${esc(config.agent.model)}"`);
    if (config.agent.temperature !== undefined)
      lines.push(`temperature = ${config.agent.temperature}`);
    if (config.agent.max_tokens !== undefined)
      lines.push(`max_tokens = ${config.agent.max_tokens}`);

    if (config.memory) {
      lines.push("");
      lines.push("[store]");
      lines.push(`type = "${esc(config.memory.backend)}"`);
      if (config.memory.path) lines.push(`path = "${esc(config.memory.path)}"`);
      if (config.memory.connection_string)
        lines.push(`url = "${esc(config.memory.connection_string)}"`);
    }

    for (const ch of config.channels) {
      lines.push("");
      lines.push("[[channel]]");
      lines.push(`type = "${esc(ch.type)}"`);
      if (ch.bot_token_env)
        lines.push(`bot_token_env = "${esc(ch.bot_token_env)}"`);
      else if (ch.bot_token) {
        lines.push(`# WARNING: literal token`);
        lines.push(`token_env = "${esc(ch.bot_token)}"`);
      }
      if (ch.access_token_env)
        lines.push(`access_token_env = "${esc(ch.access_token_env)}"`);
      if (ch.guild_id) lines.push(`guild_id = "${esc(ch.guild_id)}"`);
      if (ch.chat_id) lines.push(`chat_id = "${esc(ch.chat_id)}"`);
      if (ch.server_url) lines.push(`server_url = "${esc(ch.server_url)}"`);
      if (ch.room_id) lines.push(`room_id = "${esc(ch.room_id)}"`);
      if (ch.channel_id) lines.push(`channel_id = "${esc(ch.channel_id)}"`);
      if (ch.phone_number)
        lines.push(`phone_number = "${esc(ch.phone_number)}"`);
      if (ch.webhook_url) lines.push(`webhook_url = "${esc(ch.webhook_url)}"`);
      if (ch.workspace) lines.push(`workspace = "${esc(ch.workspace)}"`);
      for (const [k, v] of Object.entries(ch.extra))
        lines.push(`${k} = ${tomlVal(v)}`);
    }

    if (config.skills.length > 0) {
      for (const s of config.skills) {
        lines.push("");
        lines.push("[[skills]]");
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
    if (typeof raw !== "object" || raw === null || Array.isArray(raw))
      return { ok: false, error: "expected object config" };
    const src = raw as LightClawConfig;
    const unmapped: UnmappedField[] = [];

    const agentSrc = src.agent ?? {};
    const modelSrc = src.model ?? {};

    if (agentSrc.concurrency !== undefined)
      unmapped.push({
        source_path: "agent.concurrency",
        value: agentSrc.concurrency,
        reason: "no canonical equivalent",
      });
    if (modelSrc.api_key_env !== undefined)
      unmapped.push({
        source_path: "model.api_key_env",
        value: modelSrc.api_key_env,
        reason: "no canonical equivalent — set via environment",
      });
    if (modelSrc.stream !== undefined)
      unmapped.push({
        source_path: "model.stream",
        value: modelSrc.stream,
        reason: "no canonical equivalent",
      });
    if (src.log !== undefined)
      unmapped.push({
        source_path: "log",
        value: src.log,
        reason: "no canonical equivalent",
      });
    if (src.telemetry !== undefined)
      unmapped.push({
        source_path: "telemetry",
        value: src.telemetry,
        reason: "no canonical equivalent",
      });

    const agent = {
      name: agentSrc.name ?? "lightclaw-agent",
      model: modelSrc.name ?? "unknown",
      provider: modelSrc.provider ?? "anthropic",
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

    const knownChannelKeys = new Set([
      "type",
      "token_env",
      "bot_token_env",
      "access_token_env",
      "guild_id",
      "chat_id",
      "server_url",
      "room_id",
      "channel_id",
      "phone_number",
      "webhook_url",
      "workspace",
      "workers",
    ]);
    const channels: CanonicalChannel[] = (src.channel ?? []).map((ch, i) => {
      if (ch.workers !== undefined)
        unmapped.push({
          source_path: `channel[${i}].workers`,
          value: ch.workers,
          reason: "no canonical equivalent",
        });
      const extra: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(ch)) {
        if (!knownChannelKeys.has(k)) extra[k] = v;
      }
      return {
        type: ch.type,
        bot_token_env: ch.bot_token_env ?? ch.token_env,
        access_token_env: ch.access_token_env,
        guild_id: ch.guild_id,
        chat_id: ch.chat_id,
        server_url: ch.server_url,
        room_id: ch.room_id,
        channel_id: ch.channel_id,
        phone_number: ch.phone_number,
        webhook_url: ch.webhook_url,
        workspace: ch.workspace,
        extra,
      };
    });

    const storeSrc = src.store;
    let memory:
      | {
          backend: "sqlite" | "file" | "postgres" | "unknown";
          path?: string;
          connection_string?: string;
        }
      | undefined;
    if (storeSrc) {
      const t = storeSrc.type;
      const backend: "sqlite" | "file" | "postgres" | "unknown" =
        t === "sqlite" || t === "file" || t === "postgres" ? t : "unknown";
      memory = {
        backend,
        ...(storeSrc.path && { path: storeSrc.path }),
        ...(storeSrc.url && { connection_string: storeSrc.url }),
      };
    }

    const skills = (src.skills ?? []).map((s) => ({
      name: s.name,
      enabled: s.enabled ?? true,
    }));

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
