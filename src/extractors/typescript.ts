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

// Extract the content between the first matching { } pair starting at pos.
// Tracks depth so nested braces are handled correctly.
function extractBraceBody(src: string, pos: number): string | null {
  let i = pos;
  while (i < src.length && src[i] !== "{") i++;
  if (i >= src.length) return null;
  const start = i;
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return src.slice(start + 1, i);
    }
  }
  return null; // unclosed
}

function parseInterfaces(src: string, file: string): ExtractedTsSchema[] {
  const results: ExtractedTsSchema[] = [];
  // Find: interface FooConfig (handles multiline bodies via extractBraceBody)
  const re = /\binterface\s+(\w*[Cc]onfig\w*)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(src)) !== null) {
    const body = extractBraceBody(src, match.index + match[0].length);
    if (body === null) continue;
    results.push({
      type_name: match[1],
      fields: parseTsFields(body),
      source_file: file,
    });
  }
  return results;
}

function parseTypes(src: string, file: string): ExtractedTsSchema[] {
  const results: ExtractedTsSchema[] = [];
  // Find: type FooConfig = (handles multiline bodies via extractBraceBody)
  const re = /\btype\s+(\w*[Cc]onfig\w*)\s*=/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(src)) !== null) {
    const body = extractBraceBody(src, match.index + match[0].length);
    if (body === null) continue;
    results.push({
      type_name: match[1],
      fields: parseTsFields(body),
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
