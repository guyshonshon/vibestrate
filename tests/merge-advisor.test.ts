import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { applySetup } from "../src/setup/setup-service.js";
import { setConfigValue } from "../src/setup/config-update-service.js";
import { RunStateStore, createInitialState } from "../src/core/state-machine.js";
import { runAssurancePath } from "../src/utils/paths.js";
import { integrate } from "../src/integration/integration-service.js";
import {
  computeMergeAdvice,
  collectBranchTopology,
  adviseMergeReadyRuns,
  DEFAULT_ADVISOR_THRESHOLDS,
  type MergeAdviceInput,
  type AssuranceProjection,
} from "../src/integration/merge-advisor.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

// ── pure rule/flag tables (no disk) ─────────────────────────────────────────

const verifiedAssurance: AssuranceProjection = {
  verdict: "verified",
  lanes: { validation: "passed", review: "approved", verification: "not_applicable" },
  anyRealCheckPassed: true,
  toleratedStepFailures: 0,
};

function baseInput(overrides: Partial<MergeAdviceInput> = {}): MergeAdviceInput {
  return {
    runId: "r1",
    task: "do a thing",
    topology: {
      branchName: "feat-a",
      aheadOfMain: 1,
      behindMain: 0,
      filesTouched: 2,
      protectedPathHits: [],
    },
    branchExists: true,
    preview: { branch: "feat-a", clean: true, conflictedFiles: [], note: "clean" },
    previewIndex: 0,
    assurance: verifiedAssurance,
    personaId: "staff-engineer",
    mainBranch: "main",
    othersInFlight: false,
    thresholds: DEFAULT_ADVISOR_THRESHOLDS,
    ...overrides,
  };
}

describe("computeMergeAdvice - recommendation rules", () => {
  it("clean small verified change -> finish-now, no flags, safe headline, ff shape", () => {
    const a = computeMergeAdvice(baseInput());
    expect(a.recommendation).toBe("finish-now");
    expect(a.flags).toHaveLength(0);
    expect(a.headline).toMatch(/^Safe to merge/);
    expect(a.predictedShape).toBe("fast-forward");
    expect(a.manualSteps).toBeNull();
  });

  it("conflicted preview -> resolve-first + warning + manual steps", () => {
    const a = computeMergeAdvice(
      baseInput({
        preview: {
          branch: "feat-a",
          clean: false,
          conflictedFiles: ["base.txt"],
          note: "conflicts",
        },
      }),
    );
    expect(a.recommendation).toBe("resolve-first");
    expect(a.flags.map((f) => f.id)).toContain("preview_conflict");
    expect(a.headline).toMatch(/^Hold on/);
    expect(a.manualSteps).not.toBeNull();
  });

  it("conflict at cumulative position > 0 also flags overlaps_other_ready", () => {
    const a = computeMergeAdvice(
      baseInput({
        preview: { branch: "feat-b", clean: false, conflictedFiles: ["x"], note: "conflicts" },
        previewIndex: 1,
      }),
    );
    expect(a.flags.map((f) => f.id)).toContain("overlaps_other_ready");
  });

  it("protected paths -> stage-on-integration-branch + warning", () => {
    const a = computeMergeAdvice(
      baseInput({
        topology: {
          branchName: "feat-a",
          aheadOfMain: 1,
          behindMain: 0,
          filesTouched: 2,
          protectedPathHits: ["src/auth/guard.ts"],
        },
      }),
    );
    expect(a.recommendation).toBe("stage-on-integration-branch");
    expect(a.flags.map((f) => f.id)).toContain("protected_paths");
  });

  it("large change -> stage + caution, staging headline (no warnings)", () => {
    const a = computeMergeAdvice(
      baseInput({
        topology: {
          branchName: "feat-a",
          aheadOfMain: 1,
          behindMain: 0,
          filesTouched: 30,
          protectedPathHits: [],
        },
      }),
    );
    expect(a.recommendation).toBe("stage-on-integration-branch");
    expect(a.flags.map((f) => f.id)).toContain("large_change");
    expect(a.headline).toMatch(/^Mergeable, but worth staging/);
  });

  it("heavily diverged branch -> stage + diverged_main", () => {
    const a = computeMergeAdvice(
      baseInput({
        topology: {
          branchName: "feat-a",
          aheadOfMain: 1,
          behindMain: 60,
          filesTouched: 2,
          protectedPathHits: [],
        },
      }),
    );
    expect(a.recommendation).toBe("stage-on-integration-branch");
    expect(a.flags.map((f) => f.id)).toContain("diverged_main");
  });

  it("flags never change the recommendation (review gap still finish-now)", () => {
    const a = computeMergeAdvice(
      baseInput({
        assurance: {
          ...verifiedAssurance,
          verdict: "partially_verified",
          lanes: { ...verifiedAssurance.lanes, review: "missing" },
        },
      }),
    );
    expect(a.recommendation).toBe("finish-now");
    expect(a.flags.map((f) => f.id)).toContain("review_gap");
    expect(a.headline).toMatch(/^Hold on/);
  });
});

