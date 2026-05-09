import { describe, it, expect } from "vitest";
import {
  builtinPermissionProfiles,
  resolveProfile,
} from "../src/permissions/permission-profiles.js";
import { assertExecutableContext } from "../src/permissions/access-policy.js";
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
        agentId: "executor",
        profile: { allowWrite: true, allowShell: true, cwd: "project-root" },
        projectRoot: "/tmp/p",
        worktreePath: "/tmp/wt",
      }),
    ).toThrow(PolicyError);
  });

  it("rejects worktree cwd without prepared worktree", () => {
    expect(() =>
      assertExecutableContext({
        agentId: "executor",
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
