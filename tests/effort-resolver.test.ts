import { describe, it, expect } from "vitest";
import { resolveEffort } from "../src/core/effort-resolver.js";
import type { ProjectConfig } from "../src/project/config-schema.js";

// Minimal ProjectConfig fixture — only the fields the resolver actually
// reads. The rest is unused in this code path.
function cfg(overrides: Partial<ProjectConfig> = {}): ProjectConfig {
  return {
    providers: {
      claude: { type: "cli", command: "claude", args: [], input: "stdin" },
      codex: { type: "cli", command: "codex", args: [], input: "stdin" },
    },
    effortMap: {},
    ...overrides,
  } as unknown as ProjectConfig;
}

describe("resolveEffort", () => {
  it("returns agentDefault when neither effort nor override is set", () => {
    const r = resolveEffort({ effort: null, providerOverride: null, config: cfg() });
    expect(r.providerId).toBeNull();
    expect(r.source).toBe("agentDefault");
  });

  it("explicit providerOverride wins over effort", () => {
    const r = resolveEffort({
      effort: "low",
      providerOverride: "codex",
      config: cfg({
        effortMap: { low: "claude" },
      } as Partial<ProjectConfig>),
    });
    expect(r.providerId).toBe("codex");
    expect(r.source).toBe("providerOverride");
  });

  it("rejects a providerOverride that isn't in project.yml#providers", () => {
    const r = resolveEffort({
      effort: null,
      providerOverride: "nope",
      config: cfg(),
    });
    expect(r.providerId).toBeNull();
    expect(r.source).toBe("agentDefault");
    expect(r.note).toMatch(/"nope".*isn't configured/);
  });

  it("resolves effort via effortMap when the entry + provider both exist", () => {
    const r = resolveEffort({
      effort: "high",
      providerOverride: null,
      config: cfg({
        effortMap: { high: "codex" },
      } as Partial<ProjectConfig>),
    });
    expect(r.providerId).toBe("codex");
    expect(r.source).toBe("effortMap");
  });

  it("falls back to agentDefault when the effortMap key is missing", () => {
    const r = resolveEffort({
      effort: "low",
      providerOverride: null,
      config: cfg({ effortMap: {} } as Partial<ProjectConfig>),
    });
    expect(r.providerId).toBeNull();
    expect(r.source).toBe("agentDefault");
    expect(r.note).toMatch(/no providers\.effortMap\[low\]/);
  });

  it("falls back to agentDefault when effortMap points at an unknown provider id", () => {
    const r = resolveEffort({
      effort: "medium",
      providerOverride: null,
      config: cfg({
        effortMap: { medium: "ghost" },
      } as Partial<ProjectConfig>),
    });
    expect(r.providerId).toBeNull();
    expect(r.source).toBe("agentDefault");
    expect(r.note).toMatch(/"ghost".*isn't in project\.yml/);
  });

  it("each fallback note is honest enough to debug from", () => {
    // The note should always name the failing key/value so the user can
    // fix the config without reading source. Regression guard.
    const cases = [
      {
        effort: "low" as const,
        providerOverride: null,
        config: cfg({ effortMap: {} } as Partial<ProjectConfig>),
        wantSubstr: "no providers.effortMap[low]",
      },
      {
        effort: "high" as const,
        providerOverride: null,
        config: cfg({
          effortMap: { high: "ghost" },
        } as Partial<ProjectConfig>),
        wantSubstr: '"ghost"',
      },
      {
        effort: null,
        providerOverride: "ghost",
        config: cfg(),
        wantSubstr: '"ghost"',
      },
    ];
    for (const c of cases) {
      const r = resolveEffort(c);
      expect(r.note).toContain(c.wantSubstr);
    }
  });
});
