import { describe, it, expect } from "vitest";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { execa } from "execa";
import {
  dominantEol,
  normalizePatchEol,
  resolveApplicablePatch,
} from "../src/git/patch-eol.js";

type Eol = "\n" | "\r\n";

async function repo(fileEol: Eol): Promise<{ dir: string; original: Buffer }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibe-eol-"));
  await execa("git", ["init", "-q"], { cwd: dir });
  // autocrlf=false so the on-disk EOL is exactly what we write (the real break).
  await execa("git", ["config", "core.autocrlf", "false"], { cwd: dir });
  await execa("git", ["config", "user.email", "t@t"], { cwd: dir });
  await execa("git", ["config", "user.name", "t"], { cwd: dir });
  const content = ["line one", "line two", "line three"].join(fileEol) + fileEol;
  await fs.writeFile(path.join(dir, "f.txt"), content);
  await execa("git", ["add", "f.txt"], { cwd: dir });
  await execa("git", ["commit", "-qm", "init"], { cwd: dir });
  return { dir, original: await fs.readFile(path.join(dir, "f.txt")) };
}

// Patch that changes "line two" -> "line 2", with every line terminated by `eol`.
function buildPatch(eol: Eol, newLine = "line 2"): string {
  const L = (s: string) => s + eol;
  return (
    L("--- a/f.txt") +
    L("+++ b/f.txt") +
    L("@@ -1,3 +1,3 @@") +
    L(" line one") +
    L("-line two") +
    L("+" + newLine) +
    L(" line three")
  );
}

async function gitApply(dir: string, patch: string, args: string[] = []) {
  return execa("git", ["apply", "--whitespace=nowarn", ...args], {
    cwd: dir,
    input: patch,
    reject: false,
  });
}

function eolConsistent(buf: Buffer, eol: Eol): boolean {
  const s = buf.toString("utf8");
  const crlf = (s.match(/\r\n/g) || []).length;
  const bareLf = (s.match(/(?<!\r)\n/g) || []).length;
  return eol === "\r\n" ? bareLf === 0 && crlf > 0 : crlf === 0 && bareLf > 0;
}

describe("dominantEol", () => {
  it("detects CRLF when any CRLF present, else LF", () => {
    expect(dominantEol("a\nb\n")).toBe("\n");
    expect(dominantEol("a\r\nb\r\n")).toBe("\r\n");
    expect(dominantEol("a\r\nb\n")).toBe("\r\n"); // any CRLF wins
    expect(dominantEol("")).toBe("\n");
  });
});

describe("resolveApplicablePatch (EOL-mismatch recovery, double-guarded)", () => {
  it("LF file + CRLF patch: recovers, applies EOL-consistent, reverts clean", async () => {
    const { dir, original } = await repo("\n");
    const crlfPatch = buildPatch("\r\n");

    // Status quo: the raw CRLF patch is rejected against an LF file.
    expect((await gitApply(dir, crlfPatch)).exitCode).not.toBe(0);

    const r = await resolveApplicablePatch(crlfPatch, dir);
    expect("patch" in r).toBe(true);
    const fwd = (r as { patch: string }).patch;

    expect((await gitApply(dir, fwd)).exitCode).toBe(0);
    const after = await fs.readFile(path.join(dir, "f.txt"));
    expect(after.toString("utf8")).toContain("line 2");
    expect(eolConsistent(after, "\n")).toBe(true); // no mixed-EOL corruption

    const rev = await resolveApplicablePatch(fwd, dir, ["-R"]);
    expect("patch" in rev).toBe(true);
    expect((await gitApply(dir, (rev as { patch: string }).patch, ["-R"])).exitCode).toBe(0);
    expect(await fs.readFile(path.join(dir, "f.txt"))).toEqual(original);
  });

  it("CRLF file + LF patch: recovers, applies EOL-consistent, reverts clean", async () => {
    const { dir, original } = await repo("\r\n");
    const lfPatch = buildPatch("\n");

    expect((await gitApply(dir, lfPatch)).exitCode).not.toBe(0);

    const r = await resolveApplicablePatch(lfPatch, dir);
    expect("patch" in r).toBe(true);
    const fwd = (r as { patch: string }).patch;

    expect((await gitApply(dir, fwd)).exitCode).toBe(0);
    const after = await fs.readFile(path.join(dir, "f.txt"));
    expect(eolConsistent(after, "\r\n")).toBe(true);

    const rev = await resolveApplicablePatch(fwd, dir, ["-R"]);
    expect("patch" in rev).toBe(true);
    expect((await gitApply(dir, (rev as { patch: string }).patch, ["-R"])).exitCode).toBe(0);
    expect(await fs.readFile(path.join(dir, "f.txt"))).toEqual(original);
  });

  it("matching EOL: returns the patch byte-identical (pure no-op)", async () => {
    const { dir } = await repo("\n");
    const lfPatch = buildPatch("\n");
    const r = await resolveApplicablePatch(lfPatch, dir);
    expect(r).toEqual({ patch: lfPatch });
  });

  it("genuinely non-applying patch still refuses (no false recovery)", async () => {
    const { dir } = await repo("\n");
    // Context that does not exist in the file: cannot be rescued by EOL fixes.
    const bogus =
      "--- a/f.txt\n+++ b/f.txt\n@@ -1,1 +1,1 @@\n-nonexistent line\n+replacement\n";
    const r = await resolveApplicablePatch(bogus, dir);
    expect("ok" in r && r.ok === false).toBe(true);
  });
});

describe("normalizePatchEol (unit)", () => {
  it("is a no-op when no target file is readable on disk", async () => {
    const { dir } = await repo("\n");
    // References a path that doesn't exist -> nothing to detect against.
    const patch = "--- a/missing.txt\n+++ b/missing.txt\n@@ -1 +1 @@\n-a\n+b\n";
    expect(await normalizePatchEol(patch, dir)).toBe(patch);
  });

  it("rewrites every terminator to the target file's EOL", async () => {
    const { dir } = await repo("\r\n");
    const lfPatch = buildPatch("\n");
    const out = await normalizePatchEol(lfPatch, dir);
    expect(out).toBe(buildPatch("\r\n")); // wholesale rewrite to CRLF
  });

  it("preserves a content CR inside a hunk line (only terminators change)", async () => {
    const { dir } = await repo("\r\n"); // CRLF target -> normalization to CRLF
    const eol = "\n";
    const L = (s: string) => s + eol;
    // LF-terminated patch whose ADDED line legitimately ends in a content CR.
    const patch =
      L("--- a/f.txt") +
      L("+++ b/f.txt") +
      L("@@ -1,3 +1,3 @@") +
      L(" line one") +
      L("-line two") +
      "+line 2\r" +
      eol + // content CR, then the LF terminator
      L(" line three");

    const out = await normalizePatchEol(patch, dir);
    // The content CR survives; the terminator becomes CRLF (so "\r" + "\r\n").
    expect(out).toContain("+line 2\r\r\n");
    // It actually applies, writing the content CR into the file (not dropped).
    const r = await resolveApplicablePatch(patch, dir);
    expect("patch" in r).toBe(true);
    expect((await gitApply(dir, (r as { patch: string }).patch)).exitCode).toBe(0);
    expect(await fs.readFile(path.join(dir, "f.txt"), "utf8")).toContain("line 2\r\r\n");
  });
});
