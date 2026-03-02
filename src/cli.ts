import { Command } from "commander";
import chalk from "chalk";
import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import TOML from "@iarna/toml";
import { detect } from "./detect.js";
import { ADAPTERS, getAdapter } from "./adapters/index.js";
import { toCanonical } from "./targets/canonical.js";
import { normalizeSkillName, denormalizeSkillName } from "./skills.js";
import type { Adapter } from "./types.js";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pkg = require("../package.json") as { version: string; name: string };

const program = new Command();

program
  .name("clawport")
  .description(
    "Port any claw-ecosystem AI agent config to any other claw format",
  )
  .version(pkg.version);

// ── detect ────────────────────────────────────────────────────────────────────
program
  .command("detect [dir]")
  .description("Fingerprint a directory as a specific claw clone")
  .action((dir: string = ".") => {
    const result = detect(dir);
    if (!result) {
      console.error(
        chalk.red("✗ No recognized claw clone found in:"),
        path.resolve(dir),
      );
      console.error(
        chalk.dim(
          `  Supported: ${ADAPTERS.map((a) => a.cloneName).join(", ")}`,
        ),
      );
      process.exit(1);
    }
    const { fingerprint } = result;
    console.log(chalk.green("✓ Detected:"), chalk.bold(fingerprint.name));
    console.log(chalk.dim("  config file:    "), fingerprint.config_file);
    console.log(chalk.dim("  schema version: "), fingerprint.schema_version);
    console.log(chalk.dim("  language:       "), fingerprint.language);
  });

// ── list ──────────────────────────────────────────────────────────────────────
program
  .command("list")
  .description("List all supported claw clones (valid --to values)")
  .action(() => {
    console.log(chalk.bold("\nSupported clones:\n"));
    for (const adapter of ADAPTERS) {
      console.log(
        `  ${chalk.cyan(adapter.cloneName.padEnd(16))} schema @ ${chalk.dim(adapter.schemaVersion)}  → ${chalk.dim(adapter.defaultOutputFile)}`,
      );
    }
    console.log(
      chalk.dim("\n  Special targets: canonical (JSON interchange format)"),
    );
    console.log();
  });

// ── validate ──────────────────────────────────────────────────────────────────
program
  .command("validate [dir]")
  .description(
    "Parse a clone config and report what maps cleanly vs. what doesn't",
  )
  .action((dir: string = ".") => {
    const result = detect(dir);
    if (!result) {
      console.error(chalk.red("✗ No recognized claw clone found"));
      process.exit(1);
    }

    let raw: unknown;
    try {
      raw = loadConfig(result.fingerprint.config_file);
    } catch (e) {
      console.error(
        chalk.red("✗ Failed to read config:"),
        (e as Error).message,
      );
      process.exit(1);
    }
    const parsed = result.adapter.parse(result.fingerprint.config_file, raw);

    if (!parsed.ok) {
      console.error(chalk.red("✗ Parse error:"), parsed.error);
      process.exit(1);
    }

    const { config } = parsed;
    console.log(chalk.green("✓ Parsed:"), chalk.bold(result.fingerprint.name));
    console.log(
      chalk.dim(
        `  agent:    ${config.agent.name} (${config.agent.provider}/${config.agent.model})`,
      ),
    );
    console.log(
      chalk.dim(
        `  channels: ${config.channels.map((c) => c.type).join(", ") || "none"}`,
      ),
    );
    console.log(chalk.dim(`  skills:   ${config.skills.length}`));

    if (config.unmapped.length === 0) {
      console.log(chalk.green("\n✓ All fields mapped cleanly."));
    } else {
      console.log(
        chalk.yellow(`\n⚠ ${config.unmapped.length} unmapped field(s):`),
      );
      for (const u of config.unmapped) {
        console.log(
          chalk.yellow(`  · ${u.source_path}`),
          chalk.dim(`— ${u.reason}`),
        );
      }
    }
  });

