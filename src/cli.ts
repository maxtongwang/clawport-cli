import { Command } from "commander";
import chalk from "chalk";
import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import TOML from "@iarna/toml";
import { detect } from "./detect.js";
import { ADAPTERS, getAdapter } from "./adapters/index.js";
import { toCanonical } from "./targets/canonical.js";

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

    const raw = loadConfig(result.fingerprint.config_file);
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

// ── export ────────────────────────────────────────────────────────────────────
program
  .command("export [dir]")
  .description("Port a clone config to any other claw format")
  .requiredOption(
    "--to <clone>",
    "Target clone name (e.g. zeroclaw, openclaw, openfang, canonical)",
  )
  .option("-o, --out <file>", "Output file (default: stdout)")
  .action((dir: string = ".", opts: { to: string; out?: string }) => {
    // Detect source
    const result = detect(dir);
    if (!result) {
      console.error(
        chalk.red("✗ No recognized claw clone found in:"),
        path.resolve(dir),
      );
      process.exit(1);
    }

    if (result.fingerprint.name === opts.to) {
      console.error(
        chalk.yellow(
          `⚠ Source and target are both "${opts.to}" — nothing to do.`,
        ),
      );
      process.exit(0);
    }

    // Parse source → canonical
    const raw = loadConfig(result.fingerprint.config_file);
    const parsed = result.adapter.parse(result.fingerprint.config_file, raw);

    if (!parsed.ok) {
      console.error(chalk.red("✗ Parse error:"), parsed.error);
      process.exit(1);
    }

    // Write canonical → target format
    let output: string;
    let defaultFile: string;

    if (opts.to === "canonical") {
      output = toCanonical(parsed.config);
      defaultFile = "canonical.json";
    } else {
      const target = getAdapter(opts.to);
      if (!target) {
        console.error(chalk.red(`✗ Unknown target: ${opts.to}`));
        console.error(
          chalk.dim(
            `  Available: ${ADAPTERS.map((a) => a.cloneName).join(", ")}, canonical`,
          ),
        );
        process.exit(1);
      }
      output = target.write(parsed.config);
      defaultFile = target.defaultOutputFile;
    }

    const outFile = opts.out ?? defaultFile;

    if (opts.out) {
      fs.writeFileSync(outFile, output, "utf8");
      console.log(
        chalk.green(`✓ ${result.fingerprint.name} → ${opts.to}`),
        chalk.dim(`written to ${outFile}`),
      );
      if (parsed.config.unmapped.length > 0) {
        console.log(
          chalk.yellow(
            `⚠ ${parsed.config.unmapped.length} unmapped field(s) — see comments in output`,
          ),
        );
      }
    } else {
      // stdout: print header as stderr so output is pipeable
      process.stderr.write(
        chalk.dim(`# clawport: ${result.fingerprint.name} → ${opts.to}\n`),
      );
      process.stdout.write(output);
    }
  });

// ── helpers ───────────────────────────────────────────────────────────────────
function loadConfig(configFile: string): unknown {
  const ext = path.extname(configFile).toLowerCase();
  const raw = fs.readFileSync(configFile, "utf8");

  if (ext === ".yaml" || ext === ".yml") return yaml.load(raw);
  if (ext === ".toml") return TOML.parse(raw);
  if (ext === ".json") return JSON.parse(raw);
  throw new Error(`Unsupported config format: ${ext}`);
}

program.parse();
