// Adapter: SafeClaw
// Schema version pinned to: SecureAI/safeclaw@v2.1.0
// Config format: JSON (~/.safeclaw/settings.json)
// SafeClaw is Python-based (Pydantic config model).
// Flat structure with explicit provider/model. Channels use a keyed map.
// Emphasizes security: all secrets must be env vars.

import type {
  Adapter,
  AdapterResult,
  CanonicalChannel,
  CanonicalConfig,
  UnmappedField,
} from "../types.js";
import { makeParsePersona, makeWritePersona } from "../persona.js";

interface SafeClawConfig {
  llm?: {
    provider?: string;
    model?: string;
    api_key_env?: string; // flagged
    temperature?: number;
    max_tokens?: number;
    // flagged
    timeout?: number;
    max_retries?: number;
    top_p?: number;
  };
  agent?: {
    name?: string;
    system_prompt?: string;
    // flagged
    persona?: string;
    max_turns?: number;
  };
  channels?: Record<
    string,
    {
      token_env?: string; // generic env var for token (maps to bot_token_env)
      bot_token_env?: string;
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
      webhook_url?: string;
      // flagged
      allowed_roles?: unknown;
      [key: string]: unknown;
    }
  >;
  memory?: {
    backend?: string;
    path?: string;
    url?: string; // connection string
    // flagged
    encryption_key_env?: string;
    ttl_days?: number;
  };
  // flagged
  audit_log?: unknown;
  rate_limits?: unknown;
  log_level?: unknown;
}

