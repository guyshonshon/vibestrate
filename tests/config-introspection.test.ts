import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  configLeafKeys,
  configValueHints,
  validateConfigPath,
  walkObjectSchema,
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

  it("exposes the posture auto-apply keys, default off (Slice 2b)", () => {
    const byKey = Object.fromEntries(configLeafKeys().map((k) => [k.fullKey, k]));
    expect(byKey["posture.autoApplySandbox"]).toBeDefined();
    expect(byKey["posture.autoApplyApproval"]).toBeDefined();
    expect(byKey["posture.autoApplySandbox"]!.default).toBe(false);
    expect(byKey["posture.autoApplyApproval"]!.default).toBe(false);
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

describe("configValueHints (config set K = V)", () => {
  it("renders current leaf values as a fullKey -> display map", () => {
    const hints = configValueHints({
      git: { mainBranch: "develop", snapshotRetentionRuns: 3 },
      execution: { isolation: "sandboxed" },
    });
    expect(hints["git.mainBranch"]).toBe("develop");
    expect(hints["git.snapshotRetentionRuns"]).toBe("3");
    expect(hints["execution.isolation"]).toBe("sandboxed");
  });

  it("falls back to the schema default when the config omits a key", () => {
    const hints = configValueHints({});
    expect(hints["git.mainBranch"]).toBe("main");
    expect(hints["policies.forbidMainBranchWrites"]).toBe("true");
  });

  it("skips record-container leaves (no single value to show)", () => {
    const hints = configValueHints({ providers: { claude: { command: "claude" } } });
    expect(hints["providers"]).toBeUndefined();
  });

  it("formats arrays compactly", () => {
    const hints = configValueHints({
      commands: { validate: ["pnpm test", "pnpm build"] },
    });
    expect(hints["commands.validate"]).toBe("[pnpm test, pnpm build]");
  });

  it("returns an empty map for a non-object config", () => {
    expect(configValueHints(null)).toEqual({});
    expect(configValueHints("nope")).toEqual({});
  });
});

describe("field descriptions (.describe())", () => {
  it("captures .describe() text on a leaf, in any chain position", () => {
    const schema = z.object({
      a: z.string().default("x").describe("desc A"),
      b: z.number().describe("desc B").optional(),
      c: z.boolean().default(false), // no describe -> no tip
    });
    const fields = Object.fromEntries(
      walkObjectSchema(schema as z.ZodObject<z.ZodRawShape>).map((f) => [f.key, f]),
    );
    expect(fields.a!.description).toBe("desc A");
    expect(fields.b!.description).toBe("desc B");
    expect(fields.c!.description).toBeUndefined();
  });

  it("surfaces real schema tips on settable keys (e.g. execution.isolation)", () => {
    const byKey = Object.fromEntries(configLeafKeys().map((k) => [k.fullKey, k]));
    expect(byKey["execution.isolation"]!.description).toBeTruthy();
    // Enough keys are annotated that the completion list is genuinely helpful.
    expect(configLeafKeys().filter((k) => k.description).length).toBeGreaterThan(5);
  });
});
