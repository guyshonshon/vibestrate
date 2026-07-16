import { describe, it, expect } from "vitest";
import {
  profileConfigSchema,
  profilesConfigSchema,
} from "../src/agents/profile-schema.js";

// The per-profile `budget` field was removed: it was never read at runtime, so
// it changed nothing. These lock in (a) that old configs carrying it still load
// - we strip the legacy key instead of failing the whole project - and (b) that
// the schema is otherwise still strict, so a genuinely unknown key is rejected.
describe("profile schema after budget removal", () => {
  it("tolerates and drops a legacy `budget` key", () => {
    const parsed = profileConfigSchema.parse({
      provider: "claude",
      label: "Claude balanced",
      power: "medium",
      budget: "medium", // legacy - written by the old init template
    });
    expect(parsed).not.toHaveProperty("budget");
    expect(parsed.provider).toBe("claude");
    expect(parsed.power).toBe("medium");
  });

  it("drops legacy `budget` across a whole profiles map", () => {
    const parsed = profilesConfigSchema.parse({
      "claude-balanced": { provider: "claude", budget: "low" },
      "codex-fast": { provider: "codex", power: "low" },
    });
    expect(parsed["claude-balanced"]).not.toHaveProperty("budget");
    expect(parsed["codex-fast"]?.power).toBe("low");
  });

  it("still rejects a genuinely unknown key (strictness preserved)", () => {
    expect(() =>
      profileConfigSchema.parse({ provider: "claude", bogusKnob: "x" }),
    ).toThrow();
  });

  it("parses a clean profile without a budget key", () => {
    const parsed = profileConfigSchema.parse({ provider: "claude", power: "high" });
    expect(parsed.provider).toBe("claude");
    expect(parsed.power).toBe("high");
    expect(parsed.model).toBeNull();
  });
});
