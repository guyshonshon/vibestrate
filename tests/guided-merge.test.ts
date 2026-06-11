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
    // Leave the integration record uncommitted -> dirty tree.
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
      "src/ui/app/routes/RunsPage.tsx", // the confirm-modal button
      "src/ui/lib/api.ts", // the typed client for the route
    ].sort());
  });
});
