// Adapter: Carapace
// Schema version pinned to: wasm-ai/carapace@v0.2.1
// Config format: TOML (~/.carapace/carapace.toml)
// Rust-based, signed WASM plugins with OS-level sandboxing.
// Uses [runtime] block for model. [sandbox] block is entirely flagged.
// Plugins map to canonical skills[].

import type {
  Adapter,
  AdapterResult,
  CanonicalChannel,
  CanonicalConfig,
  UnmappedField,
} from "../types.js";
import { makeParsePersona, makeWritePersona } from "../persona.js";
import { unmappedCanonicalExtras } from "./write-helpers.js";

interface CarapaceConfig {
  agent?: {
    name?: string;
    system_prompt?: string;
    // flagged
    wasm_runtime?: string;
  };
  runtime?: {
    provider?: string;
    model?: string;
    api_key_env?: string; // flagged
    temperature?: number;
    max_tokens?: number;
    // flagged
    timeout_ms?: number;
  };
  sandbox?: {
    // flagged: entire sandboxing block
    isolate?: boolean;
    max_memory_mb?: number;
    allow_network?: boolean;
    allow_fs?: boolean;
  };
  channels?: Array<{
    type: string;
    bot_token_env?: string;
    bot_token?: string;
    access_token_env?: string;
    guild_id?: string;
    chat_id?: string;
    workspace?: string;
    channel_id?: string;
    webhook_url?: string;
    server_url?: string;
    [key: string]: unknown;
  }>;
  plugins?: Array<{
    name: string;
    enabled?: boolean;
    // flagged
    wasm_path?: string;
    signature?: string;
  }>;
  store?: {
    backend?: string;
    path?: string;
    url?: string;
  };
  // flagged
  log_level?: unknown;
  signing_key_env?: string;
}

export const CarapaceAdapter: Adapter = {
  cloneName: "carapace",
  schemaVersion: "v0.2.1",
  configPatterns: ["carapace.toml", ".carapace/carapace.toml"],
  defaultOutputFile: "carapace.toml",

  write(config: CanonicalConfig): string {
    const lines: string[] = [];

    lines.push("[agent]");
    lines.push(`name = "${esc(config.agent.name)}"`);
    if (config.agent.system_prompt)
      lines.push(`system_prompt = "${esc(config.agent.system_prompt)}"`);

    lines.push("");
    lines.push("[runtime]");
    lines.push(`provider = "${esc(config.agent.provider)}"`);
    lines.push(`model = "${esc(config.agent.model)}"`);
    if (config.agent.temperature !== undefined)
      lines.push(`temperature = ${config.agent.temperature}`);
    if (config.agent.max_tokens !== undefined)
      lines.push(`max_tokens = ${config.agent.max_tokens}`);

    if (config.memory) {
      lines.push("");
      lines.push("[store]");
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
      if (ch.channel_id) lines.push(`channel_id = "${esc(ch.channel_id)}"`);
      if (ch.webhook_url) lines.push(`webhook_url = "${esc(ch.webhook_url)}"`);
      if (ch.server_url) lines.push(`server_url = "${esc(ch.server_url)}"`);
      for (const [k, v] of Object.entries(ch.extra))
        lines.push(`${k} = ${tomlVal(v)}`);
    }

    for (const s of config.skills) {
      lines.push("");
      lines.push("[[plugins]]");
      lines.push(`name = "${esc(s.name)}"`);
      lines.push(`enabled = ${s.enabled}`);
    }

    const allUnmapped = [...config.unmapped, ...unmappedCanonicalExtras(config)];
    if (allUnmapped.length > 0) {
      lines.push("");
      lines.push("# --- UNMAPPED FIELDS ---");
      for (const u of allUnmapped)
        lines.push(`# ${u.source_path}: ${u.reason}`);
    }

    return lines.join("\n") + "\n";
  },

  parse(_configPath: string, raw: unknown): AdapterResult {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw))
      return { ok: false, error: "expected object config" };
    const src = raw as CarapaceConfig;
    const unmapped: UnmappedField[] = [];

    const agentSrc = src.agent ?? {};
    const runtimeSrc = src.runtime ?? {};

    if (agentSrc.wasm_runtime !== undefined)
      unmapped.push({
        source_path: "agent.wasm_runtime",
        value: agentSrc.wasm_runtime,
        reason: "no canonical equivalent",
      });
    if (runtimeSrc.api_key_env !== undefined)
      unmapped.push({
        source_path: "runtime.api_key_env",
        value: runtimeSrc.api_key_env,
        reason: "no canonical equivalent — set via environment",
      });
    if (runtimeSrc.timeout_ms !== undefined)
      unmapped.push({
        source_path: "runtime.timeout_ms",
        value: runtimeSrc.timeout_ms,
        reason: "no canonical equivalent",
      });
    if (src.sandbox !== undefined)
      unmapped.push({
        source_path: "sandbox",
        value: src.sandbox,
        reason: "OS-level sandboxing config — no canonical equivalent",
      });
    if (src.log_level !== undefined)
      unmapped.push({
        source_path: "log_level",
        value: src.log_level,
        reason: "no canonical equivalent",
      });
    if (src.signing_key_env !== undefined)
      unmapped.push({
        source_path: "signing_key_env",
        value: src.signing_key_env,
        reason: "no canonical equivalent",
      });

    const agent = {
      name: agentSrc.name ?? "carapace-agent",
      model: runtimeSrc.model ?? "unknown",
      provider: runtimeSrc.provider ?? "anthropic",
      ...(agentSrc.system_prompt !== undefined && {
        system_prompt: agentSrc.system_prompt,
      }),
      ...(runtimeSrc.temperature !== undefined && {
        temperature: runtimeSrc.temperature,
      }),
      ...(runtimeSrc.max_tokens !== undefined && {
        max_tokens: runtimeSrc.max_tokens,
      }),
    };

    const knownKeys = new Set([
      "type",
      "bot_token_env",
      "bot_token",
      "access_token_env",
      "guild_id",
      "chat_id",
      "workspace",
      "channel_id",
      "webhook_url",
      "server_url",
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
        channel_id: ch.channel_id,
        webhook_url: ch.webhook_url,
        server_url: ch.server_url,
        extra,
      };
    });

    const skills = (src.plugins ?? []).map((p) => {
      if (p.wasm_path !== undefined)
        unmapped.push({
          source_path: `plugins[${p.name}].wasm_path`,
          value: p.wasm_path,
          reason: "no canonical equivalent",
        });
      if (p.signature !== undefined)
        unmapped.push({
          source_path: `plugins[${p.name}].signature`,
          value: p.signature,
          reason: "no canonical equivalent",
        });
      return { name: p.name, enabled: p.enabled ?? true };
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
      const b = storeSrc.backend;
      const backend: "sqlite" | "file" | "postgres" | "unknown" =
        b === "sqlite" || b === "file" || b === "postgres" ? b : "unknown";
      memory = {
        backend,
        ...(storeSrc.path && { path: storeSrc.path }),
        ...(storeSrc.url && { connection_string: storeSrc.url }),
      };
    }

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
