import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { spawn, type ChildProcess } from "node:child_process";
import os from "node:os";
import path from "node:path";
import {
  acquireLock,
  isProcessAlive,
  LOCK_HEARTBEAT_STALE_MS,
  readLock,
  releaseLock,
} from "../src/scheduler/scheduler-lock.js";

let root = "";

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "amaco-lock-"));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("scheduler-lock", () => {
  it("acquires the lock on a fresh project", async () => {
    const r = await acquireLock(root, 4242);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.lock.pid).toBe(4242);
      expect(r.reclaimed).toBe(false);
    }
    const persisted = await readLock(root);
    expect(persisted?.pid).toBe(4242);
  });

  it("refuses to acquire when a live holder is on the same host", async () => {
    // process.pid is guaranteed alive.
    const first = await acquireLock(root, process.pid);
    expect(first.ok).toBe(true);
    const second = await acquireLock(root, 99_999);
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.holder.pid).toBe(process.pid);
      expect(second.reason).toBe("already-held");
    }
  });

  it("reclaims a stale lock from a dead pid on the same host", async () => {
    // Write a lock for a pid that won't exist. PID 1 *does* exist on
    // most systems; use a very large number we can be confident is
    // unallocated. Pick 2**31 - 2.
    const dead = 2_147_483_646;
    await mkdir(path.join(root, ".amaco", "scheduler"), { recursive: true });
    await writeFile(
      path.join(root, ".amaco", "scheduler", "lock"),
      JSON.stringify({ pid: dead, host: os.hostname(), startedAt: "x" }),
    );
    const r = await acquireLock(root, process.pid);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.reclaimed).toBe(true);
      expect(r.reclaimReason).toBe("dead-pid");
    }
  });

  it("reclaims a stale live scheduler when its heartbeat stops", async () => {
    let holder: ChildProcess | null = spawn(
      process.execPath,
      ["-e", "setInterval(() => {}, 1000)"],
      { stdio: "ignore" },
    );
    try {
      expect(holder.pid).toBeTruthy();
      const old = new Date(Date.now() - LOCK_HEARTBEAT_STALE_MS - 5000)
        .toISOString();
      await mkdir(path.join(root, ".amaco", "scheduler"), { recursive: true });
      await writeFile(
        path.join(root, ".amaco", "scheduler", "lock"),
        JSON.stringify({ pid: holder.pid, host: os.hostname(), startedAt: old }),
      );
      await writeFile(
        path.join(root, ".amaco", "scheduler", "state.json"),
        JSON.stringify({
          paused: false,
          runningTaskIds: [],
          lastUpdatedAt: old,
          maxConcurrentRuns: 1,
          conflictPolicy: "warn",
          queuePolicy: "fifo",
          sourceQuotas: {},
        }),
      );

      const r = await acquireLock(root, 123_456);
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.reclaimed).toBe(true);
        expect(r.reclaimReason).toBe("stale-heartbeat");
        expect(r.lock.pid).toBe(123_456);
      }
      await waitForDead(holder.pid!);
    } finally {
      if (holder?.pid && isProcessAlive(holder.pid)) {
        try {
          holder.kill("SIGKILL");
        } catch {
          /* ignore */
        }
      }
      holder = null;
    }
  });

  it("does not let an old owner release a newer lock", async () => {
    const first = await acquireLock(root, 2_147_483_646);
    expect(first.ok).toBe(true);
    const second = await acquireLock(root, process.pid);
    expect(second.ok).toBe(true);
    await releaseLock(root, 2_147_483_646);
    const persisted = await readLock(root);
    expect(persisted?.pid).toBe(process.pid);
  });

  it("releaseLock removes the file", async () => {
    await acquireLock(root, process.pid);
    await releaseLock(root);
    expect(await readLock(root)).toBeNull();
  });

  it("isProcessAlive returns true for the current process", () => {
    expect(isProcessAlive(process.pid)).toBe(true);
  });
});

async function waitForDead(pid: number): Promise<void> {
  const deadline = Date.now() + 1000;
  while (Date.now() < deadline) {
    if (!isProcessAlive(pid)) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  expect(isProcessAlive(pid)).toBe(false);
}
