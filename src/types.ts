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
  bot_token_env?: string; // env var name holding the token
  bot_token?: string; // literal token (warn: exposed)
  guild_id?: string; // discord-specific
  chat_id?: string; // telegram-specific
  workspace?: string; // slack-specific
  extra: Record<string, unknown>; // channel-specific fields preserved verbatim
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
}
