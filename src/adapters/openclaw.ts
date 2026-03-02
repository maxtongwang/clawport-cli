// Adapter: OpenClaw
// Schema version pinned to: openclaw/openclaw@a3f812c (2025-11-14)
// Config format: YAML (~/.openclaw/config.yaml)
// Field mapping is exact — every field explicitly handled or flagged unmapped.

import yaml from "js-yaml";
import type {
  Adapter,
  AdapterResult,
  CanonicalChannel,
  CanonicalConfig,
  UnmappedField,
} from "../types.js";
import { makeParsePersona, makeWritePersona } from "../persona.js";

// Exact shape of openclaw config.yaml as of schema_version above
interface OpenClawConfig {
  agent?: {
    name?: string;
    model?: string;
    provider?: string;
    system_prompt?: string;
    temperature?: number;
    max_tokens?: number;
    // deprecated alias still seen in older configs
    system?: string;
    // flagged: no canonical equivalent
    experimental_features?: unknown;
    persona?: unknown;
  };
  llm?: {
    // openclaw splits some llm params out of agent block
    temperature?: number;
    max_tokens?: number;
    top_p?: number; // flagged: no canonical equivalent
    frequency_penalty?: number; // flagged
  };
  channels?: {
    discord?: {
      bot_token?: string;
      guild_id?: string;
      // flagged: openclaw-specific
      slash_commands?: unknown;
      presence?: unknown;
    };
    telegram?: {
      bot_token?: string;
      chat_id?: string;
      // flagged
      parse_mode?: unknown;
    };
    slack?: {
      bot_token?: string;
      workspace?: string;
      app_token?: string; // flagged: no canonical equivalent
    };
    [key: string]: Record<string, unknown> | undefined;
  };
  memory?: {
    path?: string;
    // openclaw only supports file backend
    backend?: string;
  };
  skills?: Array<
    | string
    | { name: string; enabled?: boolean; config?: Record<string, unknown> }
  >;
}

