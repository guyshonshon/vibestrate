import { describe, it, expect } from "vitest";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { execa } from "execa";
import { initGitRepository } from "../src/git/git-init.js";

async function tmp(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "vibe-gitinit-"));
}

describe("initGitRepository (P7a guarded onboarding)", () => {
  it("initializes, writes a starter .gitignore, and commits clean content", async () => {
    const dir = await tmp();
    await fs.writeFile(path.join(dir, "notes.md"), "hello\n");
    const r = await initGitRepository({ projectRoot: dir });
    expect(r.ok).toBe(true);
    expect(r.initialized).toBe(true);
    expect(r.gitignoreWritten).toBe(true);
    expect(r.commitSha).toBeTruthy();
    const log = await execa("git", ["log", "--oneline"], { cwd: dir });
    expect(log.stdout).toContain("chore: initial commit (vibe init)");
  });

  it("refuses the commit (but still inits) when a secret-like file would be swept", async () => {
    const dir = await tmp();
    await fs.writeFile(path.join(dir, "notes.md"), "hello\n");
    // .env is in the starter .gitignore - use a path the ignore doesn't cover.
    await fs.writeFile(path.join(dir, "service-key.pem"), "x\n");
    const r = await initGitRepository({ projectRoot: dir });
    expect(r.ok).toBe(true);
    expect(r.initialized).toBe(true);
    expect(r.commitSha).toBeNull();
    expect(r.commitSkippedReason).toMatch(/secret-like/i);
    const log = await execa("git", ["log", "--oneline"], { cwd: dir, reject: false });
    expect(log.exitCode).not.toBe(0); // no commits at all
  });

  it("the starter .gitignore keeps .env out of the initial commit", async () => {
    const dir = await tmp();
    await fs.writeFile(path.join(dir, "notes.md"), "hello\n");
    await fs.writeFile(path.join(dir, ".env"), "TOKEN=x\n");
    const r = await initGitRepository({ projectRoot: dir });
    expect(r.commitSha).toBeTruthy();
    const show = await execa("git", ["show", "--name-only", "--pretty=format:"], {
      cwd: dir,
    });
    expect(show.stdout).not.toContain(".env");
  });

  it("refuses to nest inside an existing repository", async () => {
    const dir = await tmp();
    await execa("git", ["init", "-q"], { cwd: dir });
    const sub = path.join(dir, "sub");
    await fs.mkdir(sub);
    const r = await initGitRepository({ projectRoot: sub });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/refusing to nest/i);
  });

  it("respects an existing .gitignore (never overwrites)", async () => {
    const dir = await tmp();
    await fs.writeFile(path.join(dir, ".gitignore"), "custom/\n");
    const r = await initGitRepository({ projectRoot: dir, commit: false });
    expect(r.gitignoreWritten).toBe(false);
    expect(await fs.readFile(path.join(dir, ".gitignore"), "utf8")).toBe("custom/\n");
  });
});
