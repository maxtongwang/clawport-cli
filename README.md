# clawport-cli

Port any claw-ecosystem AI agent config to any other claw format.

OpenClaw → ZeroClaw → OpenFang → TitanClaw → and back again. Exact field
mapping, automatic skill name normalization, and agent persona migration.

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

# List all supported clones
clawport list

# Dry-run: see what maps cleanly and what doesn't
clawport validate ./my-agent-dir

# Port two directories (auto-discovers config files and output path)
clawport port ./my-openclaw-dir ./my-zeroclaw-dir

# Export with explicit target clone and output file
clawport export ./my-openclaw-dir --to zeroclaw -o config.toml

# Export to openfang
clawport export ./my-zeroclaw-dir --to openfang -o ~/.openfang/config.toml

# Include persona files (MEMORY.md + agent.yaml/toml)
clawport export ./my-openclaw-dir --to openfang --persona-dir ./personas -o out/

# Export to canonical JSON (interchange / debug format)
clawport export ./my-agent-dir --to canonical -o config.json

# Write to stdout
clawport export ./my-agent-dir --to zeroclaw --stdout
```

## Supported Clones

32 adapters across JSON, TOML, YAML, and ENV formats.

| Clone      | Format | Schema Version |
| ---------- | ------ | -------------- |
| aionui     | JSON   | v1.4.2         |
| andyclaw   | JSON   | v0.3.1         |
| bashobot   | ENV    | v1.1.0         |
| carapace   | TOML   | v0.2.1         |
| copaw      | JSON   | v0.5.1         |
| freeclaw   | JSON   | v0.2.3         |
| grip-ai    | JSON   | v1.0.2         |
| ironclaw   | TOML   | v0.12.0        |
| kafclaw    | JSON   | v1.3.2         |
| lightclaw  | TOML   | v0.6.0         |
| memubot    | JSON   | v2.3.0         |
| mimiclaw   | ENV    | v0.2.0         |
| moltis     | TOML   | v0.10.6        |
| n8nclaw    | JSON   | v0.5.0         |
| nanobot    | JSON   | v1.2.0         |
| nanoclaw   | JSON   | v0.4.1         |
| nullclaw   | JSON   | v1.2.0         |
| openclaw   | YAML   | a3f812c        |
| openfang   | TOML   | 0.3.1          |
| opengork   | ENV    | v0.1.0         |
| ouroboros  | JSON   | v0.3.0         |
| picobot    | JSON   | v0.1.4         |
| picoclaw   | JSON   | v0.2.0         |
| rowboat    | JSON   | v0.8.0         |
| ruvector   | TOML   | v0.4.0         |
| safeclaw   | JSON   | v2.1.0         |
| smallclaw  | JSON   | v0.3.2         |
| thepopebot | JSON   | v1.1.0         |
| tinyclaw   | JSON   | v0.0.7         |
| titanclaw  | TOML   | v1.0.3         |
| zclaw      | ENV    | v0.4.0         |
| zeroclaw   | TOML   | b91e44f        |

## Canonical Schema

All adapters map into a shared canonical format. Fields that cannot be mapped
are placed in `unmapped[]` and emitted as comments in the target file — never
silently dropped.

| Section    | Fields                                                                                                                 |
| ---------- | ---------------------------------------------------------------------------------------------------------------------- |
| `agent`    | name, model, provider, system_prompt, temperature, max_tokens, max_context, top_p, frequency_penalty, presence_penalty |
| `memory`   | backend, path, connection_string, embedding_model, vector_dims                                                         |
| `channels` | type + platform-specific auth/addressing (bot_token_env, guild_id, chat_id, workspace, room_id, …)                     |
| `skills`   | name, enabled, config                                                                                                  |

## Skill Name Normalization

clawport normalizes skill names bidirectionally at adapter boundaries.
Verb-first names (`read_file`, `search_web`) are normalized to canonical
noun-first form (`file_read`, `web_search`) and denormalized back on write.
Unknown skill names pass through unchanged.

## Persona Migration

Pass `--persona-dir` to migrate `MEMORY.md` and `agent.yaml`/`agent.toml`
alongside the config. The source adapter reads the persona directory; the
target adapter writes persona files in its native format. Adapters without
persona support skip this step silently.

## Accuracy Model

clawport uses **exact field mapping** — every field in a source config is either:

- Mapped to a canonical field, or
- Explicitly flagged as `unmapped` with a reason and original value

There is no fuzzy matching. Fields unsupported by the target adapter are also
flagged in the output so nothing is lost silently.

## Architecture

```
src/
├── cli.ts              # CLI (detect, list, validate, export)
├── detect.ts           # fingerprint clone from directory
├── types.ts            # CanonicalConfig, Adapter interface
├── skills.ts           # bidirectional skill name alias map
├── persona.ts          # MEMORY.md + agent config migration
└── adapters/           # one file per clone, exact field mappings
    └── write-helpers.ts  # shared esc(), tomlVal(), unmappedCanonicalExtras()
```

## Adding a New Adapter

1. Create `src/adapters/<clone>.ts` implementing the `Adapter` interface
2. Declare the exact config shape as a TypeScript interface, pinned to a commit
3. Implement `parse()` — map every source field to canonical or push to `unmapped[]`
4. Implement `write()` — emit supported canonical fields; call
   `unmappedCanonicalExtras()` for extension fields the format doesn't support
5. Register in `src/adapters/index.ts`

Every field must be explicitly handled or explicitly flagged. No silent drops.

## Contributing

Pull requests for new adapters are welcome. Accuracy over approximation:
every field mapping must be verified against the source clone's actual config
schema, pinned to a specific commit.

---

If clawport saved you time:

[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-whatupmax-yellow?logo=buy-me-a-coffee)](https://buymeacoffee.com/whatupmax)
