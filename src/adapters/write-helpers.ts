// Shared write() utilities used by TOML adapters and all adapters' unmapped
// output sections.

import type { CanonicalConfig, UnmappedField } from "../types.js";

/** Escape a string for use inside a TOML double-quoted value. */
export function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** Serialize a value as a TOML literal (string, number, boolean, or JSON string). */
export function tomlVal(v: unknown): string {
  if (typeof v === "string") return `"${esc(v)}"`;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return `"${esc(JSON.stringify(v))}"`;
}

const CANONICAL_EXTRAS: Array<{
  key: string;
  path: string;
  get: (c: CanonicalConfig) => unknown;
}> = [
  { key: "top_p", path: "agent.top_p", get: (c) => c.agent.top_p },
  {
    key: "frequency_penalty",
    path: "agent.frequency_penalty",
    get: (c) => c.agent.frequency_penalty,
  },
  {
    key: "presence_penalty",
    path: "agent.presence_penalty",
    get: (c) => c.agent.presence_penalty,
  },
  {
    key: "max_context",
    path: "agent.max_context",
    get: (c) => c.agent.max_context,
  },
  {
    key: "embedding_model",
    path: "memory.embedding_model",
    get: (c) => c.memory?.embedding_model,
  },
  {
    key: "vector_dims",
    path: "memory.vector_dims",
    get: (c) => c.memory?.vector_dims,
  },
];

/**
 * Returns UnmappedField entries for canonical extension fields that the target
 * adapter does not emit natively. Pass the set of keys the adapter already
 * handles; all others present in config are returned as unmapped.
 */
export function unmappedCanonicalExtras(
  config: CanonicalConfig,
  supported: ReadonlySet<string> = new Set(),
): UnmappedField[] {
  const extras: UnmappedField[] = [];
  for (const { key, path, get } of CANONICAL_EXTRAS) {
    if (!supported.has(key)) {
      const value = get(config);
      if (value !== undefined) {
        extras.push({
          source_path: path,
          value,
          reason: "not supported by target adapter",
        });
      }
    }
  }
  return extras;
}
