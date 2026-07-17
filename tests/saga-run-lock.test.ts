import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import {
  acquireTaskLock,
  releaseTaskLock,
  TaskLockedError,
  taskLockPath,
  __setReclaimRaceHookForTests,
} from "../src/core/run/run-lock.js";
import { runStatePath, runDir } from "../src/utils/paths.js";
import { applySetup } from "../src/setup/setup-service.js";
import { setConfigValue } from "../src/setup/config-update-service.js";
import { RoadmapService } from "../src/roadmap/roadmap-service.js";
import { runFromSpec } from "../src/core/run/run-launcher.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

/**
 * M5: atomic per-task run lock. A saga (or any run) claims a task's lockfile so
 * a second run on the same task is refused, never silently double-running and
 * corrupting the shared checklist / feature branch.
 */

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-run-lock-"));
});

afterEach(async () => {
  __setReclaimRaceHookForTests(null); // never leak the fault-injection hook
  await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
});

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Stale-reclaim fault-injection hook that recreates the exact FATAL interleave:
 * the FIRST racer to reach the pre-unlink point proceeds immediately (it unlinks
 * the stale lock and recreates a fresh LIVE one), while every LATER racer parks
 * on `gate` until the test opens it. A test opens the gate only AFTER the winner
 * has recreated - so a loser's unlink lands on the winner's FRESH live lock. With
 * a bare unlink that double-acquires; the re-stat guard turns the loser's unlink
 * into a no-op (the witnessed mtime changed) and the loser is refused instead.
 */
function makeStaggeredReclaimGate(): {
  hook: () => Promise<void>;
  openLosers: () => void;
} {
  let arrived = 0;
  let openLosers!: () => void;
  const gate = new Promise<void>((r) => {
    openLosers = r;
  });
  const hook = (): Promise<void> => {
    arrived += 1;
    // Arrival #1 is the winner: let it unlink+recreate without waiting.
    if (arrived === 1) return Promise.resolve();
    return gate; // losers wait until the winner has recreated a fresh lock
  };
  return { hook, openLosers };
}

/** Write a holder run's state.json with a given status so staleness can be judged. */
async function writeRunState(runId: string, status: string): Promise<void> {
  await fs.mkdir(runDir(dir, runId), { recursive: true });
  await fs.writeFile(
    runStatePath(dir, runId),
    JSON.stringify({ runId, status, startedAt: new Date().toISOString() }),
    "utf8",
  );
}

/** A pid that is guaranteed dead: spawn a trivial process, capture its pid, then
 *  await its exit so the pid is reaped/gone before we use it. */
async function deadPid(): Promise<number> {
  const child = execa("node", ["-e", "process.exit(0)"]);
  const pid = child.pid ?? 999999;
  await child; // resolves only after exit; the pid is now gone
  return pid;
}

