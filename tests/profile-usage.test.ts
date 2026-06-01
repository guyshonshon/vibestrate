import { describe, it, expect } from "vitest";
import { profileUsage, rolesUsingProfile } from "../src/profiles/profile-usage.js";
import type { ProjectConfig } from "../src/project/config-schema.js";

// Minimal config: profileUsage only reads crews[].roles[].profile.
function cfg(): ProjectConfig {
  return {
    crews: {
      default: {
        roles: {
          planner: { profile: "claude" },
          exec: { profile: "claude-cheap" },
          rev: { profile: "claude" },
        },
      },
      qa: { roles: { verifier: { profile: "claude-cheap" } } },
    },
  } as unknown as ProjectConfig;
}

describe("profileUsage", () => {
  it("maps each profile to the roles that use it across every crew", () => {
    const u = profileUsage(cfg());
    expect(u.get("claude")?.length).toBe(2);
    expect(
      rolesUsingProfile(cfg(), "claude-cheap")
        .map((r) => `${r.crewId}/${r.roleId}`)
        .sort(),
    ).toEqual(["default/exec", "qa/verifier"]);
  });

  it("returns an empty list for an unused profile", () => {
    expect(rolesUsingProfile(cfg(), "nobody-uses-me")).toEqual([]);
  });
});