describe("computeMergeAdvice - T2 honesty (lanes + anyRealCheckPassed)", () => {
  it("verified with anyRealCheckPassed=false -> no_real_check caution, never 'Safe to merge'", () => {
    const a = computeMergeAdvice(
      baseInput({
        assurance: {
          verdict: "verified",
          lanes: {
            validation: "not_applicable",
            review: "not_applicable",
            verification: "not_applicable",
          },
          anyRealCheckPassed: false,
          toleratedStepFailures: 0,
        },
      }),
    );
    expect(a.flags.map((f) => f.id)).toContain("no_real_check");
    expect(a.headline).not.toMatch(/^Safe to merge/);
  });

  it("missing assurance artifact -> assurance_missing warning", () => {
    const a = computeMergeAdvice(baseInput({ assurance: null }));
    expect(a.flags.map((f) => f.id)).toContain("assurance_missing");
    expect(a.headline).toMatch(/^Hold on/);
  });

  it("lane gaps map to warnings: validation failed / verification not_run", () => {
    const a = computeMergeAdvice(
      baseInput({
        assurance: {
          verdict: "partially_verified",
          lanes: { validation: "failed", review: "approved", verification: "not_run" },
          anyRealCheckPassed: true,
          toleratedStepFailures: 0,
        },
      }),
    );
    const ids = a.flags.map((f) => f.id);
    expect(ids).toContain("validation_gap");
    expect(ids).toContain("verification_gap");
  });

  it("an inert-diff review skip is a note, not a flag (T2)", () => {
    const a = computeMergeAdvice(
      baseInput({
        assurance: {
          verdict: "verified",
          lanes: {
            validation: "passed",
            review: "skipped_inert_diff",
            verification: "not_applicable",
          },
          anyRealCheckPassed: true,
          toleratedStepFailures: 0,
        },
      }),
    );
    expect(a.flags.map((f) => f.id)).not.toContain("review_gap");
    expect(a.headline).toMatch(/^Safe to merge/);
  });

  it("tolerated step failures get their own caution, derived from the projection not the verdict", () => {
    const a = computeMergeAdvice(
      baseInput({
        assurance: {
          // Deliberately inconsistent (verdict says verified, projection says
          // failures were tolerated): the flag must come from the projection.
          verdict: "verified",
          lanes: { validation: "passed", review: "approved", verification: "not_applicable" },
          anyRealCheckPassed: true,
          toleratedStepFailures: 2,
        },
      }),
    );
    expect(a.flags.map((f) => f.id)).toContain("tolerated_failures");
    expect(a.headline).not.toMatch(/^Safe to merge/);
    expect(a.detail).toMatch(/tolerated/);
  });

  it("a run whose branch is gone degrades to branch_gone + resolve-first", () => {
    const a = computeMergeAdvice(
      baseInput({
        branchExists: false,
        preview: {
          branch: "feat-a",
          clean: false,
          conflictedFiles: [],
          note: "branch not found",
        },
      }),
    );
    expect(a.flags.map((f) => f.id)).toContain("branch_gone");
    expect(a.flags.map((f) => f.id)).not.toContain("preview_conflict");
    expect(a.recommendation).toBe("resolve-first");
    expect(a.manualSteps).toBeNull();
    expect(a.headline).toMatch(/^Hold on/);
  });
});