describe("acquireTaskLock / releaseTaskLock (M5)", () => {
  it("acquires a free task, refuses a second acquire, frees on release", async () => {
    const h1 = await acquireTaskLock(dir, "task-abc", "run-one");
    expect(h1.runId).toBe("run-one");

    // A second acquire for the SAME task is refused (fail fast, no wait).
    await expect(acquireTaskLock(dir, "task-abc", "run-two")).rejects.toBeInstanceOf(
      TaskLockedError,
    );
    // The error names the holder so the caller can report it.
    await acquireTaskLock(dir, "task-abc", "run-three").catch((err) => {
      expect(err).toBeInstanceOf(TaskLockedError);
      expect((err as TaskLockedError).holderRunId).toBe("run-one");
      expect((err as TaskLockedError).taskId).toBe("task-abc");
    });

    // A different task is independent - acquires fine while task-abc is held.
    const other = await acquireTaskLock(dir, "task-xyz", "run-x");
    await releaseTaskLock(other);

    // After release, a fresh acquire on task-abc succeeds.
    await releaseTaskLock(h1);
    const h2 = await acquireTaskLock(dir, "task-abc", "run-two");
    expect(h2.runId).toBe("run-two");
    await releaseTaskLock(h2);
  });

  it("reclaims a stale lock from a DEAD holder pid", async () => {
    const pid = await deadPid();
    await fs.mkdir(path.dirname(taskLockPath(dir, "task-dead")), {
      recursive: true,
    });
    await fs.writeFile(
      taskLockPath(dir, "task-dead"),
      JSON.stringify({
        runId: "ghost-run",
        pid,
        host: os.hostname(),
        startedAt: new Date().toISOString(),
      }),
      "utf8",
    );

    // The holder process is gone -> the new run reclaims the lock.
    const h = await acquireTaskLock(dir, "task-dead", "fresh-run");
    expect(h.runId).toBe("fresh-run");
    await releaseTaskLock(h);
  });

  it("reclaims a stale lock when the holder run is in a TERMINAL state", async () => {
    // Holder pid is THIS process (alive), but its run reached a terminal status.
    await writeRunState("done-run", "merge_ready");
    await fs.mkdir(path.dirname(taskLockPath(dir, "task-term")), {
      recursive: true,
    });
    await fs.writeFile(
      taskLockPath(dir, "task-term"),
      JSON.stringify({
        runId: "done-run",
        pid: process.pid,
        host: os.hostname(),
        startedAt: new Date().toISOString(),
      }),
      "utf8",
    );

    const h = await acquireTaskLock(dir, "task-term", "next-run");
    expect(h.runId).toBe("next-run");
    await releaseTaskLock(h);
  });

  it("does NOT reclaim a LIVE holder whose state file does not exist yet", async () => {
    // A just-launched holder: alive pid, no state.json written yet. This must be
    // treated as HELD, never stolen (else a concurrent acquire double-runs it).
    await fs.mkdir(path.dirname(taskLockPath(dir, "task-young")), {
      recursive: true,
    });
    await fs.writeFile(
      taskLockPath(dir, "task-young"),
      JSON.stringify({
        runId: "starting-run",
        pid: process.pid, // alive
        host: os.hostname(),
        startedAt: new Date().toISOString(),
      }),
      "utf8",
    );

    await expect(
      acquireTaskLock(dir, "task-young", "intruder"),
    ).rejects.toBeInstanceOf(TaskLockedError);
  });

  it("releaseTaskLock with a non-matching runId does NOT remove the lock", async () => {
    const h1 = await acquireTaskLock(dir, "task-keep", "owner-run");

    // A release that claims a different runId must be a no-op.
    await releaseTaskLock({
      projectRoot: dir,
      taskId: "task-keep",
      runId: "not-the-owner",
    });

    // The lock is still held by owner-run.
    await expect(
      acquireTaskLock(dir, "task-keep", "someone-else"),
    ).rejects.toBeInstanceOf(TaskLockedError);

    // The real owner can still release it.
    await releaseTaskLock(h1);
    const h2 = await acquireTaskLock(dir, "task-keep", "someone-else");
    await releaseTaskLock(h2);
  });

  it("releaseTaskLock is idempotent and tolerates a missing lockfile", async () => {
    const h = await acquireTaskLock(dir, "task-idem", "r1");
    await releaseTaskLock(h);
    // Second release: no throw, no-op.
    await expect(releaseTaskLock(h)).resolves.toBeUndefined();
  });

  it("is mutually exclusive under concurrent acquires (exactly one winner)", async () => {
    // The core concurrency guarantee: N racers on the SAME free task -> exactly
    // one wins, the rest are refused with TaskLockedError, no other errors.
    const racers = Array.from({ length: 40 }, (_, i) =>
      acquireTaskLock(dir, "task-race", `run-${i}`),
    );
    const results = await Promise.allSettled(racers);
    const winners = results.filter((r) => r.status === "fulfilled");
    const refused = results.filter(
      (r) => r.status === "rejected" && r.reason instanceof TaskLockedError,
    );
    expect(winners.length).toBe(1);
    expect(refused.length).toBe(results.length - 1);
  });

  it("is mutually exclusive when N racers reclaim the SAME stale lock", async () => {
    // REGRESSION (adversarial review, FATAL): the existing 40-way test only races
    // a FREE lock. The dangerous window is the STALE-RECLAIM path: an existing
    // dead-pid lock that several starters all judge reclaimable at once. A naive
    // reclaim does a bare unlink with no re-check, so the loser's unlink deletes
    // the winner's FRESH live lock and BOTH acquire. Mutual exclusion must hold:
    // exactly one wins, the rest get TaskLockedError, and the lock left on disk
    // belongs to the single winner (no loser clobbered it).
    //
    // The window is sub-microsecond on a single-threaded event loop, so we open
    // it deterministically with a staggered reclaim hook (winner proceeds, losers
    // park) and release the losers only after the winner has recreated its lock.
    const N = 8;
    const lockPath = taskLockPath(dir, "task-stale-race");
    const { hook, openLosers } = makeStaggeredReclaimGate();
    __setReclaimRaceHookForTests(hook);

    const pid = await deadPid();
    await fs.mkdir(path.dirname(lockPath), { recursive: true });
    await fs.writeFile(
      lockPath,
      JSON.stringify({
        runId: "ghost-run", // the stale holder every racer judges reclaimable
        pid, // dead -> the lock is reclaimable
        host: os.hostname(),
        startedAt: new Date().toISOString(),
      }),
      "utf8",
    );

    const racers = Array.from({ length: N }, (_, i) =>
      acquireTaskLock(dir, "task-stale-race", `reclaimer-${i}`),
    );
    // Attach the settle handlers NOW, before the poll loop below. A straggler
    // that misses the reclaim hook (it reads the winner's fresh LIVE lock and is
    // refused at once) rejects DURING the poll loop; without a handler already
    // attached that is an unhandled rejection and fails the suite's exit code.
    const settled = Promise.allSettled(racers);

    // Wait until the winner has reclaimed + recreated a fresh LIVE lock (the
    // holder is no longer "ghost-run"), then release the parked losers - so a
    // loser's unlink targets the winner's fresh lock, exactly the race window.
    for (let i = 0; i < 500; i++) {
      await sleep(2);
      try {
        const body = JSON.parse(await fs.readFile(lockPath, "utf8")) as {
          runId: string;
        };
        if (body.runId !== "ghost-run") break;
      } catch {
        // between the winner's unlink and recreate - keep polling
      }
    }
    openLosers();

    const results = await settled;
    const winners = results.filter((r) => r.status === "fulfilled");
    const refused = results.filter(
      (r) => r.status === "rejected" && r.reason instanceof TaskLockedError,
    );
    // No racer may fail with anything other than TaskLockedError.
    const otherErrors = results.filter(
      (r) => r.status === "rejected" && !(r.reason instanceof TaskLockedError),
    );
    expect(otherErrors).toEqual([]);
    expect(winners.length).toBe(1);
    expect(refused.length).toBe(results.length - 1);

    // The lock now on disk must be the winner's - proving no loser's unlink
    // deleted the winner's fresh live lock (which would have let a second in).
    const winnerRunId = (
      winners[0] as PromiseFulfilledResult<{ runId: string }>
    ).value.runId;
    const onDisk = JSON.parse(await fs.readFile(lockPath, "utf8")) as {
      runId: string;
    };
    expect(onDisk.runId).toBe(winnerRunId);
  });
});

