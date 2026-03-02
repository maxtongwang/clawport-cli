// Watcher: Adapter Generator
// Given a cloned repo dir, detects its language, extracts the config schema,
// and emits a TypeScript adapter skeleton in src/adapters/<clone-name>.ts.
// Generated adapters mark every field as needing manual review —
// they are NOT auto-merged to main without a human PR review.

import fs from "fs";
import path from "path";
import { extractRustSchema } from "../extractors/rust.js";
import { extractTsSchema } from "../extractors/typescript.js";
import { extractPySchema } from "../extractors/python.js";
import { extractGoSchema } from "../extractors/go.js";

// __dirname is available in CJS — no import.meta needed
const ADAPTERS_DIR = path.resolve(__dirname, "../adapters");

export interface GeneratorInput {
  repoUrl: string;
  repoDir: string;
  headCommit: string;
  isNew: boolean;
}

type Language = "rust" | "typescript" | "python" | "go" | "unknown";

function detectLanguage(dir: string): Language {
  if (fs.existsSync(path.join(dir, "Cargo.toml"))) return "rust";
  if (fs.existsSync(path.join(dir, "package.json"))) return "typescript";
  if (
    fs.existsSync(path.join(dir, "pyproject.toml")) ||
    fs.existsSync(path.join(dir, "setup.py"))
  )
    return "python";
  if (fs.existsSync(path.join(dir, "go.mod"))) return "go";
  return "unknown";
}

function cloneNameFromUrl(repoUrl: string): string {
  return (
    repoUrl
      .split("/")
      .pop()
      ?.toLowerCase()
      .replace(/[^a-z0-9-]/g, "-") ?? "unknown-clone"
  );
}

// Default config file patterns per language ecosystem
function defaultConfigPatterns(lang: Language, cloneName: string): string[] {
  switch (lang) {
    case "rust":
      return [`config.toml`, `.${cloneName}/config.toml`];
    case "typescript":
    case "python":
      return [`config.yaml`, `config.yml`, `.${cloneName}/config.yaml`];
    case "go":
      return [`config.yaml`, `config.json`, `.${cloneName}/config.yaml`];
    default:
      return [`config.yaml`, `config.toml`, `config.json`];
  }
}

// Default output file per language ecosystem
function defaultOutputFile(lang: Language): string {
  switch (lang) {
    case "rust":
      return "config.toml";
    case "typescript":
    case "python":
    case "go":
      return "config.yaml";
    default:
      return "config.yaml";
  }
}

export async function generateAdapter(input: GeneratorInput): Promise<void> {
  const { repoUrl, repoDir, headCommit } = input;
  const cloneName = cloneNameFromUrl(repoUrl);
  const lang = detectLanguage(repoDir);
  const outFile = path.join(ADAPTERS_DIR, `${cloneName}.ts`);

  // If adapter already exists, write to a .generated.ts file for diff review
  const targetFile = fs.existsSync(outFile)
    ? path.join(ADAPTERS_DIR, `${cloneName}.generated.ts`)
    : outFile;

  const fields = extractFields(repoDir, lang);
  const skeleton = buildAdapterSkeleton({
    cloneName,
    repoUrl,
    headCommit,
    lang,
    fields,
  });

  fs.writeFileSync(targetFile, skeleton, "utf8");
  console.log(`[generator] Wrote adapter skeleton -> ${targetFile}`);
  console.log(
    `[generator] Fields extracted: ${fields.length} -- ALL marked for manual review`,
  );
}

interface FieldEntry {
  name: string;
  type_hint: string;
  optional: boolean;
  needs_review: boolean;
}

function extractFields(dir: string, lang: Language): FieldEntry[] {
  if (lang === "rust") {
    const schemas = extractRustSchema(dir);
    return schemas.flatMap((s) =>
      s.fields.map((f) => ({
        name: f.name,
        type_hint: f.rust_type,
        optional: f.optional,
        needs_review: f.needs_review,
      })),
    );
  }
  if (lang === "typescript") {
    const schemas = extractTsSchema(dir);
    return schemas.flatMap((s) =>
      s.fields.map((f) => ({
        name: f.name,
        type_hint: f.ts_type,
        optional: f.optional,
        needs_review: f.needs_review,
      })),
    );
  }
  if (lang === "python") {
    const schemas = extractPySchema(dir);
    return schemas.flatMap((s) =>
      s.fields.map((f) => ({
        name: f.name,
        type_hint: f.py_type,
        optional: f.optional,
        needs_review: f.needs_review,
      })),
    );
  }
  if (lang === "go") {
    const schemas = extractGoSchema(dir);
    return schemas.flatMap((s) =>
      s.fields.map((f) => ({
        name: f.name,
        type_hint: f.go_type,
        optional: f.optional,
        needs_review: f.needs_review,
      })),
    );
  }
  return [];
}

interface SkeletonInput {
  cloneName: string;
  repoUrl: string;
  headCommit: string;
  lang: Language;
  fields: FieldEntry[];
}

