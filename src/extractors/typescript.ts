// Extractor: TypeScript
// Parses interface/type definitions from TS source to build a field map.
// Used by the watcher for TS-based claw clones (NanoClaw, TinyClaw, AionUi, etc.).

import fs from "fs";
import path from "path";

export interface ExtractedTsField {
  name: string;
  ts_type: string;
  optional: boolean; // true if field?: ...
  needs_review: boolean; // true if type is union, generic, or object literal
}

export interface ExtractedTsSchema {
  type_name: string;
  fields: ExtractedTsField[];
  source_file: string;
}

export function extractTsSchema(dir: string): ExtractedTsSchema[] {
  const results: ExtractedTsSchema[] = [];
  const candidates = findTsConfigFiles(dir);

  for (const file of candidates) {
    const src = fs.readFileSync(file, "utf8");
    results.push(...parseInterfaces(src, file));
    results.push(...parseTypes(src, file));
  }

  return results;
}

function findTsConfigFiles(dir: string): string[] {
  const found: string[] = [];
  const candidates = [
    path.join(dir, "src/types.ts"),
    path.join(dir, "src/config.ts"),
    path.join(dir, "src/types/config.ts"),
    path.join(dir, "src/interfaces.ts"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) found.push(c);
  }
  return found;
}

function parseInterfaces(src: string, file: string): ExtractedTsSchema[] {
  const results: ExtractedTsSchema[] = [];
  // Match: interface FooConfig { ... }
  const re = /interface\s+(\w*[Cc]onfig\w*)\s*\{([^}]+)\}/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(src)) !== null) {
    results.push({
      type_name: match[1],
      fields: parseTsFields(match[2]),
      source_file: file,
    });
  }
  return results;
}

function parseTypes(src: string, file: string): ExtractedTsSchema[] {
  const results: ExtractedTsSchema[] = [];
  // Match: type FooConfig = { ... }
  const re = /type\s+(\w*[Cc]onfig\w*)\s*=\s*\{([^}]+)\}/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(src)) !== null) {
    results.push({
      type_name: match[1],
      fields: parseTsFields(match[2]),
      source_file: file,
    });
  }
  return results;
}

function parseTsFields(body: string): ExtractedTsField[] {
  const fields: ExtractedTsField[] = [];
  // Match: fieldName?: Type; or fieldName: Type;
  const re = /(\w+)(\?)?:\s*([^;\n]+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(body)) !== null) {
    const name = match[1];
    const optional = match[2] === "?";
    const ts_type = match[3].trim().replace(/;$/, "").trim();
    // Flag unions, generics, and object literals for manual review
    const needs_review = /[|&<{]/.test(ts_type);
    fields.push({ name, ts_type, optional, needs_review });
  }
  return fields;
}