/**
 * Build a real, initialized git project + a roadmap task, mirroring the saga
 * test harness, so the dashboard launch path (`runFromSpec`) runs end-to-end.
 */
async function makeProject(): Promise<string> {
  const proj = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-lock-int-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: proj });
  await execa("git", ["config", "user.email", "x@x"], { cwd: proj });
  await execa("git", ["config", "user.name", "x"], { cwd: proj });
  await fs.writeFile(path.join(proj, "package.json"), '{"name":"demo"}');
  await execa("git", ["add", "."], { cwd: proj });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: proj });
  await applySetup({ options: { projectRoot: proj }, detectionRunner: noProvider });
  // A fake provider so config integrity holds even though we never reach a run.
  const fakeJs = path.join(proj, "fake.js");
  await fs.writeFile(fakeJs, "#!/usr/bin/env node\nconsole.log('ok');\n", {
    mode: 0o755,
  });
  await setConfigValue(
    proj,
    "providers.fake",
    JSON.stringify({ type: "cli", command: "node", args: [fakeJs], input: "stdin" }),
  );
  await setConfigValue(proj, "profiles.claude-balanced.provider", "fake");
  return proj;
}

describe("run-lock wiring: dashboard launch path (runFromSpec)", () => {
  it("refuses a second run on a task already locked by a live holder", async () => {
    const proj = await makeProject();
    try {
      const svc = new RoadmapService(proj);
      await svc.init();
      const task = await svc.addTask({ title: "Shared task", runMode: "supervised" });

      // Simulate holder run #1: claim the lock directly (this process is alive,
      // so the holder is live and non-terminal).
      const holder = await acquireTaskLock(proj, task.id, "holder-run");

      // The dashboard path must refuse to start a second run on the same task.
      // runFromSpec surfaces its typed RunLaunchError (code "task_locked"); the
      // message carries the underlying lock refusal naming the holder run.
      await expect(
        runFromSpec({
          projectRoot: proj,
          task: task.title,
          runId: "second-run",
          taskId: task.id,
        }),
      ).rejects.toMatchObject({
        name: "RunLaunchError",
        code: "task_locked",
        message: expect.stringContaining("holder-run"),
      });

      // Sanity: releasing the holder frees the task again for a future run.
      await releaseTaskLock(holder);
      const reacquire = await acquireTaskLock(proj, task.id, "third-run");
      expect(reacquire.runId).toBe("third-run");
      await releaseTaskLock(reacquire);
    } finally {
      await fs.rm(proj, { recursive: true, force: true }).catch(() => {});
    }
  }, 60_000);
});