describe("computeMergeAdvice - persona ordering + shape", () => {
  it("security persona leads with protected_paths; severity order otherwise intact", () => {
    const input = baseInput({
      topology: {
        branchName: "feat-a",
        aheadOfMain: 1,
        behindMain: 0,
        filesTouched: 2,
        protectedPathHits: ["src/auth/guard.ts"],
      },
      assurance: {
        ...verifiedAssurance,
        verdict: "partially_verified",
        lanes: { ...verifiedAssurance.lanes, validation: "failed" },
      },
    });
    const staff = computeMergeAdvice(input);
    const sec = computeMergeAdvice({ ...input, personaId: "security" });
    expect(sec.flags[0]!.id).toBe("protected_paths");
    // Same flags either way - persona only reorders, never adds/removes.
    expect([...staff.flags.map((f) => f.id)].sort()).toEqual(
      [...sec.flags.map((f) => f.id)].sort(),
    );
  });

  it("other merge-ready runs in flight -> merge-commit-if-main-moves", () => {
    const a = computeMergeAdvice(baseInput({ othersInFlight: true }));
    expect(a.predictedShape).toBe("merge-commit-if-main-moves");
  });
});

// ── git-backed smokes (temp repo) ────────────────────────────────────────────

async function git(cwd: string, ...args: string[]) {
  await execa("git", args, { cwd });
}

async function makeRepo(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-advise-"));
  await git(dir, "init", "-q", "-b", "main");
  await git(dir, "config", "user.email", "x@x");
  await git(dir, "config", "user.name", "x");
  await fs.writeFile(path.join(dir, "base.txt"), "line one\nline two\n");
  await fs.writeFile(path.join(dir, "package.json"), '{"name":"demo"}');
  await git(dir, "add", ".");
  await git(dir, "commit", "-q", "-m", "base");
  await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });
  await setConfigValue(dir, "git.worktreeDir", path.join(dir, "worktrees"));
  await git(dir, "add", ".");
  await git(dir, "commit", "-q", "-m", "setup");

  const branch = async (name: string, fn: () => Promise<void>) => {
    await git(dir, "checkout", "-q", "-b", name, "main");
    await fn();
    await git(dir, "add", ".");
    await git(dir, "commit", "-q", "-m", name);
    await git(dir, "checkout", "-q", "main");
  };
  await branch("feat-a", async () => fs.writeFile(path.join(dir, "a.txt"), "A"));
  await branch("feat-auth", async () => {
    await fs.mkdir(path.join(dir, "src", "auth"), { recursive: true });
    await fs.writeFile(path.join(dir, "src", "auth", "guard.ts"), "export {}\n");
  });
  return dir;
}

async function mergeReadyRun(dir: string, runId: string, branchName: string) {
  const store = new RunStateStore(dir, runId);
  let s = createInitialState({
    runId,
    task: `task ${runId}`,
    projectRoot: dir,
    worktreePath: null,
    branchName,
    maxReviewLoops: 2,
  });
  s = { ...s, status: "merge_ready" as const, branchName };
  await store.write(s);
}

