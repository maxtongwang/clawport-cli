// Target: canonical JSON schema
// Outputs the normalized CanonicalConfig as formatted JSON.
// Unmapped fields are included in the output under "unmapped" for transparency.

import type { CanonicalConfig } from "../types.js";

export function toCanonical(config: CanonicalConfig): string {
  return JSON.stringify(config, null, 2);
}