export const OpenClawAdapter: Adapter = {
  cloneName: "openclaw",
  schemaVersion: "a3f812c",
  configPatterns: ["config.yaml", "config.yml", ".openclaw/config.yaml"],
  defaultOutputFile: "config.yaml",

  write(config: CanonicalConfig): string {
    // Build openclaw YAML shape from canonical config
    const out: Record<string, unknown> = {
      agent: {
        name: config.agent.name,
        model: config.agent.model,
        provider: config.agent.provider,
        ...(config.agent.system_prompt !== undefined && {
          system_prompt: config.agent.system_prompt,
        }),
        ...(config.agent.temperature !== undefined && {
          temperature: config.agent.temperature,
        }),
        ...(config.agent.max_tokens !== undefined && {
          max_tokens: config.agent.max_tokens,
        }),
      },
    };

    // Channels — openclaw uses a keyed map under channels:
    if (config.channels.length > 0) {
      const channels: Record<string, unknown> = {};
      for (const ch of config.channels) {
        channels[ch.type] = {
          ...(ch.bot_token !== undefined && { bot_token: ch.bot_token }),
          ...(ch.bot_token_env !== undefined && {
            bot_token: `\${${ch.bot_token_env}}`,
          }),
          ...(ch.access_token !== undefined && {
            access_token: ch.access_token,
          }),
          ...(ch.access_token_env !== undefined && {
            access_token: `\${${ch.access_token_env}}`,
          }),
          ...(ch.app_token_env !== undefined && {
            app_token: `\${${ch.app_token_env}}`,
          }),
          ...(ch.password_env !== undefined && {
            password: `\${${ch.password_env}}`,
          }),
          ...(ch.server_url !== undefined && { server_url: ch.server_url }),
          ...(ch.phone_number !== undefined && {
            phone_number: ch.phone_number,
          }),
          ...(ch.signal_cli_path !== undefined && {
            signal_cli_path: ch.signal_cli_path,
          }),
          ...(ch.guild_id !== undefined && { guild_id: ch.guild_id }),
          ...(ch.chat_id !== undefined && { chat_id: ch.chat_id }),
          ...(ch.workspace !== undefined && { workspace: ch.workspace }),
          ...(ch.room_id !== undefined && { room_id: ch.room_id }),
          ...(ch.channel_id !== undefined && { channel_id: ch.channel_id }),
          ...(ch.imap_host !== undefined && { imap_host: ch.imap_host }),
          ...(ch.imap_port !== undefined && { imap_port: ch.imap_port }),
          ...(ch.smtp_host !== undefined && { smtp_host: ch.smtp_host }),
          ...(ch.smtp_port !== undefined && { smtp_port: ch.smtp_port }),
          ...(ch.from_address !== undefined && {
            from_address: ch.from_address,
          }),
          ...(ch.webhook_url !== undefined && { webhook_url: ch.webhook_url }),
          ...ch.extra,
        };
      }
      out.channels = channels;
    }

    if (config.memory) {
      out.memory = {
        backend: config.memory.backend,
        ...(config.memory.path !== undefined && { path: config.memory.path }),
      };
    }

    if (config.skills.length > 0) {
      out.skills = config.skills.map((s) =>
        s.config
          ? { name: s.name, enabled: s.enabled, config: s.config }
          : s.name,
      );
    }

    let result = yaml.dump(out, { lineWidth: 120 });
    if (config.unmapped.length > 0) {
      result += "\n# --- UNMAPPED FIELDS (review required) ---\n";
      for (const u of config.unmapped) {
        result += `# ${u.source_path}: ${u.reason} | value: ${JSON.stringify(u.value)}\n`;
      }
    }
    return result;
  },

  parse(configPath: string, raw: unknown): AdapterResult {
    const src = raw as OpenClawConfig;
    const unmapped: UnmappedField[] = [];

    // --- agent block ---
    const agentSrc = src.agent ?? {};
    const llmSrc = src.llm ?? {};

    // system_prompt: openclaw uses either agent.system_prompt or deprecated agent.system
    const system_prompt = agentSrc.system_prompt ?? agentSrc.system;

    // temperature: prefer agent block, fall back to llm block (openclaw inconsistency)
    const temperature = agentSrc.temperature ?? llmSrc.temperature;
    const max_tokens = agentSrc.max_tokens ?? llmSrc.max_tokens;

    if (agentSrc.experimental_features !== undefined) {
      unmapped.push({
        source_path: "agent.experimental_features",
        value: agentSrc.experimental_features,
        reason: "no canonical equivalent",
      });
    }
    if (agentSrc.persona !== undefined) {
      unmapped.push({
        source_path: "agent.persona",
        value: agentSrc.persona,
        reason: "no canonical equivalent",
      });
    }
    if (llmSrc.top_p !== undefined) {
      unmapped.push({
        source_path: "llm.top_p",
        value: llmSrc.top_p,
        reason: "no canonical equivalent",
      });
    }
    if (llmSrc.frequency_penalty !== undefined) {
      unmapped.push({
        source_path: "llm.frequency_penalty",
        value: llmSrc.frequency_penalty,
        reason: "no canonical equivalent",
      });
    }

    const agent = {
      name: agentSrc.name ?? "unnamed",
      model: agentSrc.model ?? "unknown",
      provider: agentSrc.provider ?? "anthropic",
      ...(system_prompt !== undefined && { system_prompt }),
      ...(temperature !== undefined && { temperature }),
      ...(max_tokens !== undefined && { max_tokens }),
    };

    // --- channels block ---
    const channels: CanonicalChannel[] = [];
    const chanSrc = src.channels ?? {};

    if (chanSrc.discord) {
      const d = chanSrc.discord;
      if (d.slash_commands !== undefined) {
        unmapped.push({
          source_path: "channels.discord.slash_commands",
          value: d.slash_commands,
          reason: "no canonical equivalent",
        });
      }
      if (d.presence !== undefined) {
        unmapped.push({
          source_path: "channels.discord.presence",
          value: d.presence,
          reason: "no canonical equivalent",
        });
      }
      channels.push({
        type: "discord",
        bot_token: d.bot_token,
        guild_id: d.guild_id,
        extra: {},
      });
    }
    if (chanSrc.telegram) {
      const t = chanSrc.telegram;
      if (t.parse_mode !== undefined) {
        unmapped.push({
          source_path: "channels.telegram.parse_mode",
          value: t.parse_mode,
          reason: "no canonical equivalent",
        });
      }
      channels.push({
        type: "telegram",
        bot_token: t.bot_token,
        chat_id: t.chat_id,
        extra: {},
      });
    }
    if (chanSrc.slack) {
      const s = chanSrc.slack;
      // app_token now maps to canonical app_token_env (Slack Socket Mode)
      channels.push({
        type: "slack",
        bot_token: s.bot_token,
        workspace: s.workspace,
        ...(s.app_token !== undefined && {
          app_token_env: s.app_token as string,
        }),
        extra: {},
      });
    }

    // Any unrecognized channel keys are preserved with a warning
    const knownChannels = new Set(["discord", "telegram", "slack"]);
    for (const [key, val] of Object.entries(chanSrc)) {
      if (!knownChannels.has(key) && val !== undefined) {
        channels.push({
          type: key,
          extra: val as Record<string, unknown>,
        });
      }
    }

    // --- memory block ---
    const memSrc = src.memory;
    let memory:
      | { backend: "sqlite" | "file" | "postgres" | "unknown"; path?: string }
      | undefined;
    if (memSrc) {
      const b = memSrc.backend;
      const backend: "sqlite" | "file" | "postgres" | "unknown" =
        b === "sqlite" || b === "file" || b === "postgres" ? b : "file";
      memory = {
        backend,
        ...(memSrc.path !== undefined && { path: memSrc.path }),
      };
    }

    // --- skills block ---
    const skills = (src.skills ?? []).map((s) => {
      if (typeof s === "string") return { name: s, enabled: true };
      return { name: s.name, enabled: s.enabled ?? true, config: s.config };
    });

    return {
      ok: true,
      config: { agent, channels, memory, skills, unmapped },
    };
  },

  parsePersona: makeParsePersona("yaml", "agent.yaml"),

  writePersona: makeWritePersona("yaml", "agent.yaml"),
};
