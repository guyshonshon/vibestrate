import { describe, it, expect } from "vitest";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { execa } from "execa";
import {
  integrate,
  finishIntegration,
  readIntegrationRecord,
} from "../src/integration/integration-service.js";
import { applySetup } from "../src/setup/setup-service.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

async function git(cwd: string, ...args: string[]): Promise<string> {
  const r = await execa("git", args, { cwd });
  return r.stdout;
}

/** A repo with main + a feature branch carrying one clean commit. */
/** Unique per-test integration branch (the worktree dir is shared tmp). */
function ib(tag: string): string {
  return `integration/${tag}-${Math.random().toString(36).slice(2, 8)}`;
}

async function makeRepo(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibe-finish-"));
  await git(dir, "init", "-q", "-b", "main");
  await git(dir, "config", "user.email", "x@x");
  await git(dir, "config", "user.name", "x");
  await fs.writeFile(path.join(dir, "base.md"), "base\n");
  await git(dir, "add", ".");
  await git(dir, "commit", "-q", "-m", "base");
  await git(dir, "branch", "feat-a");
  await git(dir, "checkout", "-q", "feat-a");
  await fs.writeFile(path.join(dir, "a.md"), "a\n");
  await git(dir, "add", ".");
  await git(dir, "commit", "-q", "-m", "feat a");
  await git(dir, "checkout", "-q", "main");
  await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });
  // applySetup writes .vibestrate/ - commit it so the tree is clean for finish.
  await git(dir, "add", "-A");
  await git(dir, "commit", "-q", "-m", "scaffold");
  return dir;
}

