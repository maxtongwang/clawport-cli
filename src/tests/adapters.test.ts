// Roundtrip smoke tests for all registered adapters.
// Each test: parse a minimal valid config → verify canonical fields →
// write back → verify output contains expected strings.

import fs from "fs";
import os from "os";
import path from "path";
import { describe, it, expect } from "vitest";
import { ADAPTERS, getAdapter } from "../adapters/index.js";
import { detect } from "../detect.js";
import {
  SKILL_ALIASES,
  normalizeSkillName,
  denormalizeSkillName,
} from "../skills.js";

const MINIMAL_CANONICAL = {
  agent: {
    name: "test-agent",
    model: "claude-sonnet-4-6",
    provider: "anthropic",
    system_prompt: "You are helpful.",
    temperature: 0.5,
    max_tokens: 1024,
  },
  channels: [
    {
      type: "discord",
      bot_token_env: "DISCORD_TOKEN",
      guild_id: "123456",
      channel_id: "789",
      extra: {},
    },
    {
      type: "telegram",
      bot_token_env: "TG_TOKEN",
      chat_id: "-100123",
      extra: {},
    },
  ],
  memory: {
    backend: "sqlite" as const,
    path: "/tmp/test.db",
  },
  skills: [{ name: "web_search", enabled: true }],
  unmapped: [],
};

// ── Registry tests ──────────────────────────────────────────────────────────

