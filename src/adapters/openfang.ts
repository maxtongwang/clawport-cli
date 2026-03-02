// Adapter: OpenFang
// Schema version pinned to: RightNow-AI/openfang@0.3.1 (2026-02-28)
// Config format: TOML (~/.openfang/config.toml)
// Field mapping is exact — every field explicitly handled or flagged unmapped.

import type {
  Adapter,
  AdapterResult,
  CanonicalChannel,
  CanonicalConfig,
  UnmappedField,
} from "../types.js";
import { makeParsePersona, makeWritePersona } from "../persona.js";
import { esc, isBareKey, tomlVal } from "./write-helpers.js";

// Exact shape of openfang config.toml as of schema_version above.
// OpenFang uses "provider/model" compound string in agent.model.
interface OpenFangConfig {
  agent?: {
    name?: string;
    model?: string; // compound: "anthropic/claude-sonnet-4-6"
    system_prompt?: string;
    // flagged: openfang-specific
    max_context?: number;
    tools?: string[];
  };
  llm?: {
    temperature?: number;
    max_tokens?: number;
    top_p?: number;
    frequency_penalty?: number;
    presence_penalty?: number;
  };
  // OpenFang uses [channels.<type>] keyed sections, parsed as a record
  channels?: Record<
    string,
    {
      bot_token_env?: string;
      bot_token?: string;
      guild_id?: string;
      chat_id?: string;
      workspace?: string;
      default_agent?: string; // flagged
      overrides?: unknown; // flagged
      [key: string]: unknown;
    }
  >;
  memory?: {
    backend?: string;
    path?: string;
    connection_string?: string;
    // flagged
    vector_dims?: number;
    embedding_model?: string;
  };
  skills?: Array<{
    name: string;
    enabled?: boolean;
    config?: Record<string, unknown>;
  }>;
  // flagged top-level keys
  telemetry?: unknown;
  log_level?: unknown;
  budget?: unknown;
}

