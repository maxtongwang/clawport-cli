import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli.ts"],
  format: ["cjs"],
  outDir: "dist",
  banner: { js: "#!/usr/bin/env node" },
  clean: true,
  noExternal: ["js-yaml", "@iarna/toml", "commander", "chalk"],
});