function buildAdapterSkeleton(input: SkeletonInput): string {
  const { cloneName, repoUrl, headCommit, lang, fields } = input;
  const varName = toPascalCase(cloneName) + "Adapter";
  const configPatterns = defaultConfigPatterns(lang, cloneName);
  const outputFile = defaultOutputFile(lang);
  const personaFmt = outputFile.endsWith(".toml") ? "toml" : outputFile.endsWith(".json") ? "json" : "yaml";
  const personaFile = `agent.${personaFmt}`;

  const fieldLines = fields.length > 0
    ? fields.map((f) => {
        const reviewTag = f.needs_review
          ? " // TODO: complex type -- verify mapping"
          : "";
        const optTag = f.optional ? "?" : "";
        return `  ${f.name}${optTag}: unknown; // ${f.type_hint}${reviewTag}`;
      })
    : ["  // TODO: add field declarations"];

  const mappingLines = fields.length > 0
    ? fields.map((f) => {
        const canonical = guessCanonicalPath(f.name);
        if (canonical) {
          return `      // ${f.name} -> ${canonical}`;
        }
        return `      // UNMAPPED: ${f.name} (${f.type_hint}) -- no canonical equivalent identified`;
      })
    : ["      // TODO: map source fields to canonical"];

  return `// AUTO-GENERATED by clawport-watcher -- DO NOT EDIT directly.
// Clone: ${cloneName} (${repoUrl})
// Schema version: ${headCommit}
// Language: ${lang}
// Generated: ${new Date().toISOString()}
//
// ACTION REQUIRED: Review all field mappings below before merging.
// Every "UNMAPPED" field must be explicitly resolved or flagged.

import type {
  Adapter,
  AdapterResult,
  CanonicalConfig,
  UnmappedField,
} from "../types.js";
import { makeParsePersona, makeWritePersona } from "../persona.js";
import { unmappedCanonicalExtras } from "./write-helpers.js";

// Source config shape -- auto-extracted from ${lang} source.
// Verify these types against the actual source before finalizing.
interface ${toPascalCase(cloneName)}Config {
${fieldLines.join("\n")}
}

export const ${varName}: Adapter = {
  cloneName: ${JSON.stringify(cloneName)},
  schemaVersion: ${JSON.stringify(headCommit)},
  configPatterns: ${JSON.stringify(configPatterns)},
  defaultOutputFile: ${JSON.stringify(outputFile)},

  write(config: CanonicalConfig): string {
    // TODO: implement write() -- emit canonical fields in this clone's native format.
    // Call unmappedCanonicalExtras(config, new Set([/* fields you emit natively */]))
    // and include the result in the unmapped comments section.
    const allUnmapped = [...config.unmapped, ...unmappedCanonicalExtras(config)];
    void allUnmapped;
    throw new Error(
      "Adapter ${cloneName} write() is a generated skeleton -- implement before use.",
    );
  },

  parse(_configPath: string, raw: unknown): AdapterResult {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw))
      return { ok: false, error: "expected object config" };
    const src = raw as ${toPascalCase(cloneName)}Config;
    const unmapped: UnmappedField[] = [];

    // TODO: implement exact field mapping. Skeleton field hints:
${mappingLines.join("\n")}

    // Replace this stub with actual mapping before merging.
    void src;
    void unmapped;
    return {
      ok: false,
      error: "Adapter ${cloneName} parse() is a generated skeleton -- implement before use.",
    };
  },

  parsePersona: makeParsePersona(${JSON.stringify(personaFmt)}, ${JSON.stringify(personaFile)}),

  writePersona: makeWritePersona(${JSON.stringify(personaFmt)}, ${JSON.stringify(personaFile)}),
};
`;
}

// Best-effort guess at which canonical field a source field name maps to.
// Returns null if no confident match -- forces manual review.
// Covers the full current canonical schema (types.ts).
function guessCanonicalPath(name: string): string | null {
  const exact: Record<string, string> = {
    // CanonicalAgent
    name: "agent.name",
    model: "agent.model",
    provider: "agent.provider",
    system_prompt: "agent.system_prompt",
    temperature: "agent.temperature",
    max_tokens: "agent.max_tokens",
    max_context: "agent.max_context",
    top_p: "agent.top_p",
    frequency_penalty: "agent.frequency_penalty",
    presence_penalty: "agent.presence_penalty",
    // CanonicalMemory
    backend: "memory.backend",
    path: "memory.path",
    connection_string: "memory.connection_string",
    url: "memory.connection_string",
    embedding_model: "memory.embedding_model",
    vector_dims: "memory.vector_dims",
    vector_dimensions: "memory.vector_dims",
    // CanonicalChannel
    bot_token: "channels[n].bot_token",
    bot_token_env: "channels[n].bot_token_env",
    access_token: "channels[n].access_token",
    access_token_env: "channels[n].access_token_env",
    app_token_env: "channels[n].app_token_env",
    password_env: "channels[n].password_env",
    guild_id: "channels[n].guild_id",
    chat_id: "channels[n].chat_id",
    workspace: "channels[n].workspace",
    room_id: "channels[n].room_id",
    channel_id: "channels[n].channel_id",
    server_url: "channels[n].server_url",
    phone_number: "channels[n].phone_number",
    signal_cli_path: "channels[n].signal_cli_path",
    webhook_url: "channels[n].webhook_url",
    imap_host: "channels[n].imap_host",
    imap_port: "channels[n].imap_port",
    smtp_host: "channels[n].smtp_host",
    smtp_port: "channels[n].smtp_port",
    from_address: "channels[n].from_address",
  };
  return exact[name] ?? null;
}

function toPascalCase(s: string): string {
  return s
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");
}
