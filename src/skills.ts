// Bidirectional skill name alias map.
// Canonical convention = noun-first (OpenFang convention).
// Source-convention names (verb-first) map to canonical names.
// Unknown names pass through unchanged — roundtrip safe for any unlisted skill.

// Map: source-convention name → canonical name
export const SKILL_ALIASES: Record<string, string> = {
  read_file: "file_read",
  write_file: "file_write",
  list_files: "file_list",
  delete_file: "file_delete",
  search_web: "web_search",
  fetch_url: "web_fetch",
  run_code: "code_run",
  execute_bash: "bash_execute",
  send_email: "email_send",
  read_email: "email_read",
};

// Reverse map: canonical → source-convention (generated at module load)
const SKILL_ALIASES_REVERSE: Record<string, string> = Object.fromEntries(
  Object.entries(SKILL_ALIASES).map(([k, v]) => [v, k]),
);

// Normalize a skill name from source-convention to canonical (noun-first).
// Unknown names are returned unchanged.
export function normalizeSkillName(name: string): string {
  return SKILL_ALIASES[name] ?? name;
}

// Denormalize a skill name from canonical back to source-convention (verb-first).
// Unknown names are returned unchanged.
export function denormalizeSkillName(name: string): string {
  return SKILL_ALIASES_REVERSE[name] ?? name;
}
