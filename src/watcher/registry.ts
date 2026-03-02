// Watcher: ClawClones Registry
// Polls naturalmoods/clawclones-registry GitHub Issues for newly integrated clones.
// On each run, compares against known adapter list and triggers generator for new/updated ones.
// Designed to run as a daily GitHub Actions cron job.

import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { generateAdapter } from "./generator.js";

// __dirname is available in CJS — no import.meta needed
const REGISTRY_OWNER = "naturalmoods";
const REGISTRY_REPO = "clawclones-registry";
const STATE_FILE = path.resolve(__dirname, "../../.watcher-state.json");
// Note: __dirname here is src/watcher/ at runtime (tsx) or dist/watcher/ after build

interface WatcherState {
  // Maps issue number → last seen GitHub repo URL + head commit
  seen: Record<number, { repo_url: string; head_commit: string }>;
}

interface RegistryIssue {
  number: number;
  title: string;
  body: string;
  labels: Array<{ name: string }>;
  html_url: string;
}

function loadState(): WatcherState {
  if (fs.existsSync(STATE_FILE)) {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) as WatcherState;
  }
  return { seen: {} };
}

function saveState(state: WatcherState): void {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// Fetch integrated issues from the registry via GitHub API
async function fetchIntegratedIssues(): Promise<RegistryIssue[]> {
  const token = process.env.GITHUB_TOKEN;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const url = `https://api.github.com/repos/${REGISTRY_OWNER}/${REGISTRY_REPO}/issues?labels=integrated&state=closed&per_page=100`;
  const res = await fetch(url, { headers });

  if (!res.ok) {
    throw new Error(`Registry API returned ${res.status}: ${await res.text()}`);
  }

  return res.json() as Promise<RegistryIssue[]>;
}

// Extract GitHub repo URL from issue body (nominations include a repo URL line)
function extractRepoUrl(body: string): string | null {
  const match = body.match(/https:\/\/github\.com\/[\w-]+\/[\w-]+/);
  return match?.[0] ?? null;
}

// Get the current HEAD commit of a GitHub repo's default branch
async function getHeadCommit(repoUrl: string): Promise<string | null> {
  const match = repoUrl.match(/github\.com\/([\w-]+\/[\w-]+)/);
  if (!match) return null;

  const token = process.env.GITHUB_TOKEN;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const url = `https://api.github.com/repos/${match[1]}/commits?per_page=1`;
  const res = await fetch(url, { headers });
  if (!res.ok) return null;

  const commits = (await res.json()) as Array<{ sha: string }>;
  return commits[0]?.sha.slice(0, 7) ?? null;
}

async function main(): Promise<void> {
  console.log("[clawport-watcher] Starting registry poll...");
  const state = loadState();
  const issues = await fetchIntegratedIssues();

  let newCount = 0;
  let updatedCount = 0;

  for (const issue of issues) {
    const repoUrl = extractRepoUrl(issue.body);
    if (!repoUrl) {
      console.warn(
        `[watcher] Issue #${issue.number} has no extractable repo URL — skipping`,
      );
      continue;
    }

    const headCommit = await getHeadCommit(repoUrl);
    if (!headCommit) {
      console.warn(`[watcher] Could not get HEAD for ${repoUrl} — skipping`);
      continue;
    }

    const prev = state.seen[issue.number];
    if (prev && prev.head_commit === headCommit) {
      // No change since last run
      continue;
    }

    const isNew = !prev;
    console.log(
      `[watcher] ${isNew ? "NEW" : "UPDATED"} clone detected: ${repoUrl} @ ${headCommit}`,
    );

    // Clone the repo to a temp dir and run extractor + generator
    const tmpDir = fs.mkdtempSync("/tmp/clawport-");
    try {
      execSync(`git clone --depth 1 ${repoUrl} ${tmpDir}`, { stdio: "pipe" });
      await generateAdapter({ repoUrl, repoDir: tmpDir, headCommit, isNew });
      if (isNew) newCount++;
      else updatedCount++;
    } catch (err) {
      console.error(`[watcher] Failed to process ${repoUrl}:`, err);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }

    state.seen[issue.number] = { repo_url: repoUrl, head_commit: headCommit };
  }

  saveState(state);
  console.log(
    `[clawport-watcher] Done. New: ${newCount}, Updated: ${updatedCount}, Total seen: ${issues.length}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
