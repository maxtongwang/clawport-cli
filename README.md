# clawport-cli

Port any claw-ecosystem AI agent config to any other claw format.

OpenClaw → ZeroClaw → OpenFang → and back again. Exact field mapping,
zero fuzzy guessing, and automatic adapter updates as new clones are registered on
[ClawClones](https://clawclones.com/).

[![CI](https://github.com/maxtongwang/clawport-cli/actions/workflows/validate.yml/badge.svg)](https://github.com/maxtongwang/clawport-cli/actions/workflows/validate.yml)
[![npm](https://img.shields.io/npm/v/clawport)](https://www.npmjs.com/package/clawport)

---

## Install

```bash
npm install -g clawport
```

## Usage

```bash
# Identify which claw clone a directory contains
clawport detect ./my-agent-dir

# List all supported clones (valid --to values)
clawport list

# Dry-run: see what maps cleanly and what doesn't
clawport validate ./my-agent-dir

# Port openclaw → zeroclaw
clawport export ./my-openclaw-dir --to zeroclaw -o config.toml

# Port zeroclaw → openfang
clawport export ./my-zeroclaw-dir --to openfang -o ~/.openfang/config.toml

# Port openclaw → canonical JSON (interchange / debug format)
clawport export ./my-openclaw-dir --to canonical -o config.json

# Pipe output directly
clawport export ./my-agent-dir --to zeroclaw > config.toml
```

## Supported Clones

| Clone    | Language          | Schema Version |
| -------- | ----------------- | -------------- |
| openclaw | TypeScript / YAML | a3f812c        |
| zeroclaw | Rust / TOML       | b91e44f        |
| openfang | Rust / TOML       | 0.3.1          |

New clones are added automatically via the daily [watcher](.github/workflows/watcher.yml)
that monitors the [ClawClones registry](https://github.com/naturalmoods/clawclones-registry).

## Accuracy Model

clawport uses **exact field mapping** — every field in a source config is either:

- Mapped to a named canonical field, or
- Explicitly flagged as `unmapped` with a reason

There is no fuzzy matching. If a field can't be confidently mapped, it appears
in the `unmapped[]` output and is emitted as a comment in the target file.
Unmapped fields are never silently dropped.

## Adding a New Adapter

1. The watcher opens a PR with a generated skeleton (`src/adapters/<clone>.generated.ts`)
2. Implement exact field mappings — replace all stubs
3. Resolve every `UNMAPPED` comment
4. Register the adapter in `src/adapters/index.ts`
5. Delete the `.generated.ts` file

## Architecture

```
src/
├── cli.ts              # CLI (detect, list, validate, export)
├── detect.ts           # fingerprint clone from directory
├── types.ts            # CanonicalConfig, Adapter interface
├── adapters/           # one file per clone, exact mappings
├── extractors/         # AST-light parsers (Rust, TS, Python, Go)
├── targets/            # output writers (openfang, canonical)
└── watcher/            # daily registry poller + adapter generator
```

## Contributing

Pull requests for new adapters are welcome. Accuracy over approximation:
every field mapping must be verified against the source clone's actual config schema,
pinned to a specific commit.

---

If clawport saved you time, buy me a coffee:

[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-whatupmax-yellow?logo=buy-me-a-coffee)](https://buymeacoffee.com/whatupmax)
