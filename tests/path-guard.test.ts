import { describe, it, expect, beforeEach, afterEach } from "vitest";
import os from "node:os";
import fs from "node:fs/promises";
import path from "node:path";
import {
  resolveSafePath,
  buildProjectRoots,
  PathGuardError,
} from "../src/core/path-guard.js";

describe("resolveSafePath - run worktree precedence (T1)", () => {
  let proj: string;
  let wt: string;

  beforeEach(async () => {
    proj = await fs.mkdtemp(path.join(os.tmpdir(), "pg-proj-"));
    // The run worktree nests under the project root (the real layout), so the
    // project root geometrically contains every worktree file.
    wt = path.join(proj, ".vibestrate", "worktrees", "run1");
    await fs.mkdir(wt, { recursive: true });
  });
  afterEach(async () => {
    await fs.rm(proj, { recursive: true, force: true });
  });

  const runRoots = () =>
    buildProjectRoots({ projectRoot: proj, worktreePath: wt, worktreeFirst: true });
  const opt = { preferExistingRoot: true };

  it("a file created only in the worktree resolves to the worktree (was 404)", async () => {
    await fs.writeFile(path.join(wt, "super.md"), "new in worktree");
    const r = await resolveSafePath("super.md", runRoots(), opt);
    expect(r.root.kind).toBe("worktree");
    expect(await fs.readFile(r.absolutePath, "utf8")).toBe("new in worktree");
  });

  it("a file modified in the worktree shows the worktree copy, not the stale project one", async () => {
    await fs.writeFile(path.join(proj, "README.md"), "STALE project copy");
    await fs.writeFile(path.join(wt, "README.md"), "FRESH worktree copy");
    const r = await resolveSafePath("README.md", runRoots(), opt);
    expect(r.root.kind).toBe("worktree");
    expect(await fs.readFile(r.absolutePath, "utf8")).toBe("FRESH worktree copy");
  });

  it("a file that exists only in the project still resolves (not a worktree 404)", async () => {
    await fs.writeFile(path.join(proj, "only-proj.md"), "proj only");
    const r = await resolveSafePath("only-proj.md", runRoots(), opt);
    expect(r.root.kind).toBe("project");
  });

  it("a filename containing a space is accepted", async () => {
    await fs.writeFile(path.join(wt, "my file.md"), "spaced");
    const r = await resolveSafePath("my file.md", runRoots(), opt);
    expect(r.relativePath).toBe("my file.md");
  });

  it("a missing file resolves to the worktree root (honest 404 in the run's workspace)", async () => {
    const r = await resolveSafePath("gone.md", runRoots(), opt);
    expect(r.root.kind).toBe("worktree");
    // The caller (viewFile) turns the absent entry into a 404; the guard itself
    // just picks the root.
    await expect(fs.stat(r.absolutePath)).rejects.toThrow();
  });

  it("still rejects traversal and NUL/newline injection", async () => {
    await expect(resolveSafePath("../escape", runRoots(), opt)).rejects.toBeInstanceOf(
      PathGuardError,
    );
    await expect(resolveSafePath("a\nb", runRoots(), opt)).rejects.toBeInstanceOf(
      PathGuardError,
    );
  });

  it("without preferExistingRoot the legacy project-first precedence holds", async () => {
    // Default roots are [project, worktree]; the first containing root wins.
    await fs.writeFile(path.join(proj, "README.md"), "project");
    await fs.writeFile(path.join(wt, "README.md"), "worktree");
    const legacyRoots = buildProjectRoots({ projectRoot: proj, worktreePath: wt });
    const r = await resolveSafePath("README.md", legacyRoots);
    expect(r.root.kind).toBe("project");
  });
});
