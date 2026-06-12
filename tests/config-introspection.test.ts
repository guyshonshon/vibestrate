import { describe, it, expect } from "vitest";
import {
  configLeafKeys,
  validateConfigPath,
  suggestKeys,
} from "../src/project/config-introspection.js";

describe("configLeafKeys (T8)", () => {
  it("enumerates real settable keys from the schema", () => {
    const keys = configLeafKeys().map((k) => k.fullKey);
    expect(keys).toContain("workflow.maxReviewLoops");
    expect(keys).toContain("commands.validate");
    expect(keys).toContain("git.mainBranch");
    // record containers are leaves (their inner keys are user-named).
    expect(keys).toContain("providers");
  });

  it("carries type, enum, and default metadata", () => {
    const byKey = Object.fromEntries(configLeafKeys().map((k) => [k.fullKey, k]));
    expect(byKey["commands.validate"]!.type).toMatch(/array/);
    expect(byKey["git.mainBranch"]!.default).toBe("main");
  });
});

describe("validateConfigPath (T8)", () => {
  it("accepts a real leaf key", () => {
    expect(validateConfigPath("workflow.maxReviewLoops").ok).toBe(true);
    expect(validateConfigPath("commands.validate").ok).toBe(true);
  });

  it("accepts arbitrary keys under a record container", () => {
    expect(validateConfigPath("providers.claude.command").ok).toBe(true);
    expect(validateConfigPath("profiles.default.provider").ok).toBe(true);
  });

  it("rejects an unknown top-level key and suggests real ones", () => {
    const r = validateConfigPath("provider");
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/not a known config key/i);
    // "provider" appears in providers/profile keys -> suggested.
    expect(r.suggestions?.length).toBeGreaterThan(0);
  });

  it("rejects nesting under a scalar leaf", () => {
    const r = validateConfigPath("workflow.maxReviewLoops.deeper");
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/no nested key/i);
  });

  it("rejects a section (non-leaf) as not a single value", () => {
    const r = validateConfigPath("workflow");
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/section/i);
  });
});

describe("suggestKeys (T8)", () => {
  it("finds keys containing the needle", () => {
    expect(suggestKeys("validate")).toContain("commands.validate");
  });
});
