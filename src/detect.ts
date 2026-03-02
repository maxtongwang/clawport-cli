// Fingerprints a directory as a specific claw clone.
// Uses file patterns from each adapter's configPatterns list.
// Returns the first matching adapter + the resolved config file path.

import fs from "fs";
import path from "path";
import { ADAPTERS } from "./adapters/index.js";
import type { Adapter, CloneFingerprint } from "./types.js";

export interface DetectResult {
  adapter: Adapter;
  fingerprint: CloneFingerprint;
}

export function detect(dir: string): DetectResult | null {
  const abs = path.resolve(dir);

  for (const adapter of ADAPTERS) {
    for (const pattern of adapter.configPatterns) {
      const candidate = path.join(abs, pattern);
      if (fs.existsSync(candidate)) {
        const ext = path.extname(candidate).toLowerCase();
        const language =
          ext === ".toml"
            ? ("rust" as const)
            : ext === ".yaml" || ext === ".yml"
              ? ("unknown" as const)
              : ext === ".json"
                ? ("typescript" as const)
                : ("unknown" as const);

        return {
          adapter,
          fingerprint: {
            name: adapter.cloneName,
            schema_version: adapter.schemaVersion,
            config_file: candidate,
            language,
          },
        };
      }
    }
  }

  return null;
}
