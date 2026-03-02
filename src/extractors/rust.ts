// Extractor: Rust
// Parses struct fields from Rust source files to build a field map.
// Used by the watcher to auto-generate adapter skeletons for Rust-based clones.
// Strategy: find the Config struct, extract field names and types via regex.
// This is intentionally conservative — ambiguous fields are marked for manual review.

import fs from "fs";
import path from "path";

export interface ExtractedField {
  name: string;
  rust_type: string;
  optional: boolean; // true if Option<T>
  needs_review: boolean; // true if type is complex (Vec, HashMap, enum)
}

export interface ExtractedSchema {
  struct_name: string;
  fields: ExtractedField[];
  source_file: string;
}

// Find and parse the primary Config struct from a Rust workspace dir
export function extractRustSchema(dir: string): ExtractedSchema[] {
  const results: ExtractedSchema[] = [];
  const candidates = findRustConfigFiles(dir);

  for (const file of candidates) {
    const src = fs.readFileSync(file, "utf8");
    const structs = parseStructs(src, file);
    results.push(...structs);
  }

  return results;
}

function findRustConfigFiles(dir: string): string[] {
  const found: string[] = [];
  // Config structs are typically in src/config.rs, src/settings.rs, or src/lib.rs
  const candidates = [
    path.join(dir, "src/config.rs"),
    path.join(dir, "src/settings.rs"),
    path.join(dir, "src/lib.rs"),
    path.join(dir, "src/main.rs"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) found.push(c);
  }
  return found;
}

// Extract content between the first matching { } pair starting at pos.
// Tracks depth so nested braces (e.g. derive macros, inline structs) are handled.
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

// Extract the inner type of a generic like Option<T> or Option<Vec<String>>.
// startIdx should point to the opening '<'.
function extractAngleBracketInner(s: string, startIdx: number): string {
  let depth = 0;
  for (let i = startIdx; i < s.length; i++) {
    if (s[i] === "<") depth++;
    else if (s[i] === ">") {
      depth--;
      if (depth === 0) return s.slice(startIdx + 1, i);
    }
  }
  return s.slice(startIdx + 1); // unclosed — return rest
}

function parseStructs(src: string, file: string): ExtractedSchema[] {
  const results: ExtractedSchema[] = [];
  // Find: pub struct FooConfig or struct FooConfig (multiline body via extractBraceBody)
  const re = /(?:pub\s+)?struct\s+(\w*[Cc]onfig\w*)/g;
  let match: RegExpExecArray | null;

  while ((match = re.exec(src)) !== null) {
    const body = extractBraceBody(src, match.index + match[0].length);
    if (body === null) continue;
    results.push({
      struct_name: match[1],
      fields: parseFields(body),
      source_file: file,
    });
  }

  return results;
}

function parseFields(body: string): ExtractedField[] {
  const fields: ExtractedField[] = [];
  // Match: pub field_name: Type, or field_name: Type,
  const fieldRe = /(?:pub\s+)?(\w+)\s*:\s*([^,\n]+)/g;
  let match: RegExpExecArray | null;

  while ((match = fieldRe.exec(body)) !== null) {
    const name = match[1].trim();
    const rawType = match[2].trim().replace(/,$/, "").trim();

    // Skip non-field lines (e.g. lifetime annotations, where clauses)
    if (name.startsWith("_") || name === "where") continue;

    const optional = rawType.startsWith("Option<");
    // Use bracket-depth scanning to correctly unwrap Option<Vec<T>> etc.
    const innerType = optional
      ? extractAngleBracketInner(rawType, rawType.indexOf("<"))
      : rawType;
    const needs_review = /Vec<|HashMap<|BTreeMap<|Box<|Arc<|Rc</.test(
      innerType,
    );

    fields.push({ name, rust_type: innerType, optional, needs_review });
  }

  return fields;
}
