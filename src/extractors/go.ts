// Extractor: Go
// Parses struct definitions from Go source files.
// Used by the watcher for Go-based clones (PicoClaw, KafClaw, Picobot).

import fs from "fs";
import path from "path";

export interface ExtractedGoField {
  name: string;
  go_type: string;
  json_tag?: string; // from `json:"..."` struct tag
  yaml_tag?: string; // from `yaml:"..."` struct tag
  optional: boolean; // true if pointer type (*T)
  needs_review: boolean; // true if type is map, slice, or interface
}

export interface ExtractedGoSchema {
  struct_name: string;
  fields: ExtractedGoField[];
  source_file: string;
}

export function extractGoSchema(dir: string): ExtractedGoSchema[] {
  const results: ExtractedGoSchema[] = [];
  const candidates = findGoConfigFiles(dir);

  for (const file of candidates) {
    const src = fs.readFileSync(file, "utf8");
    results.push(...parseGoStructs(src, file));
  }

  return results;
}

function findGoConfigFiles(dir: string): string[] {
  const found: string[] = [];
  const candidates = [
    path.join(dir, "config.go"),
    path.join(dir, "internal/config/config.go"),
    path.join(dir, "pkg/config/config.go"),
    path.join(dir, "cmd/config.go"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) found.push(c);
  }
  return found;
}

function parseGoStructs(src: string, file: string): ExtractedGoSchema[] {
  const results: ExtractedGoSchema[] = [];
  // Match: type FooConfig struct { ... }
  const re = /type\s+(\w*[Cc]onfig\w*)\s+struct\s*\{([^}]+)\}/g;
  let match: RegExpExecArray | null;

  while ((match = re.exec(src)) !== null) {
    results.push({
      struct_name: match[1],
      fields: parseGoFields(match[2]),
      source_file: file,
    });
  }

  return results;
}

function parseGoFields(body: string): ExtractedGoField[] {
  const fields: ExtractedGoField[] = [];
  // Match: FieldName Type `json:"..." yaml:"..."`
  const re = /^\s+(\w+)\s+(\S+)(?:\s+`([^`]+)`)?\s*$/gm;
  let match: RegExpExecArray | null;

  while ((match = re.exec(body)) !== null) {
    const name = match[1];
    const go_type = match[2];
    const tags = match[3] ?? "";

    const jsonTag = tags.match(/json:"([^"]+)"/)?.[1];
    const yamlTag = tags.match(/yaml:"([^"]+)"/)?.[1];

    const optional = go_type.startsWith("*");
    const innerType = optional ? go_type.slice(1) : go_type;
    const needs_review = /^map\[|^\[\]|^interface/.test(innerType);

    fields.push({
      name,
      go_type: innerType,
      ...(jsonTag !== undefined && { json_tag: jsonTag }),
      ...(yamlTag !== undefined && { yaml_tag: yamlTag }),
      optional,
      needs_review,
    });
  }

  return fields;
}
