import { describe, it, expect } from "vitest";
import {
  CREW_PRESETS,
  PRESET_ROSTER,
  effortForTier,
  presetProfileId,
  buildPresetProfile,
  buildPresetCrew,
} from "../src/crews/crew-presets.js";

describe("crew preset effort resolution", () => {
  it("fast = lowest level, thorough = highest", () => {
    const levels = ["low", "medium", "high"];
    expect(effortForTier("fast", levels)).toBe("low");
    expect(effortForTier("thorough", levels)).toBe("high");
  });

  it("a provider with no effort control yields null power", () => {
    expect(effortForTier("fast", [])).toBeNull();
    expect(effortForTier("thorough", [])).toBeNull();
  });

  it("two-level providers still resolve (fast=first, thorough=last)", () => {
    expect(effortForTier("fast", ["minimal", "deep"])).toBe("minimal");
    expect(effortForTier("thorough", ["minimal", "deep"])).toBe("deep");
  });
});

describe("preset profile + crew builders", () => {
  it("profile id is <ref>-<tier> and carries the resolved effort", () => {
    expect(presetProfileId("claude", "fast")).toBe("claude-fast");
    const p = buildPresetProfile("claude", "thorough", ["low", "medium", "high"]);
    expect(p).toEqual({
      provider: "claude",
      label: "claude thorough",
      model: null,
      power: "high",
    });
  });

  it("crew mirrors the shared roster, every role on the tier profile", () => {
    const crew = buildPresetCrew("fast", "claude", ".vibestrate/roles");
    expect(Object.keys(crew.roles).sort()).toEqual(
      PRESET_ROSTER.map((r) => r.id).sort(),
    );
    for (const r of PRESET_ROSTER) {
      const role = crew.roles[r.id]!;
      expect(role.profile).toBe("claude-fast");
      expect(role.prompt).toBe(`.vibestrate/roles/${r.id}.md`);
      expect(role.seats).toEqual(r.seats);
      expect(role.permissions).toBe(r.permissions);
    }
  });

  it("only fast + thorough are installable (balanced is the default crew)", () => {
    expect(CREW_PRESETS.map((p) => p.id).sort()).toEqual(["fast", "thorough"]);
  });
});
