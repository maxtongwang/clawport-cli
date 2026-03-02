// Canonical config schema — every adapter maps INTO this shape.
// Fields that cannot be mapped are placed in unmapped[].

export interface CanonicalAgent {
  name: string;
  model: string;
  provider: string;
  system_prompt?: string;
  temperature?: number;
  max_tokens?: number;
}

export interface CanonicalChannel {
  type: string; // e.g. "discord", "telegram", "slack"

  // --- Auth tokens (different platforms use different naming) ---
  bot_token_env?: string; // Discord, Telegram, Slack, Mattermost, Rocket.Chat, Guilded...
  bot_token?: string; // literal token (warn: exposed)
  access_token_env?: string; // WhatsApp Cloud API, Matrix, Mastodon, Bluesky, LinkedIn...
  access_token?: string; // literal access token (warn: exposed)
  app_token_env?: string; // Slack Socket Mode (required alongside bot_token_env)
  password_env?: string; // Email (IMAP/SMTP), XMPP

  // --- Connection (self-hosted / federated platforms) ---
  server_url?: string; // Mattermost, Rocket.Chat, Matrix homeserver, Nextcloud, XMPP
  imap_host?: string; // Email inbound
  imap_port?: number;
  smtp_host?: string; // Email outbound
  smtp_port?: number;
  from_address?: string; // Email sender address

  // --- Addressing ---
  guild_id?: string; // Discord server ID
  chat_id?: string; // Telegram chat/group ID
  workspace?: string; // Slack workspace
  room_id?: string; // Matrix room, IRC channel, Rocket.Chat room
  channel_id?: string; // Generic channel/room identifier
  phone_number?: string; // WhatsApp, Signal (E.164 format)
  signal_cli_path?: string; // Signal — path to signal-cli binary

  // --- Notification-only (outbound, no inbound) ---
  webhook_url?: string; // ntfy, Gotify push endpoints

  // --- Per-channel agent overrides (flagged on parse, preserved on write) ---
  // Not part of canonical — adapters flag these as unmapped.

  // --- Catch-all for platform-specific fields not in canonical schema ---
  extra: Record<string, unknown>;
}

export interface CanonicalMemory {
  backend: "sqlite" | "file" | "postgres" | "unknown";
  path?: string;
  connection_string?: string;
}

export interface CanonicalSkill {
  name: string;
  enabled: boolean;
  config?: Record<string, unknown>;
}

export interface UnmappedField {
  source_path: string; // dotted path in source config, e.g. "agent.experimental"
  value: unknown;
  reason: string; // "no canonical equivalent" | "format mismatch" | etc.
}

export interface CanonicalConfig {
  agent: CanonicalAgent;
  channels: CanonicalChannel[];
  memory?: CanonicalMemory;
  skills: CanonicalSkill[];
  unmapped: UnmappedField[];
}

// Result type for all adapter operations
export type AdapterResult =
  | { ok: true; config: CanonicalConfig }
  | { ok: false; error: string };

// A single file emitted by writePersona (filename + raw content)
export interface PersonaFile {
  filename: string; // e.g. "MEMORY.md", "agent.yaml"
  content: string;
}

// Agent persona data parsed from a persona directory
export interface AgentPersona {
  memory?: string; // raw MEMORY.md content
  agent_config?: string; // raw agent.yaml/toml content
  agent_config_format?: "yaml" | "toml" | "json";
}

// Identifies a source directory as a specific claw clone
export interface CloneFingerprint {
  name: string; // e.g. "openclaw", "zeroclaw"
  schema_version: string; // git commit hash of the clone at detection time
  config_file: string; // path to the primary config file detected
  language: "rust" | "typescript" | "python" | "go" | "unknown";
}

// Adapter interface — every adapter in src/adapters/ implements this.
// Each adapter is both a SOURCE (parse) and a TARGET (write).
// clawport export ./src-dir --to <cloneName> calls src-adapter.parse() then target-adapter.write().
export interface Adapter {
  // Human-readable name, used as the --to value
  readonly cloneName: string;
  // Schema version this adapter was written against (source repo commit)
  readonly schemaVersion: string;
  // File patterns that identify this clone's workspace (used by detect)
  readonly configPatterns: string[];
  // Default output filename when writing to this clone's format
  readonly defaultOutputFile: string;
  // Parse source config → canonical form
  parse(configPath: string, raw: unknown): AdapterResult;
  // Write canonical form → this clone's native config format (string)
  write(config: CanonicalConfig): string;
  // When true, this adapter uses canonical (noun-first) skill names natively.
  // cli.ts skips denormalizeSkillName before write() for these adapters.
  readonly canonicalSkillNames?: boolean;
  // Optional: parse persona files (MEMORY.md, agent.yaml/toml) from agentDir
  parsePersona?(agentDir: string): AgentPersona | undefined;
  // Optional: emit persona files for this clone's format
  writePersona?(persona: AgentPersona): PersonaFile[];
}
