import { describe, it, expect, beforeEach, afterEach } from "vitest";
import os from "node:os";
import fs from "node:fs/promises";
import path from "node:path";
import {
  PathGuardError,
  buildProjectRoots,
  linkWalkStart,
  resolveSafePath,
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

  // A DANGLING symlink is the case that slipped through: the link exists, so the
  // path is not "missing", but realpath throws ENOENT on its absent target - the
  // same code an honestly-missing file produces. Treating both as missing
  // declared the path contained, and the write-side callers
  // (project-manual.ts, routes/project.ts) then create the target wherever the
  // link points, outside the root.
  it("refuses a dangling symlink that points outside the root", async () => {
    const outside = path.join(os.tmpdir(), `pg-escape-${process.pid}.md`);
    await fs.rm(outside, { force: true });
    await fs.symlink(outside, path.join(wt, "planted.md"));
    await expect(resolveSafePath("planted.md", runRoots(), opt)).rejects.toBeInstanceOf(
      PathGuardError,
    );
    // The guard must refuse before anything creates the target.
    await expect(fs.stat(outside)).rejects.toThrow();
  });

  it("refuses a missing file whose parent directory is a symlink out of the root", async () => {
    const outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), "pg-escape-dir-"));
    try {
      await fs.symlink(outsideDir, path.join(wt, "linked"));
      await expect(
        resolveSafePath("linked/new-file.md", runRoots(), opt),
      ).rejects.toBeInstanceOf(PathGuardError);
    } finally {
      await fs.rm(outsideDir, { recursive: true, force: true });
    }
  });

  it("still allows a missing file in a real subdirectory that does not exist yet", async () => {
    // The control for the two above: walking up to the nearest existing ancestor
    // must not turn an ordinary create-a-nested-file into a refusal.
    const r = await resolveSafePath("docs/deep/new.md", runRoots(), opt);
    expect(r.root.kind).toBe("worktree");
    expect(r.relativePath).toBe("docs/deep/new.md");
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

/**
 * Symlink containment on a REALPATH'D root.
 *
 * These deliberately do not reuse the fixture above. `os.tmpdir()` is `/var/...`
 * on macOS and realpath resolves it to `/private/var/...`, so a guard comparing
 * a realpath'd root against a textually-resolved candidate refuses these inputs
 * on a spelling mismatch rather than on containment - which masks the very bug
 * they exist to catch, and would not mask it on Linux where /tmp is real. Anchor
 * the root to its own realpath so the only thing under test is containment.
 */
describe("resolveSafePath - symlink chains that leave the root", () => {
  let root: string;
  let outsideDir: string;

  beforeEach(async () => {
    root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "pg-chain-")));
    outsideDir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "pg-out-")));
  });
  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(outsideDir, { recursive: true, force: true });
  });

  const roots = () => [{ kind: "project" as const, absolutePath: root, label: "project" }];

  // The leaf check read the link target once and resolved it against the link's
  // own directory. Anything needing a SECOND resolution slipped through: the
  // ancestor walk already had a realpath backstop and the leaf branch did not.
  it("refuses a chain that only leaves the root on the second hop", async () => {
    await fs.symlink("hop2.md", path.join(root, "hop1.md"));
    await fs.symlink(path.join(outsideDir, "missing.md"), path.join(root, "hop2.md"));
    await expect(resolveSafePath("hop1.md", roots())).rejects.toBeInstanceOf(PathGuardError);
    await expect(fs.stat(path.join(outsideDir, "missing.md"))).rejects.toThrow();
  });

  // The target's own spelling is inside the root; its PARENT is a link out of it.
  it("refuses a target that leaves through a symlinked directory", async () => {
    await fs.symlink(outsideDir, path.join(root, "dirlink"));
    await fs.symlink(path.join(root, "dirlink", "missing.md"), path.join(root, "viaDir.md"));
    await expect(resolveSafePath("viaDir.md", roots())).rejects.toBeInstanceOf(PathGuardError);
  });

  it("refuses the relative spelling of the same escape", async () => {
    await fs.symlink(outsideDir, path.join(root, "dirlink"));
    await fs.mkdir(path.join(root, "sub"), { recursive: true });
    await fs.symlink("../dirlink/nope.md", path.join(root, "sub", "rel.md"));
    await expect(resolveSafePath("sub/rel.md", roots())).rejects.toBeInstanceOf(PathGuardError);
  });

  // The other half of the guard: tightening it must not turn an honest 404 into
  // a refusal. A link to a file that does not exist YET, inside the root, is a
  // build output or a placeholder and must still resolve.
  // Fixing the LEAF left the same defect one level up: the ancestor walk judged
  // a dangling DIRECTORY link by one textual hop too, and the missing-tail
  // rebuild climbed straight past a dangling link component. Both are chains
  // that only leave the root on a later hop.
  it("refuses a dangling directory link that leaves the root on a later hop", async () => {
    await fs.symlink(path.join(outsideDir, "gone"), path.join(root, "hop2"));
    await fs.symlink(path.join(root, "hop2"), path.join(root, "dirlink"));
    await expect(resolveSafePath("dirlink/newfile.md", roots())).rejects.toBeInstanceOf(
      PathGuardError,
    );
  });

  it("refuses a leaf whose chain runs through a dangling directory link", async () => {
    await fs.symlink(outsideDir, path.join(root, "inner"));
    await fs.symlink(path.join(root, "inner", "gone"), path.join(root, "dl"));
    await fs.symlink(path.join(root, "dl", "leaf.md"), path.join(root, "x.md"));
    await expect(resolveSafePath("x.md", roots())).rejects.toBeInstanceOf(PathGuardError);
  });

  // The two resolvers call each other, so a cycle has to end in a refusal
  // rather than a hang - the way the OS ends one.
  it("refuses a symlink cycle instead of following it forever", async () => {
    await fs.symlink(path.join(root, "b"), path.join(root, "a"));
    await fs.symlink(path.join(root, "a"), path.join(root, "b"));
    await expect(resolveSafePath("a/x.md", roots())).rejects.toBeInstanceOf(PathGuardError);
  });

  // `path.resolve` collapses `..` lexically; the kernel does not - it resolves
  // each component first, so a `..` AFTER a symlink goes up from where that link
  // landed. `dl/../x` with `dl` pointing out of the root is `<outside>/x` to the
  // OS and `<root>/x` to path.resolve. The guard approved it, and a write
  // through the approved path landed outside the root.
  it("refuses a target whose .. climbs out from where a symlink landed", async () => {
    await fs.mkdir(path.join(outsideDir, "od"), { recursive: true });
    await fs.symlink(path.join(outsideDir, "od"), path.join(root, "dl"));
    await fs.symlink("dl/../planted.md", path.join(root, "notes.md"));
    await expect(resolveSafePath("notes.md", roots())).rejects.toBeInstanceOf(PathGuardError);
    // And nothing was created outside while we asked.
    await expect(fs.stat(path.join(outsideDir, "planted.md"))).rejects.toThrow();
  });

  // The mirror: `..` that stays inside must still resolve, or every relative
  // link in a normal project breaks.
  // An ABSOLUTE stored target is the default form on Windows (mklink /D, and
  // Node's own fs.symlink(..., "junction") normalises to absolute), and it is
  // how package managers link workspaces there. The walk splits only the part
  // after the root now: the root is a drive on Windows and survived the split
  // as a segment, so walking the whole string re-appended it ("C:\\" + "C:")
  // and every absolute target read as an escape. POSIX hid it - its root is "/"
  // and the leading empty segment was already skipped.
  it("resolves a link whose stored target is absolute and inside the root", async () => {
    await fs.mkdir(path.join(root, "generated"), { recursive: true });
    await fs.symlink(path.join(root, "generated", "out.md"), path.join(root, "abs-pending.md"));
    const resolved = await resolveSafePath("abs-pending.md", roots());
    expect(resolved.absolutePath).toBe(path.join(root, "abs-pending.md"));
  });

  it("resolves a not-yet-created file under a directory link with an absolute target", async () => {
    await fs.mkdir(path.join(root, "packages", "pkg"), { recursive: true });
    await fs.symlink(path.join(root, "packages", "pkg"), path.join(root, "linked"));
    const resolved = await resolveSafePath("linked/new.ts", roots());
    expect(resolved.absolutePath).toContain("new.ts");
  });

  // A backslash is legal in a POSIX filename, and a link target is a string from
  // the kernel. Splitting on it walked "<root>/evil" - inside - while the OS
  // followed "<root>/\\evil", a link out of the root. The guard approved it and
  // a write through the approved path landed outside.
  it("refuses a link target that is a filename containing a backslash", async () => {
    await fs.symlink(path.join(outsideDir, "planted.md"), path.join(root, "\\evil"));
    await fs.symlink("\\evil", path.join(root, "VIBESTRATE.md"));
    await expect(resolveSafePath("VIBESTRATE.md", roots())).rejects.toBeInstanceOf(PathGuardError);
    await expect(fs.stat(path.join(outsideDir, "planted.md"))).rejects.toThrow();
  });

  it("still allows a .. that stays inside the root", async () => {
    await fs.mkdir(path.join(root, "a", "b"), { recursive: true });
    await fs.writeFile(path.join(root, "a", "target.md"), "hi\n");
    await fs.symlink("../target.md", path.join(root, "a", "b", "up.md"));
    const resolved = await resolveSafePath("a/b/up.md", roots());
    expect(resolved.absolutePath).toContain("up.md");
  });

  it("still allows a dangling symlink that stays inside the root", async () => {
    await fs.mkdir(path.join(root, "generated"), { recursive: true });
    await fs.symlink(path.join(root, "generated", "out.md"), path.join(root, "pending.md"));
    const resolved = await resolveSafePath("pending.md", roots());
    expect(resolved.absolutePath).toBe(path.join(root, "pending.md"));
  });

  it("still allows a chain that stays inside the root, through a symlinked directory", async () => {
    await fs.mkdir(path.join(root, "deep", "nested"), { recursive: true });
    await fs.writeFile(path.join(root, "deep", "nested", "real.md"), "hi");
    await fs.symlink("deep/nested", path.join(root, "dirlink-inside"));
    const resolved = await resolveSafePath("dirlink-inside/real.md", roots());
    expect(resolved.absolutePath).toContain("real.md");
  });
});


