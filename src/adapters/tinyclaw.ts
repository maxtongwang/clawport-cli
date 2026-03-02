// Adapter: TinyClaw
// Schema version pinned to: TinyAGI/tinyclaw@v0.0.7
// Config format: JSON (.tinyclaw/settings.json)
// TinyClaw uses an agents map keyed by agent ID, plus a workspace block.
// First agent in the map is used as the canonical agent.

import type {
  Adapter,
  AdapterResult,
  CanonicalConfig,
  UnmappedField,
} from "../types.js";

interface TinyClawConfig {
  workspace?: {
    path?: string;
    name?: string;
  };
  agents?: Record<
    string,
    {
      name?: string;
      provider?: string;
      model?: string;
      system_prompt?: string;
      working_directory?: string; // flagged
      temperature?: number;
      max_tokens?: number;
      // flagged
      tools?: unknown;
      memory?: unknown;
    }
  >;
  channels?: {
    discord?: { bot_token_env?: string; bot_token?: string; guild_id?: string };
    telegram?: { bot_token_env?: string; bot_token?: string; chat_id?: string };
    slack?: {
      bot_token_env?: string;
      app_token_env?: string;
      workspace?: string;
    };
    [key: string]: Record<string, unknown> | undefined;
  };
}

export const TinyClawAdapter: Adapter = {
  cloneName: "tinyclaw",
  schemaVersion: "v0.0.7",
  configPatterns: [".tinyclaw/settings.json", "tinyclaw.json"],
  defaultOutputFile: "settings.json",

  write(config: CanonicalConfig): string {
    const out: Record<string, unknown> = {
      workspace: { name: config.agent.name },
      agents: {
        default: {
          name: config.agent.name,
          provider: config.agent.provider,
          model: config.agent.model,
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
      },
    };

    if (config.channels.length > 0) {
      const channels: Record<string, unknown> = {};
      for (const ch of config.channels) {
        const entry: Record<string, unknown> = {};
        if (ch.bot_token_env) entry.bot_token_env = ch.bot_token_env;
        else if (ch.bot_token) entry.bot_token = ch.bot_token;
        if (ch.access_token_env) entry.access_token_env = ch.access_token_env;
        if (ch.app_token_env) entry.app_token_env = ch.app_token_env;
        if (ch.guild_id) entry.guild_id = ch.guild_id;
        if (ch.chat_id) entry.chat_id = ch.chat_id;
        if (ch.workspace) entry.workspace = ch.workspace;
        Object.assign(entry, ch.extra);
        channels[ch.type] = entry;
      }
      out.channels = channels;
    }

    if (config.memory?.path) {
      (out.workspace as Record<string, unknown>).path = config.memory.path;
    }

    if (config.unmapped.length > 0) {
      out._clawport_unmapped = config.unmapped.map(
        (u) => `${u.source_path}: ${u.reason}`,
      );
    }

    return JSON.stringify(out, null, 2) + "\n";
  },

  parse(_configPath: string, raw: unknown): AdapterResult {
    const src = raw as TinyClawConfig;
    const unmapped: UnmappedField[] = [];

    // Use first agent entry as canonical agent
    const agentEntries = Object.entries(src.agents ?? {});
    const [agentId, agentSrc] = agentEntries[0] ?? ["default", {}];

    if (agentSrc.working_directory !== undefined)
      unmapped.push({
        source_path: `agents.${agentId}.working_directory`,
        value: agentSrc.working_directory,
        reason: "no canonical equivalent — use memory.path",
      });
    if (agentSrc.tools !== undefined)
      unmapped.push({
        source_path: `agents.${agentId}.tools`,
        value: agentSrc.tools,
        reason: "no canonical equivalent",
      });
    if (agentSrc.memory !== undefined)
      unmapped.push({
        source_path: `agents.${agentId}.memory`,
        value: agentSrc.memory,
        reason: "use top-level memory block",
      });
    if (agentEntries.length > 1)
      unmapped.push({
        source_path: "agents",
        value: agentEntries.slice(1).map(([id]) => id),
        reason: "multi-agent map — only first agent exported",
      });

    const agent = {
      name: agentSrc.name ?? agentId,
      model: agentSrc.model ?? "unknown",
      provider: agentSrc.provider ?? "anthropic",
      ...(agentSrc.system_prompt !== undefined && {
        system_prompt: agentSrc.system_prompt,
      }),
      ...(agentSrc.temperature !== undefined && {
        temperature: agentSrc.temperature,
      }),
      ...(agentSrc.max_tokens !== undefined && {
        max_tokens: agentSrc.max_tokens,
      }),
    };

    const chanSrc = src.channels ?? {};
    const channels = [];
    if (chanSrc.discord) {
      const d = chanSrc.discord;
      channels.push({
        type: "discord",
        bot_token_env: d.bot_token_env,
        bot_token: d.bot_token,
        guild_id: d.guild_id,
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
    const known = new Set(["discord", "telegram", "slack"]);
    for (const [key, val] of Object.entries(chanSrc)) {
      if (!known.has(key) && val)
        channels.push({ type: key, extra: val as Record<string, unknown> });
    }

    const memPath = agentSrc.working_directory ?? src.workspace?.path;
    const memory = memPath
      ? { backend: "file" as const, path: memPath }
      : undefined;

    return {
      ok: true,
      config: { agent, channels, memory, skills: [], unmapped },
    };
  },
};
