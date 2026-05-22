import { describe, it, expect } from "vitest";
import {
  detectSandboxPlatform,
  linuxBwrapArgs,
  macosProfile,
} from "../src/execution/sandbox.js";

describe("detectSandboxPlatform", () => {
  it("returns 'darwin' or 'linux' on supported hosts, 'unsupported' otherwise", () => {
    const p = detectSandboxPlatform();
    expect(["darwin", "linux", "unsupported"]).toContain(p);
    if (process.platform === "darwin") expect(p).toBe("darwin");
    if (process.platform === "linux") expect(p).toBe("linux");
  });
});

describe("macosProfile", () => {
  it("starts permissive, denies all writes, then re-allows the worktree", () => {
    const p = macosProfile({
      worktreePath: "/tmp/run-1/worktree",
      projectRoot: "/tmp/run-1",
    });
    expect(p).toMatch(/\(version 1\)/);
    // Order matters: allow-default first, then deny writes, then re-allow.
    const allowDefault = p.indexOf("(allow default)");
    const denyWrites = p.indexOf("(deny file-write*)");
    const allowWorktree = p.indexOf("/tmp/run-1/worktree");
    expect(allowDefault).toBeLessThan(denyWrites);
    expect(denyWrites).toBeLessThan(allowWorktree);
  });

  it("allows /tmp and /private/tmp for scratch", () => {
    const p = macosProfile({
      worktreePath: "/x/y",
      projectRoot: "/x",
    });
    expect(p).toMatch(/subpath\s+"\/tmp"/);
    expect(p).toMatch(/subpath\s+"\/private\/tmp"/);
    expect(p).not.toContain("/.npm");
  });

  it("escapes double-quotes in paths to avoid breaking the profile", () => {
    const p = macosProfile({
      worktreePath: '/tmp/my "weird" dir',
      projectRoot: "/x",
    });
    expect(p).toContain('/tmp/my \\"weird\\" dir');
  });
});

describe("linuxBwrapArgs", () => {
  it("mounts root read-only and binds the worktree read-write", () => {
    const a = linuxBwrapArgs({
      worktreePath: "/repo/.worktrees/run-1",
      projectRoot: "/repo",
    });
    const join = a.join(" ");
    expect(join).toMatch(/--ro-bind \/ \//);
    expect(join).toMatch(/--bind \/repo\/\.worktrees\/run-1 \/repo\/\.worktrees\/run-1/);
  });

  it("provides tmpfs scratch dirs", () => {
    const a = linuxBwrapArgs({
      worktreePath: "/w",
      projectRoot: "/p",
    });
    expect(a).toContain("--tmpfs");
    expect(a).toContain("/tmp");
    expect(a).toContain("/var/tmp");
  });

  it("dies with the parent so leaked sandboxes can't outlive the orchestrator", () => {
    const a = linuxBwrapArgs({ worktreePath: "/w", projectRoot: "/p" });
    expect(a).toContain("--die-with-parent");
  });

  it("shares network so provider CLIs can reach their APIs", () => {
    const a = linuxBwrapArgs({ worktreePath: "/w", projectRoot: "/p" });
    expect(a).toContain("--share-net");
  });
});