describe("collectBranchTopology (git smoke)", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await makeRepo();
  });

  it("counts ahead/behind and changed files; flags protected paths", async () => {
    const t = await collectBranchTopology({
      projectRoot: dir,
      branchName: "feat-auth",
      mainBranch: "main",
    });
    expect(t.aheadOfMain).toBe(1);
    expect(t.behindMain).toBe(0);
    expect(t.filesTouched).toBe(1);
    expect(t.protectedPathHits).toEqual(["src/auth/guard.ts"]);

    // Move main: the branch is now behind.
    await fs.writeFile(path.join(dir, "main-moves.txt"), "m");
    await git(dir, "add", ".");
    await git(dir, "commit", "-q", "-m", "main moves");
    const t2 = await collectBranchTopology({
      projectRoot: dir,
      branchName: "feat-auth",
      mainBranch: "main",
    });
    expect(t2.behindMain).toBe(1);
    // Three-dot diff stays scoped to the change itself, not main's drift.
    expect(t2.filesTouched).toBe(1);
  });

  it("throws a clear error when the branch is gone", async () => {
    await expect(
      collectBranchTopology({
        projectRoot: dir,
        branchName: "ghost",
        mainBranch: "main",
      }),
    ).rejects.toThrow(/no longer exists/);
  });
});

describe("adviseMergeReadyRuns (git smoke)", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await makeRepo();
  });

  it("advises a clean run without assurance: finish-now + assurance_missing", async () => {
    await mergeReadyRun(dir, "r1", "feat-a");
    const { advice, missing } = await adviseMergeReadyRuns({ projectRoot: dir });
    expect(missing).toEqual([]);
    expect(advice).toHaveLength(1);
    const a = advice[0]!;
    expect(a.recommendation).toBe("finish-now");
    expect(a.assurance).toBeNull();
    expect(a.flags.map((f) => f.id)).toContain("assurance_missing");
    expect(a.preview?.clean).toBe(true);
    expect(a.predictedShape).toBe("fast-forward");
  });

  it("projects a real assurance artifact and selects unknown ids into missing", async () => {
    await mergeReadyRun(dir, "r1", "feat-a");
    await fs.writeFile(
      runAssurancePath(dir, "r1"),
      JSON.stringify({
        schemaVersion: 1,
        runId: "r1",
        verdict: "verified",
        summary: "ok",
        generatedAt: new Date().toISOString(),
        policy: { status: "passed", rulesEvaluated: [], violations: [] },
        validation: { status: "passed", total: 1, passed: 1, failed: 0, environment: 0 },
        review: { status: "approved" },
        verification: { status: "not_applicable" },
        coverage: { toleratedStepFailures: 0 },
        blockers: [],
        caps: [],
        notes: [],
        anyRealCheckPassed: true,
        supervisor: { persona: "staff-engineer", independence: "single-profile" },
      }),
    );
    const { advice, missing } = await adviseMergeReadyRuns({
      projectRoot: dir,
      runIds: ["r1", "nope"],
    });
    expect(missing).toEqual(["nope"]);
    expect(advice).toHaveLength(1);
    expect(advice[0]!.assurance?.lanes.validation).toBe("passed");
    expect(advice[0]!.headline).toMatch(/^Safe to merge/);
    expect(advice[0]!.personaId).toBe("staff-engineer");
  });

  it("one deleted branch degrades that run only - healthy runs still get advice", async () => {
    await mergeReadyRun(dir, "r1", "feat-a");
    await mergeReadyRun(dir, "r2", "feat-auth");
    await git(dir, "branch", "-D", "feat-auth");
    const { advice, missing } = await adviseMergeReadyRuns({ projectRoot: dir });
    expect(missing).toEqual([]);
    expect(advice).toHaveLength(2);
    const healthy = advice.find((a) => a.runId === "r1")!;
    const broken = advice.find((a) => a.runId === "r2")!;
    expect(healthy.recommendation).toBe("finish-now");
    expect(broken.flags.map((f) => f.id)).toContain("branch_gone");
    expect(broken.recommendation).toBe("resolve-first");
  });

  it("merge.advisor config thresholds flip the recommendation (slice 3 round-trip)", async () => {
    await mergeReadyRun(dir, "r1", "feat-a");
    // Defaults: a small clean change finishes now.
    let res = await adviseMergeReadyRuns({ projectRoot: dir });
    expect(res.advice[0]!.recommendation).toBe("finish-now");

    // Tighten the divergence threshold via the real `vibe config set` path,
    // then move main past it.
    await setConfigValue(
      dir,
      "merge.advisor.suggestIntegrationBranchWhen.behindMain",
      "1",
    );
    await fs.writeFile(path.join(dir, "m1.txt"), "1");
    await git(dir, "add", ".");
    await git(dir, "commit", "-q", "-m", "m1");
    await fs.writeFile(path.join(dir, "m2.txt"), "2");
    await git(dir, "add", ".");
    await git(dir, "commit", "-q", "-m", "m2");

    res = await adviseMergeReadyRuns({ projectRoot: dir });
    expect(res.advice[0]!.recommendation).toBe("stage-on-integration-branch");
    expect(res.advice[0]!.flags.map((f) => f.id)).toContain("diverged_main");
  });

  it("protected-path run gets staged + leaves no scratch debris", async () => {
    await mergeReadyRun(dir, "r2", "feat-auth");
    const { advice } = await adviseMergeReadyRuns({ projectRoot: dir });
    expect(advice[0]!.recommendation).toBe("stage-on-integration-branch");
    expect(advice[0]!.flags.map((f) => f.id)).toContain("protected_paths");
    const branches = await execa("git", ["branch", "--list", "vibe-preview-*"], { cwd: dir });
    expect(branches.stdout.trim()).toBe("");
  });
});

