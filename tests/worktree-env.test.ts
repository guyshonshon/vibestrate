import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
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
    // The linker only links dirs that are GITIGNORED in the worktree (an
    // un-ignored symlink would be staged by the run's git add -A).
    await execa("git", ["init", "-q"], { cwd: worktreePath });
    // Dir-only patterns (trailing slash) on purpose: that's the real-world
    // shape, and a dir-only pattern does NOT match a symlink - the linker
    // must make the links ignorable itself (local exclude) and verify.
    await fs.writeFile(
      path.join(worktreePath, ".gitignore"),
      "node_modules/\n.venv/\nvenv/\n",
    );
  });

  it("links node_modules when the lockfile is identical - and git ignores the LINK", async () => {
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

    // The whole point of the local-exclude layer: a dir-only .gitignore
    // pattern does not match a symlink, so without it `git add -A` STAGES the
    // link (a real run's reviewer caught one). The link must be invisible to
    // git status entirely.
    const status = await execa("git", ["status", "--porcelain"], {
      cwd: worktreePath,
    });
    const lines = status.stdout.split("\n").filter(Boolean);
    expect(lines.some((l) => l.includes("node_modules"))).toBe(false);
    const exclude = await fs.readFile(
      path.join(worktreePath, ".git", "info", "exclude"),
      "utf8",
    );
    expect(exclude).toContain("/node_modules");
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

  it("rolls the link back when git refuses to ignore it (explicit negation)", async () => {
    await fs.mkdir(path.join(projectRoot, ".venv"), { recursive: true });
    // A user-level negation overrides the local exclude (gitignore precedence:
    // the checkout's .gitignore wins over info/exclude). The linker must not
    // leave a link the run could stage.
    await fs.writeFile(path.join(worktreePath, ".gitignore"), "!.venv\n");
    const r = await linkWorktreeEnvironment({ projectRoot, worktreePath });
    expect(r.linked.map((l) => l.dir)).not.toContain(".venv");
    expect(
      r.skipped.some((s) => s.dir === ".venv" && /does not ignore/.test(s.reason)),
    ).toBe(true);
    await expect(fs.lstat(path.join(worktreePath, ".venv"))).rejects.toThrow();
    // Rollback also removes the exclude pattern - the user's main-repo file
    // must not accumulate entries for links that don't exist.
    const exclude = await fs
      .readFile(path.join(worktreePath, ".git", "info", "exclude"), "utf8")
      .catch(() => "");
    expect(exclude).not.toContain("/.venv");
  });

  it("re-running is idempotent: one pattern, one marker, user lines untouched", async () => {
    await fs.mkdir(path.join(worktreePath, ".git", "info"), { recursive: true });
    await fs.writeFile(
      path.join(worktreePath, ".git", "info", "exclude"),
      "# my own stuff\nscratch.txt\n",
    );
    await fs.mkdir(path.join(projectRoot, ".venv"), { recursive: true });
    await linkWorktreeEnvironment({ projectRoot, worktreePath });
    // Second run: link already exists -> skip, but nothing should duplicate.
    await linkWorktreeEnvironment({ projectRoot, worktreePath });
    const exclude = await fs.readFile(
      path.join(worktreePath, ".git", "info", "exclude"),
      "utf8",
    );
    expect(exclude.match(/\/\.venv/g)).toHaveLength(1);
    expect(exclude.match(/vibestrate:worktree-env/g)).toHaveLength(1);
    expect(exclude).toContain("# my own stuff");
    expect(exclude).toContain("scratch.txt");
  });

  it("writes NO exclude pattern for a candidate that ends up skipped (vendored deps)", async () => {
    await fs.mkdir(path.join(projectRoot, "node_modules"), { recursive: true });
    await fs.writeFile(path.join(projectRoot, "pnpm-lock.yaml"), "lock\n");
    await fs.writeFile(path.join(worktreePath, "pnpm-lock.yaml"), "lock\n");
    // The worktree already HAS node_modules (e.g. vendored/tracked) -> skip.
    await fs.mkdir(path.join(worktreePath, "node_modules"), { recursive: true });
    const r = await linkWorktreeEnvironment({ projectRoot, worktreePath });
    expect(r.skipped.some((s) => s.dir === "node_modules")).toBe(true);
    const exclude = await fs
      .readFile(path.join(worktreePath, ".git", "info", "exclude"), "utf8")
      .catch(() => "");
    expect(exclude).not.toContain("/node_modules");
  });

  it("reports nothing when the project has no env dirs", async () => {
    const r = await linkWorktreeEnvironment({ projectRoot, worktreePath });
    expect(r.linked).toEqual([]);
    expect(r.skipped).toEqual([]);
  });
});
