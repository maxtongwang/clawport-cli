// Shared persona helpers for all adapters.
// Each adapter calls makeParsePersona / makeWritePersona with its native format
// and agent config filename. All format conversions are handled here.

import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import TOML from "@iarna/toml";
import type { AgentPersona, PersonaFile } from "./types.js";

export type AgentConfigFormat = "yaml" | "toml" | "json";

// Factory: returns a parsePersona method bound to a specific format + filename.
export function makeParsePersona(
  format: AgentConfigFormat,
  agentConfigFilename: string,
): (agentDir: string) => AgentPersona | undefined {
  return (agentDir: string): AgentPersona | undefined => {
    const memPath = path.join(agentDir, "MEMORY.md");
    const configPath = path.join(agentDir, agentConfigFilename);
    const persona: AgentPersona = {};
    let found = false;

    if (fs.existsSync(memPath)) {
      persona.memory = fs.readFileSync(memPath, "utf8");
      found = true;
    }
    if (fs.existsSync(configPath)) {
      persona.agent_config = fs.readFileSync(configPath, "utf8");
      persona.agent_config_format = format;
      found = true;
    }

    return found ? persona : undefined;
  };
}

// Factory: returns a writePersona method bound to a specific format + filename.
// Converts incoming content from any format to this adapter's native format.
export function makeWritePersona(
  format: AgentConfigFormat,
  agentConfigFilename: string,
): (persona: AgentPersona) => PersonaFile[] {
  return (persona: AgentPersona): PersonaFile[] => {
    const files: PersonaFile[] = [];

    if (persona.memory !== undefined) {
      files.push({ filename: "MEMORY.md", content: persona.memory });
    }

    if (persona.agent_config !== undefined) {
      const srcFormat = persona.agent_config_format ?? "yaml";
      const content =
        srcFormat === format
          ? persona.agent_config
          : convertConfig(persona.agent_config, srcFormat, format);
      files.push({ filename: agentConfigFilename, content });
    }

    return files;
  };
}

// Convert agent config content between formats using real parsers.
function convertConfig(
  content: string,
  from: AgentConfigFormat,
  to: AgentConfigFormat,
): string {
  let obj: unknown;
  try {
    if (from === "yaml") obj = yaml.load(content);
    else if (from === "toml") obj = TOML.parse(content);
    else obj = JSON.parse(content);
  } catch {
    const comment = to === "json" ? "// " : "# ";
    return `${comment}(parse error converting from ${from} to ${to})\n`;
  }

  if (typeof obj !== "object" || obj === null) obj = {};
  const record = obj as Record<string, unknown>;

  if (to === "yaml") return yaml.dump(record);
  if (to === "json") return JSON.stringify(record, null, 2) + "\n";
  return serializeToml(record);
}

// Flat-object TOML serializer — primitives only; nested values get commented.
function serializeToml(obj: Record<string, unknown>): string {
  const lines: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "string") {
      lines.push(`${k} = "${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`);
    } else if (typeof v === "number" || typeof v === "boolean") {
      lines.push(`${k} = ${v}`);
    } else {
      lines.push(`# ${k}: (complex value — manual migration required)`);
    }
  }
  return lines.join("\n") + "\n";
}