describe("finishIntegration (P7b guided merge)", () => {
  it("merges a complete integration branch into main, locally", async () => {
    const dir = await makeRepo();
    const B_happy = ib("happy");
    const applied = await integrate({
      projectRoot: dir,
      branches: [{ branch: "feat-a" }],
      integrationBranch: B_happy,
    });
    expect(applied.stoppedAt).toBeNull();
    const record = await readIntegrationRecord(dir, B_happy);
    expect(record?.integrated).toEqual(["feat-a"]);
    // Commit the integration record so the project tree is clean.
    await git(dir, "add", "-A");
    await git(dir, "commit", "-q", "-m", "record");

    const r = await finishIntegration({
      projectRoot: dir,
      integrationBranch: B_happy,
      humanConfirmed: true,
    });
    expect(r.intoBranch).toBe("main");
    expect(r.mergedSha).toMatch(/^[0-9a-f]{40}$/);
    // a.md is now on main, and nothing references any remote.
    await git(dir, "checkout", "-q", "main");
    expect(await fs.readFile(path.join(dir, "a.md"), "utf8")).toBe("a\n");
  });

  it("refuses without an integration record (completeness unknown)", async () => {
    const dir = await makeRepo();
    await git(dir, "branch", "integration/orphan");
    await expect(
      finishIntegration({
        projectRoot: dir,
        integrationBranch: "integration/orphan",
        humanConfirmed: true,
      }),
    ).rejects.toThrow(/No integration record/i);
  });

  it("refuses a PARTIAL integration (apply stopped at a conflict)", async () => {
    const dir = await makeRepo();
    const B_partial = ib("partial");
    // Conflicting branch: change base.md both on main and feat-b.
    await git(dir, "checkout", "-q", "-b", "feat-b");
    await fs.writeFile(path.join(dir, "base.md"), "theirs\n");
    await git(dir, "add", ".");
    await git(dir, "commit", "-q", "-m", "feat b");
    await git(dir, "checkout", "-q", "main");
    await fs.writeFile(path.join(dir, "base.md"), "ours\n");
    await git(dir, "add", ".");
    await git(dir, "commit", "-q", "-m", "main change");

    const applied = await integrate({
      projectRoot: dir,
      branches: [{ branch: "feat-b" }],
      integrationBranch: B_partial,
    });
    expect(applied.stoppedAt).toBe("feat-b");
    await git(dir, "add", "-A");
    await git(dir, "commit", "-q", "-m", "record");
    await expect(
      finishIntegration({
        projectRoot: dir,
        integrationBranch: B_partial,
        humanConfirmed: true,
      }),
    ).rejects.toThrow(/PARTIAL/);
  });

  it("refuses on a dirty working tree", async () => {
    const dir = await makeRepo();
    const B_dirty = ib("dirty");
    await integrate({
      projectRoot: dir,
      branches: [{ branch: "feat-a" }],
      integrationBranch: B_dirty,
    });
    await git(dir, "add", "-A");
    await git(dir, "commit", "-q", "-m", "record");
    // Real uncommitted user work -> dirty tree.
    await fs.writeFile(path.join(dir, "base.md"), "edited\n");
    await expect(
      finishIntegration({
        projectRoot: dir,
        integrationBranch: B_dirty,
        humanConfirmed: true,
      }),
    ).rejects.toThrow(/uncommitted changes/i);
  });

  it("refuses without the humanConfirmed literal (no automated path)", async () => {
    const dir = await makeRepo();
    await expect(
      finishIntegration({
        projectRoot: dir,
        integrationBranch: "integration/x",
        // @ts-expect-error - the literal type is the contract; an automated
        // caller would have to lie explicitly to get here.
        humanConfirmed: false,
      }),
    ).rejects.toThrow(/human confirmation/i);
  });

  it("a deny policy on git.merge blocks the merge", async () => {
    const dir = await makeRepo();
    const B_policy = ib("policy");
    await integrate({
      projectRoot: dir,
      branches: [{ branch: "feat-a" }],
      integrationBranch: B_policy,
    });
    await fs.mkdir(path.join(dir, ".vibestrate", "policies"), { recursive: true });
    await fs.writeFile(
      path.join(dir, ".vibestrate", "policies", "no-merge.yml"),
      [
        "actions:",
        "  - id: no-main-merge",
        "    description: merges to main are disabled here",
        "    on: [git.merge]",
        "    effect: deny",
        "    message: merges to main are disabled here",
        "",
      ].join("\n"),
    );
    await git(dir, "add", "-A");
    await git(dir, "commit", "-q", "-m", "record+policy");
    await expect(
      finishIntegration({
        projectRoot: dir,
        integrationBranch: B_policy,
        humanConfirmed: true,
      }),
    ).rejects.toThrow(/denied/i);
  });

  it("never pushes (no remote configured, merge still succeeds locally)", async () => {
    const dir = await makeRepo();
    const B_push = ib("push");
    await integrate({
      projectRoot: dir,
      branches: [{ branch: "feat-a" }],
      integrationBranch: B_push,
    });
    await git(dir, "add", "-A");
    await git(dir, "commit", "-q", "-m", "record");
    await finishIntegration({
      projectRoot: dir,
      integrationBranch: B_push,
      humanConfirmed: true,
    });
    const remotes = await git(dir, "remote");
    expect(remotes.trim()).toBe("");
  });

  it("a refused (denied) attempt is recorded to the integration action log", async () => {
    const dir = await makeRepo();
    const B = ib("audit");
    await integrate({
      projectRoot: dir,
      branches: [{ branch: "feat-a" }],
      integrationBranch: B,
    });
    await fs.mkdir(path.join(dir, ".vibestrate", "policies"), { recursive: true });
    await fs.writeFile(
      path.join(dir, ".vibestrate", "policies", "no-merge.yml"),
      [
        "actions:",
        "  - id: no-main-merge",
        "    description: merges to main are disabled here",
        "    on: [git.merge]",
        "    effect: deny",
        "    message: merges to main are disabled here",
        "",
      ].join("\n"),
    );
    await git(dir, "add", "-A");
    await git(dir, "commit", "-q", "-m", "record+policy");
    await expect(
      finishIntegration({ projectRoot: dir, integrationBranch: B, humanConfirmed: true }),
    ).rejects.toThrow(/denied/i);
    const log = await fs.readFile(
      path.join(dir, ".vibestrate", "runs", "integration", "actions.ndjson"),
      "utf8",
    );
    const records = log.split("\n").filter(Boolean).map((l) => JSON.parse(l));
    const denied = records.find((r) => r.request.kind === "git.merge");
    expect(denied?.decision.effect).toBe("deny");
    expect(denied?.evidence?.ok).toBe(false);
  });

  it("refuses when the integration branch tip changed since apply (drift)", async () => {
    const dir = await makeRepo();
    const B = ib("drift");
    const applied = await integrate({
      projectRoot: dir,
      branches: [{ branch: "feat-a" }],
      integrationBranch: B,
    });
    await git(dir, "add", "-A");
    await git(dir, "commit", "-q", "-m", "record");
    // Mutate the integration branch after apply recorded its tip (the branch
    // is checked out in its integration worktree - commit there).
    await fs.writeFile(path.join(applied.worktreePath, "late.md"), "late\n");
    await git(applied.worktreePath, "add", ".");
    await git(applied.worktreePath, "commit", "-q", "-m", "late change");
    await expect(
      finishIntegration({ projectRoot: dir, integrationBranch: B, humanConfirmed: true }),
    ).rejects.toThrow(/changed since apply/i);
  });

  it("refuses when HEAD is not main (never moves the user's HEAD)", async () => {
    const dir = await makeRepo();
    const B = ib("head");
    await integrate({
      projectRoot: dir,
      branches: [{ branch: "feat-a" }],
      integrationBranch: B,
    });
    await git(dir, "add", "-A");
    await git(dir, "commit", "-q", "-m", "record");
    // Park on a branch cut from current main (it carries .vibestrate/).
    await git(dir, "checkout", "-q", "-b", "parking");
    await expect(
      finishIntegration({ projectRoot: dir, integrationBranch: B, humanConfirmed: true }),
    ).rejects.toThrow(/never moves your HEAD/i);
    expect((await git(dir, "rev-parse", "--abbrev-ref", "HEAD")).trim()).toBe("parking");
  });

  it("refuses when the integration branch was deleted after apply", async () => {
    const dir = await makeRepo();
    const B = ib("gone");
    await integrate({
      projectRoot: dir,
      branches: [{ branch: "feat-a" }],
      integrationBranch: B,
    });
    await git(dir, "add", "-A");
    await git(dir, "commit", "-q", "-m", "record");
    await git(dir, "worktree", "prune");
    await execa("git", ["worktree", "remove", "--force",
      (await readIntegrationRecord(dir, B)) ? path.join(os.tmpdir(), "x") : "x"],
      { cwd: dir, reject: false });
    // Remove the worktree that holds the branch, then delete the branch.
    const wt = await git(dir, "worktree", "list", "--porcelain");
    const line = wt.split("\n").find((l) => l.includes("integration-"));
    if (line) {
      await execa("git", ["worktree", "remove", "--force", line.replace("worktree ", "")], { cwd: dir, reject: false });
    }
    await execa("git", ["branch", "-D", B], { cwd: dir, reject: false });
    await expect(
      finishIntegration({ projectRoot: dir, integrationBranch: B, humanConfirmed: true }),
    ).rejects.toThrow(/does not exist|changed since apply/i);
  });

  it("a held lock from a live process refuses; a dead holder is reclaimed", async () => {
    const dir = await makeRepo();
    const B = ib("lock");
    await integrate({
      projectRoot: dir,
      branches: [{ branch: "feat-a" }],
      integrationBranch: B,
    });
    await git(dir, "add", "-A");
    await git(dir, "commit", "-q", "-m", "record");
    const lockDir = path.join(dir, ".vibestrate", "integration", ".finish-lock");
    // Live holder (this process) -> refuse.
    await fs.mkdir(lockDir, { recursive: true });
    await fs.writeFile(path.join(lockDir, "pid"), String(process.pid));
    await expect(
      finishIntegration({ projectRoot: dir, integrationBranch: B, humanConfirmed: true }),
    ).rejects.toThrow(/in progress/i);
    // Dead holder -> reclaimed, merge proceeds.
    await fs.writeFile(path.join(lockDir, "pid"), "999999");
    const r = await finishIntegration({
      projectRoot: dir,
      integrationBranch: B,
      humanConfirmed: true,
    });
    expect(r.intoBranch).toBe("main");
  });

  it("static invariant: no scheduler/orchestrator path imports finishIntegration", async () => {
    // The only callers may be the CLI command and the HTTP route - both human
    // surfaces. A scheduler or run-completion import would break the guided-
    // merge contract.
    const { execa: run } = await import("execa");
    const grep = await run(
      "grep",
      ["-rl", "finishIntegration", "src/", "--include=*.ts", "--include=*.tsx"],
      { cwd: process.cwd(), reject: false },
    );
    const files = grep.stdout.split("\n").filter(Boolean).sort();
    expect(files).toEqual([
      "src/cli/commands/integrate.ts",
      "src/integration/integration-service.ts",
      "src/server/routes/integration.ts",
      "src/ui/app/routes/MergePage.tsx", // T13 merge window confirm-modal button
      "src/ui/app/routes/RunsPage.tsx", // the confirm-modal button
      "src/ui/lib/api.ts", // the typed client for the route
    ].sort());
  });
});