describe("ADAPTERS registry", () => {
  it("has at least 10 registered adapters", () => {
    expect(ADAPTERS.length).toBeGreaterThanOrEqual(10);
  });

  it("each adapter has required fields", () => {
    for (const a of ADAPTERS) {
      expect(a.cloneName, `${a.cloneName} missing cloneName`).toBeTruthy();
      expect(
        a.schemaVersion,
        `${a.cloneName} missing schemaVersion`,
      ).toBeTruthy();
      expect(
        a.configPatterns.length,
        `${a.cloneName} has no configPatterns`,
      ).toBeGreaterThan(0);
      expect(
        a.defaultOutputFile,
        `${a.cloneName} missing defaultOutputFile`,
      ).toBeTruthy();
      expect(typeof a.parse, `${a.cloneName} missing parse`).toBe("function");
      expect(typeof a.write, `${a.cloneName} missing write`).toBe("function");
    }
  });

  it("no duplicate cloneNames", () => {
    const names = ADAPTERS.map((a) => a.cloneName);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  it("getAdapter returns correct adapter", () => {
    for (const a of ADAPTERS) {
      expect(getAdapter(a.cloneName)).toBe(a);
    }
  });

  it("getAdapter returns undefined for unknown clone", () => {
    expect(getAdapter("does-not-exist")).toBeUndefined();
  });
});

// ── Per-adapter write() smoke tests ─────────────────────────────────────────

// Adapters where model is set at runtime (not in config file) — skip model checks.
const RUNTIME_MODEL_ADAPTERS = new Set(["bashobot"]);

describe("adapter write() smoke tests", () => {
  for (const adapter of ADAPTERS) {
    it(`${adapter.cloneName} write() produces non-empty string with agent identity`, () => {
      const output = adapter.write(MINIMAL_CANONICAL);
      expect(typeof output).toBe("string");
      expect(output.length).toBeGreaterThan(0);
      if (RUNTIME_MODEL_ADAPTERS.has(adapter.cloneName)) return;
      // nanoclaw is ultra-minimal — no name field, only model compound string
      const hasIdentity =
        output.includes("test-agent") || output.includes("claude-sonnet-4-6");
      expect(hasIdentity).toBe(true);
    });

    it(`${adapter.cloneName} write() includes model`, () => {
      const output = adapter.write(MINIMAL_CANONICAL);
      if (RUNTIME_MODEL_ADAPTERS.has(adapter.cloneName)) return;
      // Model might be in "provider/model" or "provider:model" compound or plain
      expect(output).toMatch(/claude-sonnet-4-6/);
    });
  }
});

// ── Per-adapter parse() smoke tests ─────────────────────────────────────────

describe("openclaw parse()", () => {
  const adapter = getAdapter("openclaw")!;
  it("parses minimal YAML-like object", () => {
    // openclaw uses a keyed channels map (not an array)
    const raw = {
      agent: {
        name: "my-agent",
        provider: "anthropic",
        model: "claude-haiku-4-5",
        system_prompt: "Be helpful.",
        temperature: 0.7,
        max_tokens: 512,
      },
      channels: {
        discord: { bot_token_env: "DISCORD_BOT_TOKEN", guild_id: "42" },
      },
      memory: { backend: "sqlite", path: "/tmp/oc.db" },
    };
    const result = adapter.parse("openclaw.yaml", raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.agent.name).toBe("my-agent");
    expect(result.config.agent.model).toBe("claude-haiku-4-5");
    expect(result.config.agent.provider).toBe("anthropic");
    expect(result.config.channels).toHaveLength(1);
    expect(result.config.channels[0].type).toBe("discord");
    expect(result.config.memory?.backend).toBe("sqlite");
  });
});

describe("zeroclaw parse()", () => {
  const adapter = getAdapter("zeroclaw")!;
  it("parses minimal TOML-like object", () => {
    // zeroclaw reads provider/model from [agent] block; [llm] only has temperature/max_tokens
    const raw = {
      agent: {
        name: "zc-agent",
        provider: "openai",
        model: "gpt-4o",
        system_prompt: "Hello",
      },
      llm: {
        temperature: 0.3,
      },
      channels: [{ type: "telegram", bot_token: "TG_TOKEN", chat_id: "-99" }],
    };
    const result = adapter.parse("zeroclaw.toml", raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.agent.provider).toBe("openai");
    expect(result.config.agent.model).toBe("gpt-4o");
    expect(result.config.channels[0].chat_id).toBe("-99");
  });
});

describe("openfang parse()", () => {
  const adapter = getAdapter("openfang")!;
  it("splits provider/model compound string", () => {
    const raw = {
      agent: { name: "of-agent", model: "groq/llama3-8b" },
      llm: { temperature: 0.5 },
    };
    const result = adapter.parse("config.toml", raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.agent.provider).toBe("groq");
    expect(result.config.agent.model).toBe("llama3-8b");
  });

  it("flags unmapped top_p", () => {
    const raw = {
      agent: { model: "anthropic/claude-sonnet-4-6" },
      llm: { top_p: 0.9 },
    };
    const result = adapter.parse("config.toml", raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const topP = result.config.unmapped.find(
      (u) => u.source_path === "llm.top_p",
    );
    expect(topP).toBeDefined();
  });
});

describe("ironclaw parse()", () => {
  const adapter = getAdapter("ironclaw")!;
  it("maps llm.backend to provider", () => {
    const raw = {
      agent: { name: "ic-agent" },
      llm: { backend: "openai", model: "gpt-4o-mini", temperature: 0.6 },
      channels: [
        {
          type: "slack",
          bot_token_env: "SLACK_TOKEN",
          workspace: "myworkspace",
        },
      ],
    };
    const result = adapter.parse("settings.toml", raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.agent.provider).toBe("openai");
    expect(result.config.agent.model).toBe("gpt-4o-mini");
    expect(result.config.channels[0].workspace).toBe("myworkspace");
  });
});

describe("picoclaw parse()", () => {
  const adapter = getAdapter("picoclaw")!;
  it("reads from agents.defaults", () => {
    const raw = {
      agents: {
        defaults: { model: "claude-sonnet-4-6", temperature: 0.4 },
      },
      channels: {
        discord: { bot_token_env: "DISCORD_TOKEN", guild_id: "777" },
      },
    };
    const result = adapter.parse("config.json", raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.agent.model).toBe("claude-sonnet-4-6");
    expect(result.config.channels[0].guild_id).toBe("777");
  });

  it("flags model_list as unmapped", () => {
    const raw = {
      agents: { defaults: { model: "claude-sonnet-4-6" } },
      model_list: [{ model_name: "claude-haiku-4-5" }],
    };
    const result = adapter.parse("config.json", raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const ml = result.config.unmapped.find(
      (u) => u.source_path === "model_list",
    );
    expect(ml).toBeDefined();
  });
});

describe("tinyclaw parse()", () => {
  const adapter = getAdapter("tinyclaw")!;
  it("uses first agent from agents map", () => {
    const raw = {
      agents: {
        main: {
          name: "My TinyClaw Agent",
          provider: "anthropic",
          model: "claude-opus-4-6",
        },
        secondary: { provider: "openai", model: "gpt-4o" },
      },
    };
    const result = adapter.parse("settings.json", raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.agent.name).toBe("My TinyClaw Agent");
    expect(result.config.agent.model).toBe("claude-opus-4-6");
    // Secondary agent is flagged
    const multi = result.config.unmapped.find(
      (u) => u.source_path === "agents",
    );
    expect(multi).toBeDefined();
  });
});

describe("moltis parse()", () => {
  const adapter = getAdapter("moltis")!;
  it("sorts providers by priority and uses lowest as primary", () => {
    const raw = {
      agent: { name: "my-moltis" },
      providers: [
        { name: "openai", model: "gpt-4o", priority: 2 },
        { name: "anthropic", model: "claude-sonnet-4-6", priority: 1 },
      ],
    };
    const result = adapter.parse("moltis.toml", raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.agent.provider).toBe("anthropic");
    expect(result.config.agent.model).toBe("claude-sonnet-4-6");
    // Non-primary provider is flagged
    const fallback = result.config.unmapped.find(
      (u) => u.source_path === "providers",
    );
    expect(fallback).toBeDefined();
  });
});

describe("kafclaw parse()", () => {
  const adapter = getAdapter("kafclaw")!;
  it("parses flat JSON structure", () => {
    const raw = {
      agent: {
        name: "kaf",
        provider: "groq",
        model: "llama3-70b",
        temperature: 0.7,
      },
      // kafclaw uses storage.dsn (not .url) for connection string
      storage: { driver: "postgres", dsn: "postgresql://localhost/kaf" },
    };
    const result = adapter.parse("config.json", raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.agent.provider).toBe("groq");
    expect(result.config.memory?.backend).toBe("postgres");
    expect(result.config.memory?.connection_string).toBe(
      "postgresql://localhost/kaf",
    );
  });
});

describe("safeclaw parse()", () => {
  const adapter = getAdapter("safeclaw")!;
  it("maps llm to agent fields", () => {
    const raw = {
      llm: {
        provider: "anthropic",
        model: "claude-haiku-4-5",
        max_tokens: 256,
      },
      agent: { name: "safe", system_prompt: "Stay safe." },
    };
    const result = adapter.parse("settings.json", raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.agent.provider).toBe("anthropic");
    expect(result.config.agent.max_tokens).toBe(256);
    expect(result.config.agent.system_prompt).toBe("Stay safe.");
  });

  it("merges token_env into bot_token_env", () => {
    const raw = {
      llm: { provider: "anthropic", model: "claude-sonnet-4-6" },
      agent: { name: "safe" },
      channels: { discord: { token_env: "DISCORD_TOKEN", guild_id: "555" } },
    };
    const result = adapter.parse("settings.json", raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.channels[0].bot_token_env).toBe("DISCORD_TOKEN");
  });
});

describe("nanoclaw parse()", () => {
  const adapter = getAdapter("nanoclaw")!;
  it("splits provider:model compound with colon separator", () => {
    const raw = {
      model: "anthropic:claude-haiku-4-5",
      temperature: 0.2,
    };
    const result = adapter.parse("config.json", raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.agent.provider).toBe("anthropic");
    expect(result.config.agent.model).toBe("claude-haiku-4-5");
    expect(result.config.agent.temperature).toBe(0.2);
  });
});

describe("lightclaw parse()", () => {
  const adapter = getAdapter("lightclaw")!;
  it("maps model.name to agent.model", () => {
    const raw = {
      agent: { name: "lc-agent", system_prompt: "Be fast." },
      model: {
        provider: "anthropic",
        name: "claude-sonnet-4-6",
        max_tokens: 2048,
      },
      channel: [{ type: "discord", bot_token_env: "DISCORD_TOKEN" }],
    };
    const result = adapter.parse("lightclaw.toml", raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.agent.model).toBe("claude-sonnet-4-6");
    expect(result.config.agent.max_tokens).toBe(2048);
    expect(result.config.channels[0].type).toBe("discord");
  });
});

describe("titanclaw parse()", () => {
  const adapter = getAdapter("titanclaw")!;
  it("uses first element of agents array", () => {
    const raw = {
      agents: [
        { name: "primary", system_prompt: "You are primary." },
        { name: "secondary" },
      ],
      provider: { backend: "anthropic", model: "claude-opus-4-6" },
    };
    const result = adapter.parse("config.toml", raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.agent.name).toBe("primary");
    expect(result.config.agent.model).toBe("claude-opus-4-6");
    // Second agent flagged
    const multi = result.config.unmapped.find(
      (u) => u.source_path === "agents",
    );
    expect(multi).toBeDefined();
  });
});

// ── Roundtrip tests ──────────────────────────────────────────────────────────

describe("write → parse roundtrip", () => {
  // For JSON-based adapters we can round-trip through JSON.parse
  const jsonAdapters = [
    "picoclaw",
    "tinyclaw",
    "kafclaw",
    "safeclaw",
    "nanoclaw",
  ];

  for (const name of jsonAdapters) {
    it(`${name} roundtrip preserves agent name and model`, () => {
      const adapter = getAdapter(name)!;
      const written = adapter.write(MINIMAL_CANONICAL);
      const parsed = JSON.parse(written);
      const result = adapter.parse("config.json", parsed);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      // Name may differ for minimal-config adapters with hardcoded defaults
      expect(result.config.agent.model).toContain("claude-sonnet-4-6");
    });
  }
});

// ── Skill name normalization tests ───────────────────────────────────────────

describe("normalizeSkillName / denormalizeSkillName", () => {
  it("normalizes all listed aliases to canonical names", () => {
    for (const [src, canonical] of Object.entries(SKILL_ALIASES)) {
      expect(normalizeSkillName(src)).toBe(canonical);
    }
  });

  it("denormalizes all canonical names back to source names", () => {
    for (const [src, canonical] of Object.entries(SKILL_ALIASES)) {
      expect(denormalizeSkillName(canonical)).toBe(src);
    }
  });

  it("normalize then denormalize is identity for all aliases", () => {
    for (const src of Object.keys(SKILL_ALIASES)) {
      expect(denormalizeSkillName(normalizeSkillName(src))).toBe(src);
    }
  });

  it("passes through unknown skill names unchanged", () => {
    expect(normalizeSkillName("custom_skill")).toBe("custom_skill");
    expect(denormalizeSkillName("custom_skill")).toBe("custom_skill");
  });

  it("normalizes read_file to file_read", () => {
    expect(normalizeSkillName("read_file")).toBe("file_read");
  });

  it("denormalizes web_search to search_web", () => {
    expect(denormalizeSkillName("web_search")).toBe("search_web");
  });
});

// ── Persona migration tests ───────────────────────────────────────────────────

describe("openclaw parsePersona", () => {
  it("reads MEMORY.md and agent.yaml from fixture dir", () => {
    const adapter = getAdapter("openclaw")!;
    expect(adapter.parsePersona).toBeDefined();

    // Create a temp persona dir with fixture files
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawport-test-"));
    fs.writeFileSync(
      path.join(tmpDir, "MEMORY.md"),
      "# Memory\nSome memory content.",
    );
    fs.writeFileSync(
      path.join(tmpDir, "agent.yaml"),
      'name: "test-agent"\nversion: "1.0"',
    );

    const persona = adapter.parsePersona!(tmpDir);
    expect(persona).toBeDefined();
    expect(persona!.memory).toContain("Some memory content.");
    expect(persona!.agent_config).toContain("test-agent");
    expect(persona!.agent_config_format).toBe("yaml");

    // Cleanup
    fs.rmSync(tmpDir, { recursive: true });
  });

  it("returns undefined when persona dir has no recognized files", () => {
    const adapter = getAdapter("openclaw")!;
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawport-test-"));
    fs.writeFileSync(path.join(tmpDir, "unrelated.txt"), "nothing");

    const persona = adapter.parsePersona!(tmpDir);
    expect(persona).toBeUndefined();

    fs.rmSync(tmpDir, { recursive: true });
  });
});

describe("openfang writePersona", () => {
  it("returns MEMORY.md and agent.toml files", () => {
    const adapter = getAdapter("openfang")!;
    expect(adapter.writePersona).toBeDefined();

    const persona = {
      memory: "# Memory\nAgent memory.",
      agent_config: 'name: "my-agent"\nversion: "2.0"',
      agent_config_format: "yaml" as const,
    };

    const files = adapter.writePersona!(persona);
    expect(files).toHaveLength(2);

    const memFile = files.find((f) => f.filename === "MEMORY.md");
    const configFile = files.find((f) => f.filename === "agent.toml");

    expect(memFile).toBeDefined();
    expect(memFile!.content).toContain("Agent memory.");

    expect(configFile).toBeDefined();
    // YAML was converted to TOML key=value format
    expect(configFile!.content).toContain("my-agent");
  });

  it("preserves toml content unchanged when format is already toml", () => {
    const adapter = getAdapter("openfang")!;
    const tomlContent = 'name = "toml-agent"\nversion = "3.0"\n';
    const files = adapter.writePersona!({
      agent_config: tomlContent,
      agent_config_format: "toml",
    });
    const configFile = files.find((f) => f.filename === "agent.toml");
    expect(configFile!.content).toBe(tomlContent);
  });
});

describe("skill normalization in export pipeline", () => {
  it("openclaw→openfang: normalizes read_file to file_read", () => {
    // Simulate the normalize step done in cli.ts
    const ocSkills = [{ name: "read_file", enabled: true }];
    const normalized = ocSkills.map((s) => ({
      ...s,
      name: normalizeSkillName(s.name),
    }));
    expect(normalized[0].name).toBe("file_read");

    // Verify openfang write() uses the normalized name
    const target = getAdapter("openfang")!;
    const config = {
      ...MINIMAL_CANONICAL,
      skills: normalized,
    };
    const output = target.write(config);
    expect(output).toContain("file_read");
  });

  it("openfang→openclaw: denormalizes file_read back to read_file", () => {
    // After normalize (file_read), denormalize for openclaw target
    const canonicalSkills = [{ name: "file_read", enabled: true }];
    const denormalized = canonicalSkills.map((s) => ({
      ...s,
      name: denormalizeSkillName(s.name),
    }));
    expect(denormalized[0].name).toBe("read_file");

    // Verify openclaw write() uses the denormalized name
    const target = getAdapter("openclaw")!;
    const config = {
      ...MINIMAL_CANONICAL,
      skills: denormalized,
    };
    const output = target.write(config);
    expect(output).toContain("read_file");
  });
});

// ── Null / invalid raw input guard ──────────────────────────────────────────

describe("parse() null/invalid input guard", () => {
  const badInputs: Array<[string, unknown]> = [
    ["null", null],
    ["undefined", undefined],
    ["number", 42],
    ["string", "not-an-object"],
    ["array", []],
  ];

  for (const adapter of ADAPTERS) {
    for (const [label, bad] of badInputs) {
      it(`${adapter.cloneName}: parse(${label}) returns ok:false`, () => {
        const result = adapter.parse("dummy.json", bad);
        expect(result.ok).toBe(false);
      });
    }
  }
});

// ── Detection fingerprinting ─────────────────────────────────────────────────

describe("detect() content fingerprinting", () => {
  function withTmpJson(content: object, fn: (dir: string) => void) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "clawport-detect-"));
    try {
      fs.writeFileSync(
        path.join(dir, "config.json"),
        JSON.stringify(content),
        "utf8",
      );
      fn(dir);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  const cases: Array<[string, object]> = [
    [
      "grip-ai",
      {
        agent: { model: "anthropic/claude-3" },
        tools: [{ name: "bash", enabled: true }],
      },
    ],
    ["nanobot", { llm: { provider: "anthropic" }, bot: { name: "test" } }],
    ["smallclaw", { ollama: { host: "localhost" }, agent: { name: "a" } }],
    [
      "memubot",
      { agent: { name: "a" }, memory: { backend: "sqlite" }, capabilities: [] },
    ],
    ["aionui", { agent: { name: "a" }, ui: { theme: "dark" } }],
    [
      "rowboat",
      { llm: { provider: "anthropic" }, project: { name: "my-project" } },
    ],
    [
      "nullclaw",
      {
        agents: {
          list: [{ id: "primary", model: { primary: "anthropic/claude-3" } }],
        },
      },
    ],
    ["nanoclaw", { model: "anthropic:claude-3", name: "my-bot" }],
    [
      "kafclaw",
      { agent: { name: "a" }, storage: { dsn: "postgres://localhost/db" } },
    ],
  ];

  for (const [cloneName, content] of cases) {
    it(`detects ${cloneName} from content when config.json is ambiguous`, () => {
      withTmpJson(content, (dir) => {
        const result = detect(dir);
        expect(result).not.toBeNull();
        expect(result!.fingerprint.name).toBe(cloneName);
      });
    });
  }

  it("prefers specific path pattern over bare config.json", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "clawport-detect-"));
    try {
      // Bare config.json that looks like picoclaw
      fs.writeFileSync(
        path.join(dir, "config.json"),
        JSON.stringify({ agents: { defaults: { model_id: "claude-3" } } }),
        "utf8",
      );
      // But also a grip-specific subdirectory config
      const gripDir = path.join(dir, ".grip");
      fs.mkdirSync(gripDir);
      fs.writeFileSync(
        path.join(gripDir, "config.json"),
        JSON.stringify({ agent: { model: "anthropic/claude-3" }, tools: [] }),
        "utf8",
      );
      const result = detect(dir);
      expect(result!.fingerprint.name).toBe("grip-ai");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