describe("predicted-shape truthfulness (design D-claim smoke)", () => {
  it("finish ff's when main is unmoved, creates a merge commit when main moved", async () => {
    const dir = await makeRepo();

    // Case 1: integration branch forked from current main, main unmoved ->
    // `git merge --no-edit` (what finishIntegration runs) fast-forwards:
    // main becomes the integration tip and finish adds NO commit of its own.
    // (The tip itself IS a merge commit - apply merges each run with --no-ff
    // - which is exactly the nuance the advisory text states.)
    await integrate({
      projectRoot: dir,
      branches: [{ branch: "feat-a" }],
      integrationBranch: "integration/ff",
    });
    const tip = (await execa("git", ["rev-parse", "integration/ff"], { cwd: dir })).stdout.trim();
    const featATip = (await execa("git", ["rev-parse", "feat-a"], { cwd: dir })).stdout.trim();
    await git(dir, "merge", "--no-edit", "integration/ff");
    const head = (await execa("git", ["rev-parse", "HEAD"], { cwd: dir })).stdout.trim();
    expect(head).toBe(tip); // fast-forward: no extra commit from finish
    const ffSecondParent = await execa("git", ["rev-parse", "HEAD^2"], {
      cwd: dir,
      reject: false,
    });
    expect(ffSecondParent.stdout.trim()).toBe(featATip); // apply's --no-ff merge commit

    // Case 2: main moves between apply and finish -> finish adds a NEW merge
    // commit on top (HEAD is no longer the integration tip).
    await integrate({
      projectRoot: dir,
      branches: [{ branch: "feat-auth" }],
      integrationBranch: "integration/mc",
    });
    const mcTip = (await execa("git", ["rev-parse", "integration/mc"], { cwd: dir })).stdout.trim();
    await fs.writeFile(path.join(dir, "drift.txt"), "d");
    await git(dir, "add", ".");
    await git(dir, "commit", "-q", "-m", "main moves");
    await git(dir, "merge", "--no-edit", "integration/mc");
    const head2 = (await execa("git", ["rev-parse", "HEAD"], { cwd: dir })).stdout.trim();
    expect(head2).not.toBe(mcTip); // finish created its own commit this time
    const mcSecondParent = await execa("git", ["rev-parse", "HEAD^2"], {
      cwd: dir,
      reject: false,
    });
    expect(mcSecondParent.stdout.trim()).toBe(mcTip); // ...merging the integration tip
  });
});