// ── export ─────────────────────────────────────────────────────────────────────
// Legacy form: explicit dir + --to. Still useful for scripting.
program
  .command("export [dir]")
  .description("Port a clone config to any other claw format")
  .requiredOption(
    "--to <clone>",
    "Target clone name (e.g. zeroclaw, openclaw, openfang, canonical)",
  )
  .option(
    "-o, --out <file>",
    "Output file (default: target's default filename)",
  )
  .option("--stdout", "Write to stdout instead of a file")
  .option(
    "--persona-dir <dir>",
    "Override persona directory (default: same dir as source config)",
  )
  .action(
    (
      dir: string = ".",
      opts: { to: string; out?: string; stdout?: boolean; personaDir?: string },
    ) => {
      const result = detect(dir);
      if (!result) {
        console.error(
          chalk.red("✗ No recognized claw clone found in:"),
          path.resolve(dir),
        );
        process.exit(1);
      }
      runPort(
        result.adapter,
        result.fingerprint.config_file,
        result.fingerprint.name,
        opts.to,
        opts,
      );
    },
  );

// ── port ──────────────────────────────────────────────────────────────────────
// Simple form: clawport port <from> <to>
// <from> = clone name (auto-discovers dir) OR a directory/file path.
// Output filename is determined from the target adapter — no -o needed.
// Persona files (MEMORY.md, agent.yaml/toml) are auto-discovered from the
// source config directory and migrated to the target format by default.
program
  .command("port <from> <to>")
  .description(
    "Port any clone to any other — auto-discovers source, output file, and persona",
  )
  .option("-o, --out <file>", "Override output filename")
  .option("--stdout", "Write to stdout instead of a file")
  .option(
    "--persona-dir <dir>",
    "Override persona directory (default: same dir as source config)",
  )
  .action(
    (
      from: string,
      toName: string,
      opts: { out?: string; stdout?: boolean; personaDir?: string },
    ) => {
      // Resolve source: path/dir → detect; clone name → auto-search
      let srcAdapter: Adapter;
      let srcConfigFile: string;

      if (isPathLike(from)) {
        // Treat as directory or file path
        const result = detect(from);
        if (!result) {
          console.error(
            chalk.red("✗ No recognized claw clone found in:"),
            path.resolve(from),
          );
          process.exit(1);
        }
        srcAdapter = result.adapter;
        srcConfigFile = result.fingerprint.config_file;
      } else {
        // Treat as clone name — search standard locations
        const found = findCloneConfig(from);
        if (!found) {
          console.error(chalk.red(`✗ Unknown source clone: ${from}`));
          const known = ADAPTERS.map((a) => a.cloneName).join(", ");
          console.error(chalk.dim(`  Known clones: ${known}`));
          console.error(
            chalk.dim(
              `  Or pass a directory path: clawport port ./my-agent ${toName}`,
            ),
          );
          process.exit(1);
        }
        srcAdapter = found.adapter;
        srcConfigFile = found.configFile;
      }

      runPort(srcAdapter, srcConfigFile, srcAdapter.cloneName, toName, opts);
    },
  );

// ── core export logic ─────────────────────────────────────────────────────────

