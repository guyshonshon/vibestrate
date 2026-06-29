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
} from "../src/core/run-lock.js";
import { runStatePath, runDir } from "../src/utils/paths.js";
import { applySetup } from "../src/setup/setup-service.js";
import { setConfigValue } from "../src/setup/config-update-service.js";
import { RoadmapService } from "../src/roadmap/roadmap-service.js";
import { runFromSpec } from "../src/core/run-launcher.js";
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
  await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
});

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
      const task = await svc.addTask({ title: "Shared task", kind: "saga" });

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
