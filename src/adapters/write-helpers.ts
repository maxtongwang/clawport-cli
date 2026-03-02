// Shared write() utility for flagging new canonical fields that a target
// adapter does not natively support. Added to every adapter's unmapped output
// so fields aren't silently dropped on cross-adapter conversion.

import type { CanonicalConfig, UnmappedField } from "../types.js";

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
