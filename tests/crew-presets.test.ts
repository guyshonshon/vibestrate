import { describe, it, expect } from "vitest";
import {
  CREW_PRESETS,
  PRESET_ROSTER,
  effortForTier,
  presetProfileId,
  buildPresetCrew,
  planPreset,
  type ProviderInfo,
} from "../src/crews/crew-presets.js";

const claude: ProviderInfo = {
  id: "claude",
  isLocal: true,
  powerLevels: ["low", "medium", "high"],
  modelEnabled: true,
  cheapModel: "haiku",
};
const geminiNoEffort: ProviderInfo = {
  id: "gemini",
  isLocal: true,
  powerLevels: [],
  modelEnabled: true,
  cheapModel: "gemini-2.5-flash-lite",
};
const openaiCloud: ProviderInfo = {
  id: "openai",
  isLocal: false,
  powerLevels: ["low", "high"],
  modelEnabled: true,
  cheapModel: "o4-mini",
};
const localNoModel: ProviderInfo = {
  id: "ollama",
  isLocal: true,
  powerLevels: [],
  modelEnabled: false,
  cheapModel: null,
};

const ROLES_DIR = ".vibestrate/roles";

describe("preset primitives", () => {
  it("effort: fast = lowest, thorough = highest, empty = null", () => {
    expect(effortForTier("fast", ["low", "medium", "high"])).toBe("low");
    expect(effortForTier("thorough", ["low", "medium", "high"])).toBe("high");
    expect(effortForTier("fast", [])).toBeNull();
  });

  it("the four presets are fast / thorough / cheap / local", () => {
    expect(CREW_PRESETS.map((p) => p.id).sort()).toEqual([
      "cheap",
      "fast",
      "local",
      "thorough",
    ]);
  });

  it("buildPresetCrew mirrors the roster on the given profile", () => {
    const crew = buildPresetCrew("fast", presetProfileId("claude", "fast"), ROLES_DIR);
    expect(Object.keys(crew.roles).sort()).toEqual(PRESET_ROSTER.map((r) => r.id).sort());
    for (const r of PRESET_ROSTER) {
      expect(crew.roles[r.id]!.profile).toBe("claude-fast");
      expect(crew.roles[r.id]!.prompt).toBe(`${ROLES_DIR}/${r.id}.md`);
      expect(crew.roles[r.id]!.seats).toEqual(r.seats);
    }
  });
});

describe("planPreset", () => {
  const ctx = (defaultProviderRef: string, providers: ProviderInfo[]) => ({
    defaultProviderRef,
    providers,
    rolesDirRel: ROLES_DIR,
  });

  it("fast = lowest effort + 1 review loop", () => {
    const plan = planPreset("fast", ctx("claude", [claude]));
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.profile).toMatchObject({ provider: "claude", power: "low", model: null });
    expect(plan.maxReviewLoops).toBe(1);
  });

  it("thorough = highest effort + 3 review loops", () => {
    const plan = planPreset("thorough", ctx("claude", [claude]));
    expect(plan.ok && plan.profile.power).toBe("high");
    expect(plan.ok && plan.maxReviewLoops).toBe(3);
  });

  it("fast refuses on an effort-less provider", () => {
    const plan = planPreset("fast", ctx("gemini", [geminiNoEffort]));
    expect(plan.ok).toBe(false);
    if (!plan.ok) expect(plan.reason).toMatch(/effort/i);
  });

  it("cheap = cheapest model + low effort (works even with no effort knob)", () => {
    const plan = planPreset("cheap", ctx("gemini", [geminiNoEffort]));
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.profile.model).toBe("gemini-2.5-flash-lite");
    expect(plan.profile.power).toBeNull();
    expect(plan.maxReviewLoops).toBeUndefined();
  });

  it("cheap refuses when the provider has no cheap model", () => {
    const plan = planPreset("cheap", ctx("ollama", [localNoModel]));
    expect(plan.ok).toBe(false);
    if (!plan.ok) expect(plan.reason).toMatch(/cheap model/i);
  });

  it("local builds on a local provider distinct from the (cloud) default", () => {
    const plan = planPreset("local", ctx("openai", [openaiCloud, claude]));
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.provider).toBe("claude");
    expect(plan.profileId).toBe("claude-local");
  });

  it("local refuses when the only local provider IS the default", () => {
    const plan = planPreset("local", ctx("claude", [claude]));
    expect(plan.ok).toBe(false);
    if (!plan.ok) expect(plan.reason).toMatch(/already runs on a local/i);
  });

  it("local refuses when no local provider exists", () => {
    const plan = planPreset("local", ctx("openai", [openaiCloud]));
    expect(plan.ok).toBe(false);
    if (!plan.ok) expect(plan.reason).toMatch(/no local/i);
  });
});