export const SafeClawAdapter: Adapter = {
  cloneName: "safeclaw",
  schemaVersion: "v2.1.0",
  configPatterns: ["settings.json", ".safeclaw/settings.json"],
  defaultOutputFile: "settings.json",

  write(config: CanonicalConfig): string {
    const out: Record<string, unknown> = {
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
      agent: {
        name: config.agent.name,
        ...(config.agent.system_prompt !== undefined && {
          system_prompt: config.agent.system_prompt,
        }),
      },
    };

    if (config.channels.length > 0) {
      const channels: Record<string, unknown> = {};
      for (const ch of config.channels) {
        const entry: Record<string, unknown> = {};
        // SafeClaw prefers token_env as the generic name, but also accepts bot_token_env
        if (ch.bot_token_env) entry.bot_token_env = ch.bot_token_env;
        else if (ch.bot_token) {
          // SafeClaw enforces env vars — warn via comment convention
          entry.bot_token_env = "FIXME_MOVE_TO_ENV";
        }
        if (ch.access_token_env) entry.access_token_env = ch.access_token_env;
        if (ch.app_token_env) entry.app_token_env = ch.app_token_env;
        if (ch.password_env) entry.password_env = ch.password_env;
        if (ch.guild_id) entry.guild_id = ch.guild_id;
        if (ch.chat_id) entry.chat_id = ch.chat_id;
        if (ch.workspace) entry.workspace = ch.workspace;
        if (ch.room_id) entry.room_id = ch.room_id;
        if (ch.channel_id) entry.channel_id = ch.channel_id;
        if (ch.server_url) entry.server_url = ch.server_url;
        if (ch.phone_number) entry.phone_number = ch.phone_number;
        if (ch.signal_cli_path) entry.signal_cli_path = ch.signal_cli_path;
        if (ch.webhook_url) entry.webhook_url = ch.webhook_url;
        if (ch.imap_host) entry.imap_host = ch.imap_host;
        if (ch.imap_port) entry.imap_port = ch.imap_port;
        if (ch.smtp_host) entry.smtp_host = ch.smtp_host;
        if (ch.smtp_port) entry.smtp_port = ch.smtp_port;
        if (ch.from_address) entry.from_address = ch.from_address;
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
          url: config.memory.connection_string,
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
    const src = raw as SafeClawConfig;
    const unmapped: UnmappedField[] = [];

    const llmSrc = src.llm ?? {};
    const agentSrc = src.agent ?? {};

    if (llmSrc.api_key_env !== undefined)
      unmapped.push({
        source_path: "llm.api_key_env",
        value: llmSrc.api_key_env,
        reason: "no canonical equivalent — set via environment",
      });
    if (llmSrc.timeout !== undefined)
      unmapped.push({
        source_path: "llm.timeout",
        value: llmSrc.timeout,
        reason: "no canonical equivalent",
      });
    if (llmSrc.max_retries !== undefined)
      unmapped.push({
        source_path: "llm.max_retries",
        value: llmSrc.max_retries,
        reason: "no canonical equivalent",
      });
    if (llmSrc.top_p !== undefined)
      unmapped.push({
        source_path: "llm.top_p",
        value: llmSrc.top_p,
        reason: "no canonical equivalent",
      });
    if (agentSrc.persona !== undefined)
      unmapped.push({
        source_path: "agent.persona",
        value: agentSrc.persona,
        reason: "no canonical equivalent",
      });
    if (agentSrc.max_turns !== undefined)
      unmapped.push({
        source_path: "agent.max_turns",
        value: agentSrc.max_turns,
        reason: "no canonical equivalent",
      });
    if (src.audit_log !== undefined)
      unmapped.push({
        source_path: "audit_log",
        value: src.audit_log,
        reason: "no canonical equivalent",
      });
    if (src.rate_limits !== undefined)
      unmapped.push({
        source_path: "rate_limits",
        value: src.rate_limits,
        reason: "no canonical equivalent",
      });
    if (src.log_level !== undefined)
      unmapped.push({
        source_path: "log_level",
        value: src.log_level,
        reason: "no canonical equivalent",
      });

    const agent = {
      name: agentSrc.name ?? "safeclaw-agent",
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
    const knownChanKeys = new Set([
      "token_env",
      "bot_token_env",
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
      "webhook_url",
      "allowed_roles",
    ]);
    const channels: CanonicalChannel[] = Object.entries(chanSrc).map(
      ([type, ch]) => {
        if (ch.allowed_roles !== undefined)
          unmapped.push({
            source_path: `channels.${type}.allowed_roles`,
            value: ch.allowed_roles,
            reason: "no canonical equivalent",
          });
        const extra: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(ch)) {
          if (!knownChanKeys.has(k)) extra[k] = v;
        }
        // SafeClaw uses token_env as generic — prefer bot_token_env if present
        const botTokenEnv = ch.bot_token_env ?? ch.token_env;
        return {
          type,
          bot_token_env: botTokenEnv,
          access_token_env: ch.access_token_env,
          app_token_env: ch.app_token_env,
          password_env: ch.password_env,
          guild_id: ch.guild_id,
          chat_id: ch.chat_id,
          workspace: ch.workspace,
          room_id: ch.room_id,
          channel_id: ch.channel_id,
          server_url: ch.server_url,
          phone_number: ch.phone_number,
          webhook_url: ch.webhook_url,
          extra,
        };
      },
    );

    const memSrc = src.memory;
    let memory:
      | {
          backend: "sqlite" | "file" | "postgres" | "unknown";
          path?: string;
          connection_string?: string;
        }
      | undefined;
    if (memSrc) {
      if (memSrc.encryption_key_env !== undefined)
        unmapped.push({
          source_path: "memory.encryption_key_env",
          value: memSrc.encryption_key_env,
          reason: "no canonical equivalent",
        });
      if (memSrc.ttl_days !== undefined)
        unmapped.push({
          source_path: "memory.ttl_days",
          value: memSrc.ttl_days,
          reason: "no canonical equivalent",
        });
      const b = memSrc.backend;
      const backend: "sqlite" | "file" | "postgres" | "unknown" =
        b === "sqlite" || b === "file" || b === "postgres" ? b : "unknown";
      memory = {
        backend,
        ...(memSrc.path && { path: memSrc.path }),
        ...(memSrc.url && { connection_string: memSrc.url }),
      };
    }

    return {
      ok: true,
      config: { agent, channels, memory, skills: [], unmapped },
    };
  },

  parsePersona: makeParsePersona("json", "agent.json"),

  writePersona: makeWritePersona("json", "agent.json"),
};
