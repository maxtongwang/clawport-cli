// Adapter: NullClaw
// Schema version pinned to: nullclaw/nullclaw@v1.2.0
// Config format: JSON (~/.nullclaw/config.json)
// Zig-based, 678 KB binary. Uses agents.list[] array (first entry canonical)
// with agents.defaults for fallback. Model is a compound "provider/model" string.
// Channels use accounts[] arrays (first account per type used).

import type {
  Adapter,
  AdapterResult,
  CanonicalChannel,
  CanonicalConfig,
  UnmappedField,
} from "../types.js";
import { makeParsePersona, makeWritePersona } from "../persona.js";

interface NullClawConfig {
  agents?: {
    defaults?: {
      model?: { primary?: string };
      system_prompt?: string;
      params?: { temperature?: number; maxTokens?: number };
    };
    list?: Array<{
      id?: string;
      identity?: { name?: string };
      model?: { primary?: string };
      system_prompt?: string;
      params?: { temperature?: number; maxTokens?: number };
    }>;
  };
  channels?: Record<
    string,
    {
      accounts?: Array<{
        bot_token_env?: string;
        bot_token?: string;
        access_token_env?: string;
        app_token_env?: string;
        chat_id?: string;
        guild_id?: string;
        workspace?: string;
        channel_id?: string;
        webhook_url?: string;
        server_url?: string;
        room_id?: string;
        [key: string]: unknown;
      }>;
    }
  >;
  models?: {
    // flagged: provider API key management
    providers?: Record<string, { api_key_env?: string }>;
  };
  // flagged
  log_level?: unknown;
  telemetry?: unknown;
}