/**
 * The string math of the link walk, under BOTH path flavours.
 *
 * This exists because the Windows bug it pins could not be caught where the
 * code is written: on POSIX the slice is a no-op, so a POSIX filesystem test
 * passes with the fix reverted, and the only leg that could fail one is the
 * Windows workflow its own header calls "NOT a required gate" - the leg that
 * was red through a release. A table under path.win32 runs everywhere.
 */
describe("linkWalkStart - the whole flavour-dependent walk, one seam", () => {
  const win = path.win32;

  it("never re-appends a Windows root as a segment", () => {
    for (const target of [
      "C:\\proj\\packages\\pkg",
      "C:/proj/x",
      "c:\\proj\\x",
      "\\\\?\\C:\\x",
      "\\\\server\\share\\x",
      "\\\\?\\UNC\\server\\share\\x",
    ]) {
      const { startAt, segments } = linkWalkStart(target, "C:\\somewhere", win);
      let walked = startAt;
      for (const segment of segments) walked = win.join(walked, segment);
      expect(walked, target).toBe(win.resolve(target));
    }
  });

  // A backslash is a LEGAL character in a POSIX filename, and this string is a
  // link target read back from the kernel. Splitting on it there walked a
  // different path than the OS resolves, and the guard approved a write that
  // landed outside the root. Windows really does have both separators and
  // cannot have one in a filename, so only POSIX narrows.
  it("treats a backslash as a filename character on posix and a separator on windows", () => {
    expect(linkWalkStart("\\evil", "/root", path.posix).segments).toEqual(["\\evil"]);
    expect(linkWalkStart("a\\..\\..\\outside", "/root", path.posix).segments).toEqual([
      "a\\..\\..\\outside",
    ]);
    expect(linkWalkStart("a\\b", "C:\\root", win).segments).toEqual(["a", "b"]);
  });

  it("drops empty and dot segments, and leaves a relative target's start alone", () => {
    const r = linkWalkStart("./packages//pkg/", "/root", path.posix);
    expect(r.startAt).toBe("/root");
    expect(r.segments).toEqual(["packages", "pkg"]);
  });

  it("is a no-op on posix roots, which is why the Windows break was invisible here", () => {
    expect(linkWalkStart("/a/b", "/root", path.posix)).toEqual({ startAt: "/", segments: ["a", "b"] });
    expect(linkWalkStart("a/b", "/root", path.posix)).toEqual({ startAt: "/root", segments: ["a", "b"] });
  });
});