export const OpenFangAdapter: Adapter = {
  cloneName: "openfang",
  schemaVersion: "0.3.1",
  configPatterns: ["config.toml", ".openfang/config.toml"],
  defaultOutputFile: "config.toml",
  // OpenFang uses noun-first canonical skill names natively
  canonicalSkillNames: true,

  write(config: CanonicalConfig): string {
    const lines: string[] = [];

    lines.push("[agent]");
    lines.push(`name = "${esc(config.agent.name)}"`);
    // OpenFang requires "provider/model" compound format
    const model = config.agent.model.includes("/")
      ? config.agent.model
      : `${config.agent.provider}/${config.agent.model}`;
    lines.push(`model = "${esc(model)}"`);
    if (config.agent.system_prompt !== undefined) {
      lines.push(`system_prompt = "${esc(config.agent.system_prompt)}"`);
    }
    if (config.agent.max_context !== undefined)
      lines.push(`max_context = ${config.agent.max_context}`);

    const hasLlm =
      config.agent.temperature !== undefined ||
      config.agent.max_tokens !== undefined ||
      config.agent.top_p !== undefined ||
      config.agent.frequency_penalty !== undefined ||
      config.agent.presence_penalty !== undefined;
    if (hasLlm) {
      lines.push("");
      lines.push("[llm]");
      if (config.agent.temperature !== undefined)
        lines.push(`temperature = ${config.agent.temperature}`);
      if (config.agent.max_tokens !== undefined)
        lines.push(`max_tokens = ${config.agent.max_tokens}`);
      if (config.agent.top_p !== undefined)
        lines.push(`top_p = ${config.agent.top_p}`);
      if (config.agent.frequency_penalty !== undefined)
        lines.push(`frequency_penalty = ${config.agent.frequency_penalty}`);
      if (config.agent.presence_penalty !== undefined)
        lines.push(`presence_penalty = ${config.agent.presence_penalty}`);
    }

    if (config.memory) {
      lines.push("");
      lines.push("[memory]");
      lines.push(`backend = "${esc(config.memory.backend)}"`);
      if (config.memory.path) lines.push(`path = "${esc(config.memory.path)}"`);
      if (config.memory.connection_string) {
        lines.push(
          `connection_string = "${esc(config.memory.connection_string)}"`,
        );
      }
      if (config.memory.embedding_model)
        lines.push(`embedding_model = "${esc(config.memory.embedding_model)}"`);
      if (config.memory.vector_dims !== undefined)
        lines.push(`vector_dims = ${config.memory.vector_dims}`);
    }

    // OpenFang uses [channels.<type>] keyed sections
    for (const ch of config.channels) {
      lines.push("");
      const typeKey = isBareKey(ch.type) ? ch.type : `"${esc(ch.type)}"`;
      lines.push(`[channels.${typeKey}]`);
      // OpenFang prefers _env suffix for all token fields
      if (ch.bot_token_env)
        lines.push(`bot_token_env = "${esc(ch.bot_token_env)}"`);
      else if (ch.bot_token) {
        lines.push(`# WARNING: literal token — prefer bot_token_env`);
        lines.push(`bot_token = "${esc(ch.bot_token)}"`);
      }
      if (ch.access_token_env)
        lines.push(`access_token_env = "${esc(ch.access_token_env)}"`);
      else if (ch.access_token) {
        lines.push(`# WARNING: literal token — prefer access_token_env`);
        lines.push(`access_token = "${esc(ch.access_token)}"`);
      }
      if (ch.app_token_env)
        lines.push(`app_token_env = "${esc(ch.app_token_env)}"`);
      if (ch.password_env)
        lines.push(`password_env = "${esc(ch.password_env)}"`);
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
    const src = raw as OpenFangConfig;
    const unmapped: UnmappedField[] = [];

    // --- agent ---
    const agentSrc = src.agent ?? {};
    const llmSrc = src.llm ?? {};

    // Split "provider/model" compound back into separate fields
    let provider = "anthropic";
    let model = agentSrc.model ?? "unknown";
    if (model.includes("/")) {
      const slash = model.indexOf("/");
      provider = model.slice(0, slash);
      model = model.slice(slash + 1);
    }

    if (agentSrc.tools !== undefined) {
      unmapped.push({
        source_path: "agent.tools",
        value: agentSrc.tools,
        reason: "no canonical equivalent — use skills[]",
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
    if (src.budget !== undefined) {
      unmapped.push({
        source_path: "budget",
        value: src.budget,
        reason: "no canonical equivalent",
      });
    }

    const agent = {
      name: agentSrc.name ?? "unnamed",
      model,
      provider,
      ...(agentSrc.system_prompt !== undefined && {
        system_prompt: agentSrc.system_prompt,
      }),
      ...(llmSrc.temperature !== undefined && {
        temperature: llmSrc.temperature,
      }),
      ...(llmSrc.max_tokens !== undefined && { max_tokens: llmSrc.max_tokens }),
      ...(agentSrc.max_context !== undefined && {
        max_context: agentSrc.max_context,
      }),
      ...(llmSrc.top_p !== undefined && { top_p: llmSrc.top_p }),
      ...(llmSrc.frequency_penalty !== undefined && {
        frequency_penalty: llmSrc.frequency_penalty,
      }),
      ...(llmSrc.presence_penalty !== undefined && {
        presence_penalty: llmSrc.presence_penalty,
      }),
    };

    // --- channels (keyed record → array) ---
    const knownKeys = new Set([
      "bot_token_env",
      "bot_token",
      "guild_id",
      "chat_id",
      "workspace",
      "default_agent",
      "overrides",
    ]);
    const channels: CanonicalChannel[] = Object.entries(src.channels ?? {}).map(
      ([type, ch]) => {
        if (ch.default_agent !== undefined) {
          unmapped.push({
            source_path: `channels.${type}.default_agent`,
            value: ch.default_agent,
            reason: "no canonical equivalent",
          });
        }
        if (ch.overrides !== undefined) {
          unmapped.push({
            source_path: `channels.${type}.overrides`,
            value: ch.overrides,
            reason: "no canonical equivalent",
          });
        }
        const extra: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(ch)) {
          if (!knownKeys.has(k)) extra[k] = v;
        }
        return {
          type,
          bot_token_env: ch.bot_token_env,
          bot_token: ch.bot_token,
          guild_id: ch.guild_id,
          chat_id: ch.chat_id,
          workspace: ch.workspace,
          extra,
        };
      },
    );

    // --- memory ---
    const memSrc = src.memory;
    let memory:
      | {
          backend: "sqlite" | "file" | "postgres" | "unknown";
          path?: string;
          connection_string?: string;
        }
      | undefined;
    if (memSrc) {
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
        ...(memSrc.embedding_model !== undefined && {
          embedding_model: memSrc.embedding_model,
        }),
        ...(memSrc.vector_dims !== undefined && {
          vector_dims: memSrc.vector_dims,
        }),
      };
    }

    const skills = (src.skills ?? []).map((s) => ({
      name: s.name,
      enabled: s.enabled ?? true,
      config: s.config,
    }));

    return {
      ok: true,
      config: { agent, channels, memory, skills, unmapped },
    };
  },

  parsePersona: makeParsePersona("toml", "agent.toml"),

  writePersona: makeWritePersona("toml", "agent.toml"),
};
