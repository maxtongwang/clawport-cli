// Target: OpenFang TOML (~/.openfang/config.toml)
// Maps canonical config → OpenFang config.toml format.
// Field names and structure match OpenFang schema as of openfang@0.3.1.

import type { CanonicalConfig, CanonicalChannel } from "../types.js";

// Render a TOML string from the canonical config.
// We hand-build the TOML rather than use a serializer so field order
// and section layout match OpenFang's expected format exactly.
export function toOpenFang(config: CanonicalConfig): string {
  const lines: string[] = [];

  // [agent]
  lines.push("[agent]");
  lines.push(`name = ${toml_str(config.agent.name)}`);
  // OpenFang uses "provider/model" compound format
  const model = config.agent.model.includes("/")
    ? config.agent.model
    : `${config.agent.provider}/${config.agent.model}`;
  lines.push(`model = ${toml_str(model)}`);
  if (config.agent.system_prompt !== undefined) {
    lines.push(`system_prompt = ${toml_str(config.agent.system_prompt)}`);
  }

  // [llm] — OpenFang separates sampling params
  const hasLlm =
    config.agent.temperature !== undefined ||
    config.agent.max_tokens !== undefined;
  if (hasLlm) {
    lines.push("");
    lines.push("[llm]");
    if (config.agent.temperature !== undefined) {
      lines.push(`temperature = ${config.agent.temperature}`);
    }
    if (config.agent.max_tokens !== undefined) {
      lines.push(`max_tokens = ${config.agent.max_tokens}`);
    }
  }

  // [memory]
  if (config.memory) {
    lines.push("");
    lines.push("[memory]");
    lines.push(`backend = ${toml_str(config.memory.backend)}`);
    if (config.memory.path)
      lines.push(`path = ${toml_str(config.memory.path)}`);
    if (config.memory.connection_string) {
      lines.push(
        `connection_string = ${toml_str(config.memory.connection_string)}`,
      );
    }
  }

  // [channels.<type>] — one section per channel
  for (const ch of config.channels) {
    lines.push("");
    lines.push(`[channels.${ch.type}]`);
    // OpenFang prefers env var references over literal tokens
    if (ch.bot_token_env) {
      lines.push(`bot_token_env = ${toml_str(ch.bot_token_env)}`);
    } else if (ch.bot_token) {
      // Literal token — emit with a warning comment
      lines.push(`# WARNING: literal token — prefer bot_token_env`);
      lines.push(`bot_token = ${toml_str(ch.bot_token)}`);
    }
    if (ch.guild_id) lines.push(`guild_id = ${toml_str(ch.guild_id)}`);
    if (ch.chat_id) lines.push(`chat_id = ${toml_str(ch.chat_id)}`);
    if (ch.workspace) lines.push(`workspace = ${toml_str(ch.workspace)}`);
    for (const [k, v] of Object.entries(ch.extra)) {
      lines.push(`${k} = ${toml_val(v)}`);
    }
  }

  // [[skills]]
  for (const skill of config.skills) {
    lines.push("");
    lines.push("[[skills]]");
    lines.push(`name = ${toml_str(skill.name)}`);
    lines.push(`enabled = ${skill.enabled}`);
    if (skill.config) {
      for (const [k, v] of Object.entries(skill.config)) {
        lines.push(`${k} = ${toml_val(v)}`);
      }
    }
  }

  // Unmapped fields appended as comments for user review
  if (config.unmapped.length > 0) {
    lines.push("");
    lines.push("# --- UNMAPPED FIELDS (review required) ---");
    for (const u of config.unmapped) {
      lines.push(`# ${u.source_path}: ${u.reason}`);
      lines.push(`#   value: ${JSON.stringify(u.value)}`);
    }
  }

  return lines.join("\n") + "\n";
}

function toml_str(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function toml_val(v: unknown): string {
  if (typeof v === "string") return toml_str(v);
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return toml_str(JSON.stringify(v));
}

// Channel helper used by callers that need to build channel objects
export function buildChannelFromEnv(
  type: string,
  envKey: string,
): CanonicalChannel {
  return { type, bot_token_env: envKey, extra: {} };
}
