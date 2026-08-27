import { describe, it, expect } from "vitest";
import {
  builtinPermissionProfiles,
  resolveProfile,
} from "../src/safety/permission-profiles.js";
import { assertExecutableContext } from "../src/safety/access-policy.js";
import { PolicyError } from "../src/utils/errors.js";

describe("permission profiles", () => {
  it("read_only is read-only", () => {
    const p = resolveProfile({}, "read_only");
    expect(p.allowWrite).toBe(false);
    expect(p.allowShell).toBe(false);
    expect(p.cwd).toBe("worktree");
  });

  it("code_write has forbidden paths and operations", () => {
    const p = resolveProfile({}, "code_write");
    expect(p.allowWrite).toBe(true);
    expect(p.allowShell).toBe(true);
    expect(p.forbiddenPaths).toContain(".env");
    expect(p.forbiddenOperations).toContain("push");
    expect(p.forbiddenOperations).toContain("merge");
  });

  it("forbiddenOperations is ADVISORY - only the prompt reads it", async () => {
    // This used to be the whole coverage: assert the array contains the string
    // "push". That proves a list has a word in it, not that pushing is
    // prevented - and the field surfaces as configuration, so it reads as a
    // gate. Pin the truth so nobody later builds a guarantee on it.
    const { readFileSync, readdirSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");
    const walk = (dir: string): string[] => {
      const out: string[] = [];
      for (const e of readdirSync(dir)) {
        const full = join(dir, e);
        if (statSync(full).isDirectory()) out.push(...walk(full));
        else if (full.endsWith(".ts")) out.push(full);
      }
      return out;
    };
    const readers = walk("src")
      .filter((f) => readFileSync(f, "utf8").includes("forbiddenOperations"))
      .map((f) => f.replace(/\\/g, "/"))
      .sort();
    expect(readers).toEqual([
      // where it is declared
      "src/project/init-template.ts",
      "src/safety/permission-profiles.ts",
      "src/safety/permission-schema.ts",
      // ...and the ONE thing that reads it: the agent's prompt.
      "src/core/context/prompt-builder.ts",
    ].sort());
  });

  it("says 'do not', not 'forbidden', because nothing enforces it", async () => {
    const { readFileSync } = await import("node:fs");
    const prompt = readFileSync("src/core/context/prompt-builder.ts", "utf8");
    expect(prompt).toContain("Do not perform these operations:");
    expect(prompt).not.toContain("`Forbidden operations:`");
  });

  it("config-defined profile overrides builtin", () => {
    const p = resolveProfile(
      { read_only: { allowWrite: false, allowShell: true, cwd: "worktree" } },
      "read_only",
    );
    expect(p.allowShell).toBe(true);
  });

  it("rejects write-enabled profile in project-root cwd", () => {
    expect(() =>
      assertExecutableContext({
        roleId: "executor",
        profile: { allowWrite: true, allowShell: true, cwd: "project-root" },
        projectRoot: "/tmp/p",
        worktreePath: "/tmp/wt",
      }),
    ).toThrow(PolicyError);
  });

  it("rejects worktree cwd without prepared worktree", () => {
    expect(() =>
      assertExecutableContext({
        roleId: "executor",
        profile: { allowWrite: true, allowShell: true, cwd: "worktree" },
        projectRoot: "/tmp/p",
        worktreePath: null,
      }),
    ).toThrow(PolicyError);
  });

  it("builtin profile names exist", () => {
    expect(Object.keys(builtinPermissionProfiles)).toEqual(
      expect.arrayContaining(["read_only", "code_write", "review_only", "verify_only"]),
    );
  });
});

describe("an unavailable assist says what to do, not what a developer would type", () => {
  it("names the setup screen rather than a profile id", async () => {
    // This message reaches someone who asked for a PLAIN-LANGUAGE explanation.
    // "Pass an explicit profileId" was the opposite of useful there.
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("src/core/assist/assist-runner.ts", "utf8");
    expect(src).toContain("More > Setup");
    expect(src).toContain("vibe setup");
    expect(src).not.toContain("Pass an explicit profileId");
  });
});