export const NullClawAdapter: Adapter = {
  cloneName: "nullclaw",
  schemaVersion: "v1.2.0",
  configPatterns: ["config.json", ".nullclaw/config.json"],
  defaultOutputFile: "config.json",

  write(config: CanonicalConfig): string {
    const [provider, ...modelParts] = config.agent.provider
      ? [config.agent.provider, config.agent.model]
      : ["anthropic", config.agent.model];
    const modelPrimary = `${provider}/${modelParts.join("") || config.agent.model}`;

    const primaryAgent: Record<string, unknown> = {
      id: "primary",
      identity: { name: config.agent.name },
      model: { primary: modelPrimary },
    };
    if (config.agent.system_prompt !== undefined)
      primaryAgent.system_prompt = config.agent.system_prompt;
    if (
      config.agent.temperature !== undefined ||
      config.agent.max_tokens !== undefined
    ) {
      const params: Record<string, unknown> = {};
      if (config.agent.temperature !== undefined)
        params.temperature = config.agent.temperature;
      if (config.agent.max_tokens !== undefined)
        params.maxTokens = config.agent.max_tokens;
      primaryAgent.params = params;
    }

    // Recover multi-agent list if available from unmapped (roundtrip)
    const recoveredListEntry = config.unmapped.find(
      (u) => u.source_path === "agents.list" && Array.isArray(u.value),
    );
    const unmappedRest = config.unmapped.filter(
      (u) => !(u.source_path === "agents.list" && Array.isArray(u.value)),
    );

    const agentList = recoveredListEntry
      ? (recoveredListEntry.value as Array<Record<string, unknown>>).map(
          (a, i) => (i === 0 ? { ...a, ...primaryAgent } : a),
        )
      : [primaryAgent];

    const out: Record<string, unknown> = {
      agents: { list: agentList },
    };

    if (config.channels.length > 0) {
      const channels: Record<string, unknown> = {};
      for (const ch of config.channels) {
        const account: Record<string, unknown> = {};
        if (ch.bot_token_env) account.bot_token_env = ch.bot_token_env;
        else if (ch.bot_token) account.bot_token = ch.bot_token;
        if (ch.access_token_env) account.access_token_env = ch.access_token_env;
        if (ch.app_token_env) account.app_token_env = ch.app_token_env;
        if (ch.guild_id) account.guild_id = ch.guild_id;
        if (ch.chat_id) account.chat_id = ch.chat_id;
        if (ch.workspace) account.workspace = ch.workspace;
        if (ch.channel_id) account.channel_id = ch.channel_id;
        if (ch.server_url) account.server_url = ch.server_url;
        if (ch.room_id) account.room_id = ch.room_id;
        if (ch.webhook_url) account.webhook_url = ch.webhook_url;
        Object.assign(account, ch.extra);
        channels[ch.type] = { accounts: [account] };
      }
      out.channels = channels;
    }

    const allUnmapped = [
      ...unmappedRest,
      ...(config.memory
        ? [
            {
              source_path: "memory",
              value: config.memory,
              reason: "nullclaw memory schema not confirmed — not emitted",
            },
          ]
        : []),
      ...config.skills.map((s) => ({
        source_path: `skills[${s.name}]`,
        value: s,
        reason: "nullclaw skills schema not confirmed — not emitted",
      })),
    ];

    if (allUnmapped.length > 0) {
      out._clawport_unmapped = allUnmapped.map(
        (u) => `${u.source_path}: ${u.reason}`,
      );
    }

    return JSON.stringify(out, null, 2) + "\n";
  },

  parse(_configPath: string, raw: unknown): AdapterResult {
    const src = raw as NullClawConfig;
    const unmapped: UnmappedField[] = [];

    const agentsList = src.agents?.list ?? [];
    const defaults = src.agents?.defaults ?? {};
    const primary = agentsList[0] ?? {};

    // Flag multi-agent list — store full array for roundtrip recovery
    if (agentsList.length > 1)
      unmapped.push({
        source_path: "agents.list",
        value: agentsList,
        reason: "multi-agent list — only first agent exported",
      });

    if (src.models?.providers !== undefined)
      unmapped.push({
        source_path: "models.providers",
        value: src.models.providers,
        reason: "provider API key config — set via environment",
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

    // Resolve model: compound "provider/model-name" string
    const modelPrimary =
      primary.model?.primary ?? defaults.model?.primary ?? "";
    const slashIdx = modelPrimary.indexOf("/");
    const provider =
      slashIdx > -1 ? modelPrimary.slice(0, slashIdx) : "anthropic";
    const model =
      slashIdx > -1
        ? modelPrimary.slice(slashIdx + 1)
        : modelPrimary || "unknown";

    const systemPrompt = primary.system_prompt ?? defaults.system_prompt;
    const temperature =
      primary.params?.temperature ?? defaults.params?.temperature;
    const maxTokens = primary.params?.maxTokens ?? defaults.params?.maxTokens;

    const agent = {
      name: primary.identity?.name ?? "nullclaw-agent",
      model,
      provider,
      ...(systemPrompt !== undefined && { system_prompt: systemPrompt }),
      ...(temperature !== undefined && { temperature }),
      ...(maxTokens !== undefined && { max_tokens: maxTokens }),
    };

    const knownAccountKeys = new Set([
      "bot_token_env",
      "bot_token",
      "access_token_env",
      "app_token_env",
      "chat_id",
      "guild_id",
      "workspace",
      "channel_id",
      "server_url",
      "room_id",
      "webhook_url",
    ]);
    const channels: CanonicalChannel[] = [];
    for (const [type, chanBlock] of Object.entries(src.channels ?? {})) {
      const acct = chanBlock.accounts?.[0] ?? {};
      const extra: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(acct)) {
        if (!knownAccountKeys.has(k)) extra[k] = v;
      }
      if (chanBlock.accounts && chanBlock.accounts.length > 1)
        unmapped.push({
          source_path: `channels.${type}.accounts`,
          value: chanBlock.accounts.slice(1),
          reason: "multiple accounts per channel — only first exported",
        });
      channels.push({
        type,
        bot_token_env: acct.bot_token_env,
        bot_token: acct.bot_token,
        access_token_env: acct.access_token_env,
        app_token_env: acct.app_token_env,
        guild_id: acct.guild_id,
        chat_id: acct.chat_id,
        workspace: acct.workspace,
        channel_id: acct.channel_id,
        server_url: acct.server_url,
        room_id: acct.room_id,
        webhook_url: acct.webhook_url,
        extra,
      });
    }

    return {
      ok: true,
      config: { agent, channels, memory: undefined, skills: [], unmapped },
    };
  },

  parsePersona: makeParsePersona("json", "agent.json"),

  writePersona: makeWritePersona("json", "agent.json"),
};