function runPort(
  srcAdapter: Adapter,
  srcConfigFile: string,
  srcName: string,
  toName: string,
  opts: { out?: string; stdout?: boolean; personaDir?: string },
): void {
  if (srcName === toName) {
    console.error(
      chalk.yellow(`⚠ Source and target are both "${toName}" — nothing to do.`),
    );
    process.exit(0);
  }

  // Parse source → canonical
  let raw: unknown;
  try {
    raw = loadConfig(srcConfigFile);
  } catch (e) {
    console.error(chalk.red("✗ Failed to read config:"), (e as Error).message);
    process.exit(1);
  }
  const parsed = srcAdapter.parse(srcConfigFile, raw);
  if (!parsed.ok) {
    console.error(chalk.red("✗ Parse error:"), parsed.error);
    process.exit(1);
  }

  // Normalize all skill names to canonical (noun-first) form
  for (const skill of parsed.config.skills) {
    skill.name = normalizeSkillName(skill.name);
  }

  // Write canonical → target format
  let output: string;
  let defaultFile: string;

  if (toName === "canonical") {
    output = toCanonical(parsed.config);
    defaultFile = "canonical.json";
  } else {
    const target = getAdapter(toName);
    if (!target) {
      console.error(chalk.red(`✗ Unknown target: ${toName}`));
      console.error(
        chalk.dim(
          `  Available: ${ADAPTERS.map((a) => a.cloneName).join(", ")}, canonical`,
        ),
      );
      process.exit(1);
    }

    // Denormalize to target convention unless it uses canonical names natively
    if (!target.canonicalSkillNames) {
      for (const skill of parsed.config.skills) {
        skill.name = denormalizeSkillName(skill.name);
      }
    }

    output = target.write(parsed.config);
    defaultFile = target.defaultOutputFile;

    // Persona migration: default to source config's own directory
    const personaDir =
      opts.personaDir ?? path.dirname(path.resolve(srcConfigFile));
    if (srcAdapter.parsePersona && target.writePersona) {
      const persona = srcAdapter.parsePersona(personaDir);
      if (persona) {
        // Write persona files beside the output file
        const outDir = opts.out
          ? path.dirname(path.resolve(opts.out))
          : path.resolve(".");
        const personaFiles = target.writePersona(persona);
        for (const pf of personaFiles) {
          const destPath = path.join(outDir, pf.filename);
          try {
            fs.writeFileSync(destPath, pf.content, "utf8");
          } catch (e) {
            console.error(
              chalk.red("✗ Failed to write persona file:"),
              destPath,
              (e as Error).message,
            );
            process.exit(1);
          }
          console.log(
            chalk.green(`✓ persona`),
            chalk.dim(`written to ${destPath}`),
          );
        }
      }
      // No persona files found is silent — not every agent has them
    }
  }

  // Output: --stdout → pipe; -o → named file; default → target's filename in CWD
  if (opts.stdout) {
    process.stderr.write(chalk.dim(`# clawport: ${srcName} → ${toName}\n`));
    process.stdout.write(output);
    return;
  }

  const outFile = path.resolve(opts.out ?? defaultFile);
  try {
    fs.writeFileSync(outFile, output, "utf8");
  } catch (e) {
    console.error(chalk.red("✗ Failed to write output:"), (e as Error).message);
    process.exit(1);
  }
  console.log(
    chalk.green(`✓ ${srcName} → ${toName}`),
    chalk.dim(`written to ${outFile}`),
  );
  if (parsed.config.unmapped.length > 0) {
    console.log(
      chalk.yellow(
        `⚠ ${parsed.config.unmapped.length} unmapped field(s) — see comments in output`,
      ),
    );
  }
}

// ── helpers ───────────────────────────────────────────────────────────────────

// Heuristic: does the string look like a file path rather than a clone name?
// Clone names never start with /, ./, ../, or ~.
// Users must use explicit path syntax to refer to a directory.
function isPathLike(s: string): boolean {
  return (
    s.startsWith("/") ||
    s.startsWith("./") ||
    s.startsWith("../") ||
    s.startsWith("~")
  );
}

// Search standard locations for a named clone's config file.
// Search order: current dir → ~/.<cloneName>/ → ~/<cloneName>/
function findCloneConfig(
  cloneName: string,
): { adapter: Adapter; configFile: string } | null {
  const adapter = getAdapter(cloneName);
  if (!adapter) return null;

  const home = process.env.HOME ?? process.env.USERPROFILE ?? "";
  const searchDirs = [
    ".",
    path.join(home, `.${cloneName}`),
    path.join(home, cloneName),
  ];

  for (const dir of searchDirs) {
    for (const pattern of adapter.configPatterns) {
      const candidate = path.resolve(path.join(dir, pattern));
      if (fs.existsSync(candidate)) {
        console.error(chalk.dim(`  found: ${candidate}`));
        return { adapter, configFile: candidate };
      }
    }
  }

  return null;
}

function loadConfig(configFile: string): unknown {
  const ext = path.extname(configFile).toLowerCase();
  const raw = fs.readFileSync(configFile, "utf8");

  if (ext === ".yaml" || ext === ".yml") return yaml.load(raw);
  if (ext === ".toml") return TOML.parse(raw);
  if (ext === ".json") return JSON.parse(raw);
  if (ext === ".env") return parseEnvFile(raw);
  throw new Error(`Unsupported config format: ${ext}`);
}

function parseEnvFile(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    )
      val = val.slice(1, -1);
    result[key] = val;
  }
  return result;
}

program.parse();
