// Extractor: Python
// Parses Pydantic models and dataclasses from Python source files.
// Used by the watcher for Python-based clones (SafeClaw, CoPaw, Freeclaw, etc.).

import fs from "fs";
import path from "path";

export interface ExtractedPyField {
  name: string;
  py_type: string;
  optional: boolean; // true if Optional[T] or default=None
  needs_review: boolean; // true if type is dict, list, or union
}

export interface ExtractedPySchema {
  class_name: string;
  fields: ExtractedPyField[];
  source_file: string;
}

export function extractPySchema(dir: string): ExtractedPySchema[] {
  const results: ExtractedPySchema[] = [];
  const candidates = findPyConfigFiles(dir);

  for (const file of candidates) {
    const src = fs.readFileSync(file, "utf8");
    results.push(...parsePyClasses(src, file));
  }

  return results;
}

function findPyConfigFiles(dir: string): string[] {
  const found: string[] = [];
  const candidates = [
    path.join(dir, "config.py"),
    path.join(dir, "src/config.py"),
    path.join(dir, "settings.py"),
    path.join(dir, "src/settings.py"),
    path.join(dir, "models/config.py"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) found.push(c);
  }
  return found;
}

function parsePyClasses(src: string, file: string): ExtractedPySchema[] {
  const results: ExtractedPySchema[] = [];
  // Match: class FooConfig(BaseModel): or class FooConfig:
  const classRe =
    /class\s+(\w*[Cc]onfig\w*)\s*(?:\([^)]*\))?\s*:((?:\n[ \t]+[^\n]+)*)/g;
  let match: RegExpExecArray | null;

  while ((match = classRe.exec(src)) !== null) {
    const className = match[1];
    const body = match[2];
    results.push({
      class_name: className,
      fields: parsePyFields(body),
      source_file: file,
    });
  }

  return results;
}

function parsePyFields(body: string): ExtractedPyField[] {
  const fields: ExtractedPyField[] = [];
  // Match: field_name: Type or field_name: Type = default
  const re = /^\s+(\w+)\s*:\s*([^\n=#]+?)(?:\s*=\s*([^\n]+))?$/gm;
  let match: RegExpExecArray | null;

  while ((match = re.exec(body)) !== null) {
    const name = match[1];
    const py_type = match[2].trim();
    const default_val = match[3]?.trim();

    if (name === "class" || name === "def") continue;

    const optional =
      py_type.startsWith("Optional[") ||
      py_type.includes("| None") ||
      default_val === "None";

    const innerType = py_type.startsWith("Optional[")
      ? py_type.slice(9, -1)
      : py_type;

    const needs_review = /dict\[|list\[|Dict\[|List\[|Union\[/.test(innerType);

    fields.push({ name, py_type: innerType, optional, needs_review });
  }

  return fields;
}
