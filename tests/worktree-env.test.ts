import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { linkWorktreeEnvironment } from "../src/git/worktree-env.js";

// P8c: a bare `git worktree add` has no gitignored environment, so validation
// fails with "command not found" and a correct change gets blocked. The linker
// symlinks the project's env dirs in - lockfile-guarded for node_modules.

async function mkTemp(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

describe("linkWorktreeEnvironment", () => {
  let projectRoot: string;
  let worktreePath: string;

  beforeEach(async () => {
    projectRoot = await mkTemp("vibestrate-envlink-root-");
    worktreePath = await mkTemp("vibestrate-envlink-wt-");
  });

  it("links node_modules when the lockfile is identical", async () => {
    await fs.mkdir(path.join(projectRoot, "node_modules", ".bin"), {
      recursive: true,
    });
    await fs.writeFile(path.join(projectRoot, "pnpm-lock.yaml"), "lock-v1\n");
    await fs.writeFile(path.join(worktreePath, "pnpm-lock.yaml"), "lock-v1\n");

    const r = await linkWorktreeEnvironment({ projectRoot, worktreePath });
    expect(r.linked.map((l) => l.dir)).toContain("node_modules");
    const st = await fs.lstat(path.join(worktreePath, "node_modules"));
    expect(st.isSymbolicLink()).toBe(true);
    const target = await fs.readlink(path.join(worktreePath, "node_modules"));
    expect(target).toBe(path.join(projectRoot, "node_modules"));
  });

  it("refuses node_modules when the lockfile differs (deps would lie)", async () => {
    await fs.mkdir(path.join(projectRoot, "node_modules"), { recursive: true });
    await fs.writeFile(path.join(projectRoot, "pnpm-lock.yaml"), "lock-v1\n");
    await fs.writeFile(path.join(worktreePath, "pnpm-lock.yaml"), "lock-v2\n");

    const r = await linkWorktreeEnvironment({ projectRoot, worktreePath });
    expect(r.linked.map((l) => l.dir)).not.toContain("node_modules");
    expect(r.skipped.some((s) => s.dir === "node_modules" && /differs/.test(s.reason))).toBe(
      true,
    );
    await expect(
      fs.lstat(path.join(worktreePath, "node_modules")),
    ).rejects.toThrow();
  });

  it("refuses node_modules when the worktree checkout has no lockfile", async () => {
    await fs.mkdir(path.join(projectRoot, "node_modules"), { recursive: true });
    await fs.writeFile(path.join(projectRoot, "pnpm-lock.yaml"), "lock-v1\n");

    const r = await linkWorktreeEnvironment({ projectRoot, worktreePath });
    expect(r.linked.map((l) => l.dir)).not.toContain("node_modules");
    expect(
      r.skipped.some((s) => s.dir === "node_modules" && /missing in worktree/.test(s.reason)),
    ).toBe(true);
  });

  it("links virtualenvs without a lockfile guard", async () => {
    await fs.mkdir(path.join(projectRoot, ".venv", "bin"), { recursive: true });
    const r = await linkWorktreeEnvironment({ projectRoot, worktreePath });
    expect(r.linked.map((l) => l.dir)).toContain(".venv");
    const st = await fs.lstat(path.join(worktreePath, ".venv"));
    expect(st.isSymbolicLink()).toBe(true);
  });

  it("links nested workspace node_modules under the same guard", async () => {
    await fs.mkdir(path.join(projectRoot, "node_modules"), { recursive: true });
    await fs.mkdir(
      path.join(projectRoot, "packages", "app", "node_modules"),
      { recursive: true },
    );
    await fs.writeFile(path.join(projectRoot, "pnpm-lock.yaml"), "lock\n");
    await fs.writeFile(path.join(worktreePath, "pnpm-lock.yaml"), "lock\n");
    // The tracked package dir exists in the checkout.
    await fs.mkdir(path.join(worktreePath, "packages", "app"), {
      recursive: true,
    });

    const r = await linkWorktreeEnvironment({ projectRoot, worktreePath });
    expect(r.linked.map((l) => l.dir)).toContain(
      path.join("packages", "app", "node_modules"),
    );
    const st = await fs.lstat(
      path.join(worktreePath, "packages", "app", "node_modules"),
    );
    expect(st.isSymbolicLink()).toBe(true);
  });

  it("never overwrites something already in the worktree", async () => {
    await fs.mkdir(path.join(projectRoot, ".venv"), { recursive: true });
    await fs.mkdir(path.join(worktreePath, ".venv"), { recursive: true });
    const r = await linkWorktreeEnvironment({ projectRoot, worktreePath });
    expect(r.skipped.some((s) => s.dir === ".venv" && /already exists/.test(s.reason))).toBe(
      true,
    );
    const st = await fs.lstat(path.join(worktreePath, ".venv"));
    expect(st.isSymbolicLink()).toBe(false);
  });

  it("reports nothing when the project has no env dirs", async () => {
    const r = await linkWorktreeEnvironment({ projectRoot, worktreePath });
    expect(r.linked).toEqual([]);
    expect(r.skipped).toEqual([]);
  });
});
